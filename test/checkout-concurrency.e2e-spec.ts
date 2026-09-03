import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp, insertCoupon } from './helpers.js';

describe('Checkout concurrency (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  async function newCartWithItems(
    items: { product_id: string; quantity: number }[],
  ): Promise<string> {
    const res = await request(server).post('/carts');
    const cartId = res.body.id as string;
    for (const item of items) {
      await request(server)
        .post(`/carts/${cartId}/items`)
        .send(item)
        .expect(201);
    }
    return cartId;
  }

  function db(): DatabaseService['connection'] {
    return app.get(DatabaseService).connection;
  }

  it('never oversells: 8 concurrent checkouts for 3 units', async () => {
    const carts = [];
    for (let i = 0; i < 8; i++) {
      carts.push(
        await newCartWithItems([{ product_id: 'p_deskmat', quantity: 1 }]),
      );
    }

    const responses = await Promise.all(
      carts.map((cartId, i) =>
        request(server)
          .post(`/carts/${cartId}/checkout`)
          .set('Idempotency-Key', `oversell_${i}`)
          .send({}),
      ),
    );

    const wins = responses.filter((r) => r.status === 201);
    const losses = responses.filter((r) => r.status === 409);
    expect(wins).toHaveLength(3);
    expect(losses).toHaveLength(5);
    expect(
      losses.every((r) => r.body.error.code === 'INSUFFICIENT_INVENTORY'),
    ).toBe(true);

    const inventory = db()
      .prepare("SELECT inventory FROM products WHERE id = 'p_deskmat'")
      .get() as { inventory: number };
    expect(inventory.inventory).toBe(0);

    const sold = db()
      .prepare(
        "SELECT COALESCE(SUM(quantity), 0) AS q FROM order_items WHERE product_id = 'p_deskmat'",
      )
      .get() as { q: number };
    expect(sold.q).toBe(3);

    const orders = db().prepare('SELECT COUNT(*) AS n FROM orders').get() as {
      n: number;
    };
    expect(orders.n).toBe(3);
  });

  it('redeems a coupon exactly once under concurrent checkouts', async () => {
    insertCoupon(app, 'RACE50', 50, 1);
    const mouseBefore = (
      db()
        .prepare("SELECT inventory FROM products WHERE id = 'p_mouse'")
        .get() as { inventory: number }
    ).inventory;

    const cartA = await newCartWithItems([
      { product_id: 'p_mouse', quantity: 1 },
    ]);
    const cartB = await newCartWithItems([
      { product_id: 'p_mouse', quantity: 1 },
    ]);

    const [a, b] = await Promise.all([
      request(server)
        .post(`/carts/${cartA}/checkout`)
        .set('Idempotency-Key', 'coupon_race_a')
        .send({ coupon_code: 'RACE50' }),
      request(server)
        .post(`/carts/${cartB}/checkout`)
        .set('Idempotency-Key', 'coupon_race_b')
        .send({ coupon_code: 'RACE50' }),
    ]);

    const winner = [a, b].find((r) => r.status === 201);
    const loser = [a, b].find((r) => r.status !== 201);
    expect(winner).toBeDefined();
    expect(loser!.status).toBe(409);
    expect(loser!.body.error.code).toBe('COUPON_ALREADY_REDEEMED');

    const coupon = db()
      .prepare("SELECT redeemed_at FROM coupons WHERE code = 'RACE50'")
      .get() as { redeemed_at: string | null };
    expect(coupon.redeemed_at).not.toBeNull();

    const loserCartId = loser === a ? cartA : cartB;
    const cart = await request(server).get(`/carts/${loserCartId}`).expect(200);
    expect(cart.body.status).toBe('open');

    const inventory = db()
      .prepare("SELECT inventory FROM products WHERE id = 'p_mouse'")
      .get() as { inventory: number };
    expect(inventory.inventory).toBe(mouseBefore - 1); // only the winner's unit consumed
  });

  it('concurrent retries with the same key create exactly one order', async () => {
    const cartId = await newCartWithItems([
      { product_id: 'p_headphones', quantity: 2 },
    ]);

    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(server)
          .post(`/carts/${cartId}/checkout`)
          .set('Idempotency-Key', 'retry_storm')
          .send({}),
      ),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([
      200, 200, 200, 200, 200, 201,
    ]);
    const orderIds = new Set(responses.map((r) => r.body.id));
    expect(orderIds.size).toBe(1);

    const orders = db()
      .prepare(
        "SELECT COUNT(*) AS n FROM orders WHERE idempotency_key = 'retry_storm'",
      )
      .get() as { n: number };
    expect(orders.n).toBe(1);
    const inventory = db()
      .prepare("SELECT inventory FROM products WHERE id = 'p_headphones'")
      .get() as { inventory: number };
    expect(inventory.inventory).toBe(10);
  });
});
