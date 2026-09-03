import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers.js';

describe('Products (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('seeds at least five products, one with limited inventory', async () => {
    const res = await request(app.getHttpServer()).get('/products').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    expect(
      res.body.find((p: { id: string }) => p.id === 'p_deskmat').inventory,
    ).toBe(3);
  });

  it('returns a product by id', async () => {
    const res = await request(app.getHttpServer())
      .get('/products/p_keyboard')
      .expect(200);
    expect(res.body).toMatchObject({ id: 'p_keyboard', price_cents: 8999 });
  });

  it('returns the error envelope for unknown products', async () => {
    const res = await request(app.getHttpServer())
      .get('/products/p_unknown')
      .expect(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });
});
