import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CheckoutRequestDto } from './dto/order.dto.js';
import type { OrderDto } from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // 201 = fresh order. 200 = replay. The header tells the client they already did this.
  @Post('carts/:cartId/checkout')
  checkout(
    @Param('cartId') cartId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CheckoutRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): OrderDto {
    const { order, replayed } = this.orders.checkout(
      cartId,
      idempotencyKey,
      dto.coupon_code,
    );
    if (replayed) {
      res.set('x-idempotent-replay', 'true');
      res.status(200);
    } else {
      res.status(201);
    }
    return order;
  }

  @Get('orders/:id')
  get(@Param('id') id: string): OrderDto {
    return this.orders.getOrder(id);
  }
}
