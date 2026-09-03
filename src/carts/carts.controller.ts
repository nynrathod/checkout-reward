import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto.js';
import type { CartViewDto } from './dto/cart.dto.js';
import { CartsService } from './carts.service.js';

@Controller('carts')
export class CartsController {
  constructor(private readonly carts: CartsService) {}

  @Post()
  create(): CartViewDto {
    return this.carts.create();
  }

  @Get(':id')
  get(@Param('id') id: string): CartViewDto {
    return this.carts.get(id);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() dto: AddCartItemDto): CartViewDto {
    return this.carts.addItem(id, dto);
  }

  @Patch(':id/items/:productId')
  updateItem(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ): CartViewDto {
    return this.carts.updateItem(id, productId, dto.quantity);
  }

  @Delete(':id/items/:productId')
  removeItem(
    @Param('id') id: string,
    @Param('productId') productId: string,
  ): CartViewDto {
    return this.carts.removeItem(id, productId);
  }
}
