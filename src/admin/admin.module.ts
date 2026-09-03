import { Module } from '@nestjs/common';
import { CouponsModule } from '../coupons/coupons.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [OrdersModule, CouponsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
