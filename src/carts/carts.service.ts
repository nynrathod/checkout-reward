import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain.error.js';
import { ErrorCodes } from '../common/errors/error-codes.js';
import { newId } from '../common/utils/ids.js';
import { ProductsService } from '../products/products.service.js';
import type { AddCartItemDto, CartViewDto } from './dto/cart.dto.js';
import { CartsRepository, CartRow } from './carts.repository.js';

@Injectable()
export class CartsService {
  constructor(
    private readonly carts: CartsRepository,
    private readonly products: ProductsService,
  ) {}

  create(): CartViewDto {
    const id = newId('cart');
    this.carts.insertCart(id);
    return { id, status: 'open', items: [], item_count: 0, total_cents: 0 };
  }

  get(id: string): CartViewDto {
    const cart = this.requireCart(id);
    return this.viewOf(cart);
  }

  addItem(cartId: string, dto: AddCartItemDto): CartViewDto {
    const cart = this.requireOpenCart(cartId);
    const product = this.products.get(dto.product_id);
    const current = this.carts.findItemQuantity(cart.id, product.id) ?? 0;
    this.requireInventory(
      product.id,
      product.inventory,
      current + dto.quantity,
    );
    this.carts.upsertItem(cart.id, product.id, dto.quantity);
    return this.viewOf(cart);
  }

  updateItem(cartId: string, productId: string, quantity: number): CartViewDto {
    const cart = this.requireOpenCart(cartId);
    if (this.carts.findItemQuantity(cart.id, productId) === undefined) {
      throw DomainError.notFound(
        ErrorCodes.CART_ITEM_NOT_FOUND,
        `Product ${productId} is not in cart ${cartId}`,
      );
    }
    const product = this.products.get(productId);
    this.requireInventory(product.id, product.inventory, quantity);
    this.carts.setItemQuantity(cart.id, productId, quantity);
    return this.viewOf(cart);
  }

  removeItem(cartId: string, productId: string): CartViewDto {
    const cart = this.requireOpenCart(cartId);
    if (this.carts.deleteItem(cart.id, productId) === 0) {
      throw DomainError.notFound(
        ErrorCodes.CART_ITEM_NOT_FOUND,
        `Product ${productId} is not in cart ${cartId}`,
      );
    }
    return this.viewOf(cart);
  }

  private requireCart(id: string): CartRow {
    const cart = this.carts.findCart(id);
    if (!cart) {
      throw DomainError.notFound(
        ErrorCodes.CART_NOT_FOUND,
        `Cart ${id} does not exist`,
      );
    }
    return cart;
  }

  private requireOpenCart(id: string): CartRow {
    const cart = this.requireCart(id);
    if (cart.status !== 'open') {
      throw DomainError.conflict(
        ErrorCodes.CART_NOT_OPEN,
        `Cart ${id} is already checked out and can no longer be modified`,
      );
    }
    return cart;
  }

  private requireInventory(
    productId: string,
    available: number,
    requested: number,
  ): void {
    if (requested > available) {
      throw DomainError.conflict(
        ErrorCodes.INSUFFICIENT_INVENTORY,
        `Only ${available} unit(s) of ${productId} available`,
        { product_id: productId, available, requested },
      );
    }
  }

  private viewOf(cart: CartRow): CartViewDto {
    const items = this.carts.findLines(cart.id).map((l) => ({
      product_id: l.product_id,
      name: l.name,
      unit_price_cents: l.price_cents,
      quantity: l.quantity,
      line_total_cents: l.price_cents * l.quantity,
      available_inventory: l.inventory,
    }));
    return {
      id: cart.id,
      status: cart.status,
      items,
      item_count: items.length,
      total_cents: items.reduce((sum, l) => sum + l.line_total_cents, 0),
    };
  }
}
