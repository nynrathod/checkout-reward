import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { OrderDto, OrderItemDto } from './dto/order.dto.js';

export interface OrderRow {
  id: string;
  idempotency_key: string;
  cart_id: string;
  coupon_code: string | null;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  created_at: string;
}

export interface OrderItemRow {
  order_id: string;
  product_id: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

@Injectable()
export class OrdersRepository {
  constructor(private readonly db: DatabaseService) {}

  findByKey(idempotencyKey: string): OrderRow | undefined {
    return this.db.connection
      .prepare('SELECT * FROM orders WHERE idempotency_key = ?')
      .get(idempotencyKey) as OrderRow | undefined;
  }

  findById(id: string): OrderRow | undefined {
    return this.db.connection
      .prepare('SELECT * FROM orders WHERE id = ?')
      .get(id) as OrderRow | undefined;
  }

  findItems(orderId: string): OrderItemDto[] {
    return this.db.connection
      .prepare(
        `SELECT product_id, product_name, unit_price_cents, quantity, line_total_cents
           FROM order_items WHERE order_id = ? ORDER BY product_id`,
      )
      .all(orderId) as OrderItemDto[];
  }

  insert(order: OrderRow, items: OrderItemRow[]): void {
    const insertOrder = this.db.connection.prepare(
      `INSERT INTO orders (id, idempotency_key, cart_id, coupon_code,
                           subtotal_cents, discount_cents, total_cents, created_at)
       VALUES (@id, @idempotency_key, @cart_id, @coupon_code,
               @subtotal_cents, @discount_cents, @total_cents, @created_at)`,
    );
    const insertItem = this.db.connection.prepare(
      `INSERT INTO order_items (order_id, product_id, product_name,
                                unit_price_cents, quantity, line_total_cents)
       VALUES (@order_id, @product_id, @product_name,
               @unit_price_cents, @quantity, @line_total_cents)`,
    );

    insertOrder.run(order);
    for (const item of items) insertItem.run(item);
  }

  count(): number {
    return (
      this.db.connection.prepare('SELECT COUNT(*) AS n FROM orders').get() as {
        n: number;
      }
    ).n;
  }
}
