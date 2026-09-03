import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface CouponRow {
  code: string;
  percent_off: number;
  milestone: number;
  redeemed_at: string | null;
  generated_at: string;
}

@Injectable()
export class CouponsRepository {
  constructor(private readonly db: DatabaseService) {}

  findByCode(code: string): CouponRow | undefined {
    return this.db.connection
      .prepare(
        'SELECT code, percent_off, milestone, redeemed_at, generated_at FROM coupons WHERE code = ?',
      )
      .get(code) as CouponRow | undefined;
  }

  redeem(code: string, redeemedAt: string): number {
    return this.db.connection
      .prepare(
        'UPDATE coupons SET redeemed_at = ? WHERE code = ? AND redeemed_at IS NULL',
      )
      .run(redeemedAt, code).changes;
  }
}
