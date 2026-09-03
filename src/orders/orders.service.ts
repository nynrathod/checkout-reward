import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain.error.js';
import { ErrorCodes } from '../common/errors/error-codes.js';
import { newId, nowIso } from '../common/utils/ids.js';

import { CartsRepository } from '../carts/carts.repository.js';
import { CouponsRepository, CouponRow } from '../coupons/coupons.repository.js';
import { DatabaseService } from '../database/database.service.js';
import { ProductsRepository } from '../products/products.repository.js';
import type { OrderDto, OrderItemDto } from './dto/order.dto.js';
import { OrdersRepository, OrderRow } from './orders.repository.js';
import { discountCents } from '../common/utils/money.js';
import { isUniqueViolation } from '../common/utils/sqlite.js';

export interface CheckoutResult {
  order: OrderDto;
  replayed: boolean;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly carts: CartsRepository,
    private readonly products: ProductsRepository,
    private readonly coupons: CouponsRepository,
    private readonly orders: OrdersRepository,
    private readonly db: DatabaseService,
  ) {}

  checkout(
    cartId: string,
    idempotencyKey: string | undefined,
    couponCode?: string,
  ): CheckoutResult {
    // No key? No checkout. We refuse to guess if a retry is a duplicate.
    if (!idempotencyKey) {
      throw DomainError.badRequest(
        ErrorCodes.IDEMPOTENCY_KEY_REQUIRED,
        'Header "Idempotency-Key" is required for checkout',
      );
    }

    // Already saw this request? Just return the original order. No double-charging.
    const existing = this.orders.findByKey(idempotencyKey);
    if (existing) {
      this.assertSameKeyRequest(existing, cartId, couponCode);
      return { order: this.toDto(existing), replayed: true };
    }

    // Basic checks before we open a transaction. Fail fast.
    const cart = this.carts.findCart(cartId);
    if (!cart) {
      throw DomainError.notFound(
        ErrorCodes.CART_NOT_FOUND,
        `Cart ${cartId} does not exist`,
      );
    }
    if (couponCode) {
      const coupon = this.coupons.findByCode(couponCode);
      if (!coupon) {
        throw DomainError.notFound(
          ErrorCodes.COUPON_NOT_FOUND,
          `Coupon ${couponCode} does not exist`,
        );
      }
      if (coupon.redeemed_at) {
        throw DomainError.conflict(
          ErrorCodes.COUPON_ALREADY_REDEEMED,
          `Coupon ${couponCode} has already been redeemed`,
        );
      }
    }

    try {
      // One transaction for everything. If anything fails, it all rolls back.
      const order = this.db.transaction(() =>
        this.placeOrder(cartId, idempotencyKey, couponCode),
      );
      return { order, replayed: false };
    } catch (error) {
      // Race condition: two requests hit the DB at the exact same time.
      // The winner stays, the loser acts like a retry.
      if (isUniqueViolation(error)) {
        const winner = this.orders.findByKey(idempotencyKey);
        if (winner) {
          this.assertSameKeyRequest(winner, cartId, couponCode);
          return { order: this.toDto(winner), replayed: true };
        }
      }
      throw error;
    }
  }

  getOrder(id: string): OrderDto {
    const row = this.orders.findById(id);
    if (!row) {
      throw DomainError.notFound(
        ErrorCodes.ORDER_NOT_FOUND,
        `Order ${id} does not exist`,
      );
    }
    return this.toDto(row);
  }

  private placeOrder(
    cartId: string,
    idempotencyKey: string,
    couponCode?: string,
  ): OrderDto {
    // Claim the cart. If 0 rows changed, someone else already checked it out.
    if (this.carts.markCheckedOut(cartId) === 0) {
      throw DomainError.conflict(
        ErrorCodes.CART_NOT_OPEN,
        `Cart ${cartId} is already checked out`,
      );
    }

    const lines = this.carts.findLines(cartId);
    if (lines.length === 0) {
      throw DomainError.invalid(
        ErrorCodes.CART_EMPTY,
        `Cart ${cartId} is empty`,
      );
    }

    const items: OrderItemDto[] = [];
    let subtotal = 0;
    for (const line of lines) {
      // Atomic inventory grab. If 0 rows changed, we're out of stock. No overselling.
      if (
        this.products.decrementInventory(line.product_id, line.quantity) === 0
      ) {
        const available =
          this.products.findById(line.product_id)?.inventory ?? 0;
        throw DomainError.conflict(
          ErrorCodes.INSUFFICIENT_INVENTORY,
          `Insufficient inventory for ${line.name}`,
          { product_id: line.product_id, requested: line.quantity, available },
        );
      }
      // Cents only. No floats.
      const lineTotal = line.price_cents * line.quantity;
      subtotal += lineTotal;
      items.push({
        product_id: line.product_id,
        product_name: line.name,
        unit_price_cents: line.price_cents,
        quantity: line.quantity,
        line_total_cents: lineTotal,
      });
    }

    let discount = 0;
    let usedCoupon: string | null = null;
    if (couponCode) {
      // Atomic coupon claim. If 0 rows changed, someone took it. Roll back.
      const redeemed = this.coupons.redeem(couponCode, nowIso());
      if (redeemed === 0) {
        throw DomainError.conflict(
          ErrorCodes.COUPON_ALREADY_REDEEMED,
          `Coupon ${couponCode} has already been redeemed`,
        );
      }
      const coupon = this.coupons.findByCode(couponCode) as CouponRow;
      discount = discountCents(subtotal, coupon.percent_off);
      usedCoupon = couponCode;
    }

    const row: OrderRow = {
      id: newId('ord'),
      idempotency_key: idempotencyKey,
      cart_id: cartId,
      coupon_code: usedCoupon,
      subtotal_cents: subtotal,
      discount_cents: discount,
      total_cents: subtotal - discount,
      created_at: nowIso(),
    };
    // Save the snapshot. Products might change later, but this receipt stays the same.
    this.orders.insert(
      row,
      items.map((i) => ({ ...i, order_id: row.id })),
    );
    return this.toDto(row, items);
  }

  // Same key but different request body? That's a client bug. Refuse it.
  private assertSameKeyRequest(
    order: OrderRow,
    cartId: string,
    couponCode?: string,
  ): void {
    if (
      order.cart_id !== cartId ||
      order.coupon_code !== (couponCode ?? null)
    ) {
      throw DomainError.invalid(
        ErrorCodes.IDEMPOTENCY_KEY_MISMATCH,
        'This Idempotency-Key was already used with a different checkout request',
        { original_cart_id: order.cart_id },
      );
    }
  }

  private toDto(row: OrderRow, items?: OrderItemDto[]): OrderDto {
    return {
      id: row.id,
      cart_id: row.cart_id,
      status: 'placed',
      coupon_code: row.coupon_code,
      subtotal_cents: row.subtotal_cents,
      discount_cents: row.discount_cents,
      total_cents: row.total_cents,
      items: items ?? this.orders.findItems(row.id),
      created_at: row.created_at,
    };
  }
}
