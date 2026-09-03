import { Controller, Get, Param } from '@nestjs/common';
import type { ProductDto } from './dto/product.dto.js';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(): ProductDto[] {
    return this.products.list();
  }

  @Get(':id')
  get(@Param('id') id: string): ProductDto {
    return this.products.get(id);
  }
}
