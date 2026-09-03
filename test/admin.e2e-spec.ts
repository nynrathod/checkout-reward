import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers.js';

describe('Admin: coupon generation and report (e2e)', () => {
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

  function couponCount(): number {
    return (
      db().prepare('SELECT COUNT(*) AS n FROM coupons').get() as { n: number }
    ).n;
  }

  async function cartWith(
    productId: string,
    quantity: number,
  ): Promise<string> {
    const res = await request(server).post('/carts');
    const cartId = res.body.id as string;
    await request(server)
      .post(`/carts/${cartId}/items`)
      .send({ product_id: productId, quantity })
      .expect(201);
    return cartId;
  }

  function checkout(cartId: string, idemKey: string, couponCode?: string) {
    return request(server)
      .post(`/carts/${cartId}/checkout`)
      .set('Idempotency-Key', idemKey)
      .send(couponCode ? { coupon_code: couponCode } : {});
  }

  it('rejects generation before the first milestone is reached', async () => {
    await checkout(await cartWith('p_cable', 2), 'adm_1').expect(201);
    await checkout(await cartWith('p_cable', 2), 'adm_2').expect(201);

    const res = await request(server)
      .post('/admin/coupons/generate')
      .expect(409);
    expect(res.body.error.code).toBe('NO_ELIGIBLE_MILESTONE');
    expect(res.body.error.details).toMatchObject({
      milestone: 1,
      orders_placed: 2,
      required_orders: 5,
    });
    expect(couponCount()).toBe(0);
  });

  it('generates one coupon when the milestone is reached, and only one', async () => {
    for (let i = 3; i <= 5; i++) {
      await checkout(await cartWith('p_cable', 2), `adm_${i}`).expect(201); // 5 orders total
    }

    const res = await request(server)
      .post('/admin/coupons/generate')
      .expect(201);
    expect(res.body).toMatchObject({
      percent_off: 10,
      milestone: 1,
      status: 'available',
      redeemed_at: null,
    });
    expect(res.body.code).toMatch(/^ms1_/);
    expect(couponCount()).toBe(1);

    const again = await request(server)
      .post('/admin/coupons/generate')
      .expect(409);
    expect(again.body.error.code).toBe('NO_ELIGIBLE_MILESTONE');
    expect(again.body.error.details).toMatchObject({
      milestone: 2,
      required_orders: 10,
    });
    expect(couponCount()).toBe(1);
  });

  it('redeems the milestone coupon and reports reconciled numbers', async () => {
    const code = (
      db().prepare('SELECT code FROM coupons WHERE milestone = 1').get() as {
        code: string;
      }
    ).code;

    const order = await checkout(
      await cartWith('p_headphones', 1),
      'adm_6',
      code,
    ).expect(201);
    const discount = Math.floor((24999 * 10) / 100); // 2499
    expect(order.body.discount_cents).toBe(discount);

    const report = await request(server).get('/admin/report').expect(200);

    const gross = 2598 * 5 + 24999; // five cable orders + headphones
    expect(report.body).toEqual({
      orders_placed: 6,
      revenue: {
        gross_cents: gross,
        discount_cents: discount,
        net_cents: gross - discount,
      },
      products: [
        {
          product_id: 'p_cable',
          product_name: 'USB-C Cable 2m',
          quantity_sold: 10,
        },
        {
          product_id: 'p_headphones',
          product_name: 'Noise-Cancelling Headphones',
          quantity_sold: 1,
        },
      ],
      coupons: { generated: 1, available: 0, redeemed: 1 },
    });

    const lineSum = (
      db()
        .prepare(
          'SELECT COALESCE(SUM(line_total_cents), 0) AS s FROM order_items',
        )
        .get() as { s: number }
    ).s;
    expect(lineSum).toBe(report.body.revenue.gross_cents);
    expect(
      report.body.revenue.gross_cents - report.body.revenue.discount_cents,
    ).toBe(report.body.revenue.net_cents);

    const second = await request(server).get('/admin/report').expect(200);
    expect(second.body).toEqual(report.body);
    expect(
      (db().prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number })
        .n,
    ).toBe(6);
  });

  it('concurrent generation requests reward a milestone exactly once', async () => {
    // Orders 7-10: milestone 2 becomes eligible.
    for (let i = 7; i <= 10; i++) {
      await checkout(await cartWith('p_mouse', 1), `adm_${i}`).expect(201);
    }

    const [a, b] = await Promise.all([
      request(server).post('/admin/coupons/generate'),
      request(server).post('/admin/coupons/generate'),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const winner = a.status === 201 ? a : b;
    expect(winner.body.milestone).toBe(2);

    const loser = a.status === 201 ? b : a;
    expect([
      'COUPON_MILESTONE_ALREADY_REWARDED',
      'NO_ELIGIBLE_MILESTONE',
    ]).toContain(loser.body.error.code);

    const ms2 = (
      db()
        .prepare('SELECT COUNT(*) AS n FROM coupons WHERE milestone = 2')
        .get() as { n: number }
    ).n;
    expect(ms2).toBe(1);
    expect(couponCount()).toBe(2);

    const report = await request(server).get('/admin/report').expect(200);
    expect(report.body.coupons).toEqual({
      generated: 2,
      available: 1,
      redeemed: 1,
    });
    expect(report.body.orders_placed).toBe(10);
    expect(
      report.body.revenue.gross_cents - report.body.revenue.discount_cents,
    ).toBe(report.body.revenue.net_cents);
  });
});
