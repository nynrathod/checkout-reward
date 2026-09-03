import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface CartRow {
  id: string;
  status: 'open' | 'checked_out';
}

export interface CartLineRow {
  product_id: string;
  name: string;
  price_cents: number;
  inventory: number;
  quantity: number;
}

@Injectable()
export class CartsRepository {
  constructor(private readonly db: DatabaseService) {}

  insertCart(id: string): void {
    this.db.connection
      .prepare('INSERT INTO carts (id, status) VALUES (?, ?)')
      .run(id, 'open');
  }

  findCart(id: string): CartRow | undefined {
    return this.db.connection
      .prepare('SELECT id, status FROM carts WHERE id = ?')
      .get(id) as CartRow | undefined;
  }

  upsertItem(cartId: string, productId: string, quantity: number): void {
    this.db.connection
      .prepare(
        `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)
         ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
      )
      .run(cartId, productId, quantity);
  }

  findItemQuantity(cartId: string, productId: string): number | undefined {
    const row = this.db.connection
      .prepare(
        'SELECT quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
      )
      .get(cartId, productId) as { quantity: number } | undefined;
    return row?.quantity;
  }

  setItemQuantity(cartId: string, productId: string, quantity: number): void {
    this.db.connection
      .prepare(
        'UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?',
      )
      .run(quantity, cartId, productId);
  }

  deleteItem(cartId: string, productId: string): number {
    return this.db.connection
      .prepare('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?')
      .run(cartId, productId).changes;
  }

  findLines(cartId: string): CartLineRow[] {
    return this.db.connection
      .prepare(
        `SELECT ci.product_id, p.name, p.price_cents, p.inventory, ci.quantity
           FROM cart_items ci
           JOIN products p ON p.id = ci.product_id
          WHERE ci.cart_id = ?
          ORDER BY ci.product_id`,
      )
      .all(cartId) as CartLineRow[];
  }

  markCheckedOut(cartId: string): number {
    return this.db.connection
      .prepare(
        "UPDATE carts SET status = 'checked_out' WHERE id = ? AND status = 'open'",
      )
      .run(cartId).changes;
  }
}
