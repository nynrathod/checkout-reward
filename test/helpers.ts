import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { DatabaseService } from '../src/database/database.service.js';

export async function createTestApp(): Promise<INestApplication> {
  process.env.DATABASE_PATH = ':memory:';
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export function insertCoupon(
  app: INestApplication,
  code: string,
  percentOff = 10,
  milestone = 1,
): void {
  app
    .get(DatabaseService)
    .connection.prepare(
      'INSERT INTO coupons (code, percent_off, milestone, generated_at) VALUES (?, ?, ?, ?)',
    )
    .run(code, percentOff, milestone, new Date().toISOString());
}
