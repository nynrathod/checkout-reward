import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { ProductRow } from './dto/product.dto.js';

@Injectable()
export class ProductsRepository {
  constructor(private readonly db: DatabaseService) {}

  findAll(): ProductRow[] {
    return this.db.connection
      .prepare(
        'SELECT id, name, price_cents, inventory FROM products ORDER BY id',
      )
      .all() as ProductRow[];
  }

  findById(id: string): ProductRow | undefined {
    return this.db.connection
      .prepare(
        'SELECT id, name, price_cents, inventory FROM products WHERE id = ?',
      )
      .get(id) as ProductRow | undefined;
  }

  // Oversell guard. The WHERE clause stops inventory going negative.
  // If two users race for the last item, only one UPDATE works.
  decrementInventory(productId: string, quantity: number): number {
    return this.db.connection
      .prepare(
        'UPDATE products SET inventory = inventory - ? WHERE id = ? AND inventory >= ?',
      )
      .run(quantity, productId, quantity).changes;
  }
}
