import { Controller, Get, Post } from '@nestjs/common';
import type { CouponDto } from '../coupons/dto/coupon.dto.js';
import { AdminService } from './admin.service.js';
import type { ReportDto } from './dto/admin.dto.js';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('coupons/generate')
  generateCoupon(): CouponDto {
    return this.admin.generateCoupon();
  }

  @Get('report')
  report(): ReportDto {
    return this.admin.report();
  }
}
