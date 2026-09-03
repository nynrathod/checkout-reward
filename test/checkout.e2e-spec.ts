import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp, insertCoupon } from './helpers.js';

describe('Checkout (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  function db(): DatabaseService['connection'] {
    return app.get(DatabaseService).connection;
  }

  function inventoryOf(productId: string): number {
    return (
      db()
        .prepare('SELECT inventory FROM products WHERE id = ?')
        .get(productId) as { inventory: number }
    ).inventory;
  }

  function orderCount(): number {
    return (
      db().prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }
    ).n;
  }

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

  it('checks out a cart: order snapshot, totals, inventory decrement', async () => {
    const cartId = await newCartWithItems([
      { product_id: 'p_keyboard', quantity: 1 },
      { product_id: 'p_cable', quantity: 2 },
    ]);
    insertCoupon(app, 'WELCOME10', 10, 1);

    const res = await request(server)
      .post(`/carts/${cartId}/checkout`)
      .set('Idempotency-Key', 'key_happy')
      .send({ coupon_code: 'WELCOME10' })
      .expect(201);

    const subtotal = 8999 + 1299 * 2; // 11597
    const discount = Math.floor((subtotal * 10) / 100); // 1159
    expect(res.body).toMatchObject({
      cart_id: cartId,
      status: 'placed',
      coupon_code: 'WELCOME10',
      subtotal_cents: subtotal,
      discount_cents: discount,
      total_cents: subtotal - discount,
    });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      product_id: 'p_cable',
      product_name: 'USB-C Cable 2m',
      unit_price_cents: 1299,
      quantity: 2,
      line_total_cents: 2598,
    });

    expect(inventoryOf('p_keyboard')).toBe(39);
    const cart = await request(server).get(`/carts/${cartId}`).expect(200);
    expect(cart.body.status).toBe('checked_out');

    const order = await request(server)
      .get(`/orders/${res.body.id}`)
      .expect(200);
    expect(order.body).toEqual(res.body);
  });

  it('rounds discounts deterministically (floor to the cent)', async () => {
    const cartId = await newCartWithItems([
      { product_id: 'p_keyboard', quantity: 1 },
    ]);
    insertCoupon(app, 'ROUND10', 10, 2); // 10% of 8999 = 899.9 -> 899

    const res = await request(server)
      .post(`/carts/${cartId}/checkout`)
      .set('Idempotency-Key', 'key_round')
      .send({ coupon_code: 'ROUND10' })
      .expect(201);
    expect(res.body.discount_cents).toBe(899);
    expect(res.body.total_cents).toBe(8999 - 899);
  });

  it('retries with the same key return the original order, no side effects', async () => {
    const ordersBefore = orderCount();
    const mouseBefore = inventoryOf('p_mouse');
    const cartId = await newCartWithItems([
      { product_id: 'p_mouse', quantity: 2 },
    ]);

    const first = await request(server)
      .post(`/carts/${cartId}/checkout`)
      .set('Idempotency-Key', 'key_retry')
      .send({})
      .expect(201);

    const second = await request(server)
      .post(`/carts/${cartId}/checkout`)
      .set('Idempotency-Key', 'key_retry')
      .send({})
      .expect(200);

    expect(second.body.id).toBe(first.body.id);
    expect(second.headers['x-idempotent-replay']).toBe('true');
    expect(inventoryOf('p_mouse')).toBe(mouseBefore - 2); // charged once
    expect(orderCount()).toBe(ordersBefore + 1); // one order, not two
  });

  it('rejects a key reused with a different request', async () => {
    const otherCart = await newCartWithItems([
      { product_id: 'p_cable', quantity: 1 },
    ]);
    const res = await request(server)
      .post(`/carts/${otherCart}/checkout`)
      .set('Idempotency-Key', 'key_retry') // bound to the mouse cart above
      .send({})
      .expect(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
  });

  it('rejects checkout without an Idempotency-Key, leaving no side effects', async () => {
    const cableBefore = inventoryOf('p_cable');
    const cartId = await newCartWithItems([
      { product_id: 'p_cable', quantity: 1 },
    ]);

    const res = await request(server)
      .post(`/carts/${cartId}/checkout`)
      .send({})
      .expect(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const cart = await request(server).get(`/carts/${cartId}`).expect(200);
    expect(cart.body.status).toBe('open');
    expect(inventoryOf('p_cable')).toBe(cableBefore);
  });

  it('rejects a second checkout of the same cart and mutations on it', async () => {
    const cartId = await newCartWithItems([
      { product_id: 'p_cable', quantity: 1 },
    ]);
    await request(server)
      .post(`/carts/${cartId}/checkout`)
      .set('Idempotency-Key', 'key_once_1')
      .send({})
      .expect(201);

    const again = await request(server)
      .post(`/carts/${cartId}/checkout`)
      .set('Idempotency-Key', 'key_once_2')
      .send({})
      .expect(409);
    expect(again.body.error.code).toBe('CART_NOT_OPEN');

    const mutate = await request(server)
      .post(`/carts/${cartId}/items`)
      .send({ product_id: 'p_cable', quantity: 1 })
      .expect(409);
    expect(mutate.body.error.code).toBe('CART_NOT_OPEN');
  });

  it('rejects checkout of an empty cart', async () => {
    const res = await request(server).post('/carts');
    const cartId = res.body.id as string;
    const checkout = await request(server)
      .post(`/carts/${cartId}/checkout`)
      .set('Idempotency-Key', 'key_empty')
      .send({})
      .expect(422);
    expect(checkout.body.error.code).toBe('CART_EMPTY');
  });

  it('does not consume a coupon when the checkout fails on inventory', async () => {
    expect(inventoryOf('p_deskmat')).toBe(3);
    insertCoupon(app, 'SAFE10', 10, 3);

    const doomed = await newCartWithItems([
      { product_id: 'p_deskmat', quantity: 2 },
    ]);
    const drainer = await newCartWithItems([
      { product_id: 'p_deskmat', quantity: 2 },
    ]);

    await request(server)
      .post(`/carts/${drainer}/checkout`)
      .set('Idempotency-Key', 'key_drain')
      .send({})
      .expect(201);
    expect(inventoryOf('p_deskmat')).toBe(1);

    const failed = await request(server)
      .post(`/carts/${doomed}/checkout`)
      .set('Idempotency-Key', 'key_doomed')
      .send({ coupon_code: 'SAFE10' })
      .expect(409);
    expect(failed.body.error.code).toBe('INSUFFICIENT_INVENTORY');

    const coupon = db()
      .prepare("SELECT redeemed_at FROM coupons WHERE code = 'SAFE10'")
      .get() as { redeemed_at: string | null };
    expect(coupon.redeemed_at).toBeNull();
    const cart = await request(server).get(`/carts/${doomed}`).expect(200);
    expect(cart.body.status).toBe('open');

    // The coupon still redeems for a valid checkout afterwards.
    const lucky = await newCartWithItems([
      { product_id: 'p_cable', quantity: 1 },
    ]);
    await request(server)
      .post(`/carts/${lucky}/checkout`)
      .set('Idempotency-Key', 'key_lucky')
      .send({ coupon_code: 'SAFE10' })
      .expect(201);
  });

  it('rejects unknown and already-redeemed coupons', async () => {
    const cartA = await newCartWithItems([
      { product_id: 'p_cable', quantity: 1 },
    ]);
    const unknown = await request(server)
      .post(`/carts/${cartA}/checkout`)
      .set('Idempotency-Key', 'key_unknown_coupon')
      .send({ coupon_code: 'NOPE' })
      .expect(404);
    expect(unknown.body.error.code).toBe('COUPON_NOT_FOUND');

    insertCoupon(app, 'SPENT10', 10, 4);
    const cartB = await newCartWithItems([
      { product_id: 'p_cable', quantity: 1 },
    ]);
    await request(server)
      .post(`/carts/${cartB}/checkout`)
      .set('Idempotency-Key', 'key_spend')
      .send({ coupon_code: 'SPENT10' })
      .expect(201);

    const cartC = await newCartWithItems([
      { product_id: 'p_cable', quantity: 1 },
    ]);
    const res = await request(server)
      .post(`/carts/${cartC}/checkout`)
      .set('Idempotency-Key', 'key_spend_again')
      .send({ coupon_code: 'SPENT10' })
      .expect(409);
    expect(res.body.error.code).toBe('COUPON_ALREADY_REDEEMED');
  });

  it('keeps order snapshots stable after product data changes', async () => {
    const cartId = await newCartWithItems([
      { product_id: 'p_monitor', quantity: 1 },
    ]);
    const order = await request(server)
      .post(`/carts/${cartId}/checkout`)
      .set('Idempotency-Key', 'key_snapshot')
      .send({})
      .expect(201);

    db()
      .prepare(
        "UPDATE products SET price_cents = 100, name = 'Renamed' WHERE id = 'p_monitor'",
      )
      .run();

    const refetched = await request(server)
      .get(`/orders/${order.body.id}`)
      .expect(200);
    expect(refetched.body.items[0]).toMatchObject({
      product_name: '27-inch 4K Monitor',
      unit_price_cents: 32999,
    });
    expect(refetched.body.total_cents).toBe(32999);
  });

  it('404s on unknown orders', async () => {
    const res = await request(server).get('/orders/ord_none').expect(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
  });
});
