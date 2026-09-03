import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module.js';
import { CartsController } from './carts.controller.js';
import { CartsRepository } from './carts.repository.js';
import { CartsService } from './carts.service.js';

@Module({
  imports: [ProductsModule],
  controllers: [CartsController],
  providers: [CartsRepository, CartsService],
  exports: [CartsService],
})
export class CartsModule {}
