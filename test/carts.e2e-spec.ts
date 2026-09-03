import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers.js';

describe('Carts (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let cartId: string;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function newCart(): Promise<string> {
    const res = await request(app.getHttpServer()).post('/carts').expect(201);
    return res.body.id as string;
  }

  it('creates an empty cart', async () => {
    const res = await request(app.getHttpServer()).post('/carts').expect(201);
    expect(res.body).toMatchObject({
      status: 'open',
      items: [],
      item_count: 0,
      total_cents: 0,
    });
    expect(res.body.id).toMatch(/^cart_/);
  });

  it('adds items and computes live prices and totals', async () => {
    cartId = await newCart();
    const res = await request(app.getHttpServer())
      .post(`/carts/${cartId}/items`)
      .send({ product_id: 'p_keyboard', quantity: 2 })
      .expect(201);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      product_id: 'p_keyboard',
      unit_price_cents: 8999,
      quantity: 2,
      line_total_cents: 17998,
    });
    expect(res.body.total_cents).toBe(17998);
  });

  it('increments quantity when adding the same product twice', async () => {
    const res = await request(app.getHttpServer())
      .post(`/carts/${cartId}/items`)
      .send({ product_id: 'p_keyboard', quantity: 1 })
      .expect(201);
    expect(res.body.items[0].quantity).toBe(3);
    expect(res.body.total_cents).toBe(8999 * 3);
  });

  it('rejects unknown products with PRODUCT_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .post(`/carts/${cartId}/items`)
      .send({ product_id: 'p_ghost', quantity: 1 })
      .expect(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('rejects zero, negative and fractional quantities', async () => {
    for (const quantity of [0, -1, 1.5]) {
      const res = await request(app.getHttpServer())
        .post(`/carts/${cartId}/items`)
        .send({ product_id: 'p_mouse', quantity })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('rejects quantities above current inventory (best-effort guard)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/carts/${cartId}/items`)
      .send({ product_id: 'p_deskmat', quantity: 4 })
      .expect(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_INVENTORY');
    expect(res.body.error.details).toMatchObject({
      available: 3,
      requested: 4,
    });
  });

  it('updates a line quantity and removes a line', async () => {
    const updated = await request(app.getHttpServer())
      .patch(`/carts/${cartId}/items/p_keyboard`)
      .send({ quantity: 1 })
      .expect(200);
    expect(updated.body.items[0].quantity).toBe(1);

    const removed = await request(app.getHttpServer())
      .delete(`/carts/${cartId}/items/p_keyboard`)
      .expect(200);
    expect(removed.body.items).toHaveLength(0);
    expect(removed.body.total_cents).toBe(0);
  });

  it('404s when updating a product not in the cart', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/carts/${cartId}/items/p_mouse`)
      .send({ quantity: 1 })
      .expect(404);
    expect(res.body.error.code).toBe('CART_ITEM_NOT_FOUND');
  });

  it('404s on unknown carts', async () => {
    const res = await request(app.getHttpServer())
      .get('/carts/cart_none')
      .expect(404);
    expect(res.body.error.code).toBe('CART_NOT_FOUND');
  });

  it('reflects a product price change in the cart view immediately', async () => {
    cartId = await newCart();
    await request(app.getHttpServer())
      .post(`/carts/${cartId}/items`)
      .send({ product_id: 'p_cable', quantity: 2 })
      .expect(201);

    db.connection
      .prepare("UPDATE products SET price_cents = 1999 WHERE id = 'p_cable'")
      .run();

    const res = await request(app.getHttpServer())
      .get(`/carts/${cartId}`)
      .expect(200);
    expect(res.body.items[0].unit_price_cents).toBe(1999);
    expect(res.body.total_cents).toBe(1999 * 2);
  });
});
