export interface ReportProductLine {
  product_id: string;
  product_name: string;
  quantity_sold: number;
}

export interface ReportDto {
  orders_placed: number;
  revenue: { gross_cents: number; discount_cents: number; net_cents: number };
  products: ReportProductLine[];
  coupons: { generated: number; available: number; redeemed: number };
}
