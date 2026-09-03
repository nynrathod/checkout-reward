import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../common/errors/domain.error.js';
import { ErrorCodes } from '../common/errors/error-codes.js';
import { newId, nowIso } from '../common/utils/ids.js';
import { isUniqueViolation } from '../common/utils/sqlite.js';
import type { AppConfig } from '../config/configuration.js';
import type { CouponDto } from '../coupons/dto/coupon.dto.js';
import { CouponsRepository } from '../coupons/coupons.repository.js';
import { DatabaseService } from '../database/database.service.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import type { ReportDto } from './dto/admin.dto.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly coupons: CouponsRepository,
    private readonly db: DatabaseService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  generateCoupon(): CouponDto {
    const n = this.config.get('couponMilestoneN', { infer: true });
    const percentOff = this.config.get('couponPercentOff', { infer: true });

    try {
      // Check the milestone, then insert. The DB constraint stops duplicates.
      const coupon = this.db.transaction(() => {
        const ordersPlaced = this.orders.count();
        const milestone = this.coupons.maxMilestone() + 1;

        // Not enough orders yet? Walk away.
        if (ordersPlaced < milestone * n) {
          throw DomainError.conflict(
            ErrorCodes.NO_ELIGIBLE_MILESTONE,
            `Milestone ${milestone} is not reached: ${milestone * n} placed orders required, ${ordersPlaced} so far`,
            {
              milestone,
              orders_placed: ordersPlaced,
              required_orders: milestone * n,
            },
          );
        }

        const row = {
          code: newId(`ms${milestone}`),
          percent_off: percentOff,
          milestone,
          redeemed_at: null as string | null,
          generated_at: nowIso(),
        };
        this.coupons.insertGenerated(
          row.code,
          row.percent_off,
          row.milestone,
          row.generated_at,
        );
        return row;
      });
      return { ...coupon, status: 'available' as const };
    } catch (error) {
      // Two admins hit generate at once. The DB blocked the loser. Tell them nicely.
      if (isUniqueViolation(error)) {
        const milestone = this.coupons.maxMilestone();
        const winner = this.coupons.findByMilestone(milestone);
        if (winner) {
          throw DomainError.conflict(
            ErrorCodes.COUPON_MILESTONE_ALREADY_REWARDED,
            `Milestone ${milestone} was already rewarded with coupon ${winner.code}`,
            { milestone, existing_code: winner.code },
          );
        }
      }
      throw error;
    }
  }

  // Read-only. Hit it a thousand times, state never changes.
  report(): ReportDto {
    return {
      orders_placed: this.orders.count(),
      revenue: this.orders.revenueTotals(),
      products: this.orders.quantityByProduct(),
      coupons: this.coupons.counts(),
    };
  }
}
