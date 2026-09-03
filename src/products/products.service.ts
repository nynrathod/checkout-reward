import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain.error.js';
import { ErrorCodes } from '../common/errors/error-codes.js';
import type { ProductDto } from './product.dto.js';
import { ProductsRepository } from './products.repository.js';

@Injectable()
export class ProductsService {
  constructor(private readonly products: ProductsRepository) {}

  list(): ProductDto[] {
    return this.products.findAll();
  }

  get(id: string): ProductDto {
    const row = this.products.findById(id);
    if (!row) {
      throw DomainError.notFound(
        ErrorCodes.PRODUCT_NOT_FOUND,
        `Product ${id} does not exist`,
      );
    }
    return row;
  }
}
