import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CheckoutRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  coupon_code?: string;
}

export interface OrderItemDto {
  product_id: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

export interface OrderDto {
  id: string;
  cart_id: string;
  status: 'placed';
  coupon_code: string | null;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  items: OrderItemDto[];
  created_at: string;
}
