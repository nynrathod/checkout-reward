import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  @IsNotEmpty()
  product_id: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  quantity: number;
}

export interface CartLineDto {
  product_id: string;
  name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
  available_inventory: number;
}

export interface CartViewDto {
  id: string;
  status: 'open' | 'checked_out';
  items: CartLineDto[];
  item_count: number;
  total_cents: number;
}
