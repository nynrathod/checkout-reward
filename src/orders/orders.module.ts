import { Module } from '@nestjs/common';
import { CartsModule } from '../carts/carts.module.js';
import { CouponsModule } from '../coupons/coupons.module.js';
import { ProductsModule } from '../products/products.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';
import { IdempotencyCache } from './idempotency.cache.js';

@Module({
  imports: [CartsModule, ProductsModule, CouponsModule],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService, IdempotencyCache],
  exports: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
