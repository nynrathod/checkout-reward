export interface CouponDto {
  code: string;
  percent_off: number;
  milestone: number;
  status: 'available' | 'redeemed';
  redeemed_at: string | null;
  generated_at: string;
}
