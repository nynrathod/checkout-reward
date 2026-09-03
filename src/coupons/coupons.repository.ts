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

  findByMilestone(milestone: number): CouponRow | undefined {
    return this.db.connection
      .prepare(
        'SELECT code, percent_off, milestone, redeemed_at, generated_at FROM coupons WHERE milestone = ?',
      )
      .get(milestone) as CouponRow | undefined;
  }

  maxMilestone(): number {
    return (
      this.db.connection
        .prepare('SELECT COALESCE(MAX(milestone), 0) AS m FROM coupons')
        .get() as { m: number }
    ).m;
  }

  insertGenerated(
    code: string,
    percentOff: number,
    milestone: number,
    generatedAt: string,
  ): void {
    this.db.connection
      .prepare(
        'INSERT INTO coupons (code, percent_off, milestone, generated_at) VALUES (?, ?, ?, ?)',
      )
      .run(code, percentOff, milestone, generatedAt);
  }

  counts(): { generated: number; available: number; redeemed: number } {
    return this.db.connection
      .prepare(
        `SELECT COUNT(*) AS generated,
                COALESCE(SUM(redeemed_at IS NULL), 0) AS available,
                COALESCE(SUM(redeemed_at IS NOT NULL), 0) AS redeemed
           FROM coupons`,
      )
      .get() as { generated: number; available: number; redeemed: number };
  }

  // Atomic claim. WHERE redeemed_at IS NULL means only one checkout can win.
  // Returns 1 if we won, 0 if we lost. The caller rolls back on 0.
  redeem(code: string, redeemedAt: string): number {
    return this.db.connection
      .prepare(
        'UPDATE coupons SET redeemed_at = ? WHERE code = ? AND redeemed_at IS NULL',
      )
      .run(redeemedAt, code).changes;
  }
}
