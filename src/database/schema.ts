export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  inventory   INTEGER NOT NULL CHECK (inventory >= 0)
);

CREATE TABLE IF NOT EXISTS carts (
  id     TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'checked_out'))
);

CREATE TABLE IF NOT EXISTS cart_items (
  cart_id    TEXT NOT NULL REFERENCES carts(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  cart_id         TEXT NOT NULL REFERENCES carts(id),
  coupon_code     TEXT,
  subtotal_cents  INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents  INTEGER NOT NULL CHECK (discount_cents >= 0),
  total_cents     INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at      TEXT NOT NULL
);

-- Snapshot of what was purchased: product data may change after the order,
-- these rows must not. This is the "order explains itself" invariant.
CREATE TABLE IF NOT EXISTS order_items (
  order_id         TEXT NOT NULL REFERENCES orders(id),
  product_id       TEXT NOT NULL,
  product_name     TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  quantity         INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

CREATE TABLE IF NOT EXISTS coupons (
  code         TEXT PRIMARY KEY,
  percent_off  INTEGER NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  milestone    INTEGER NOT NULL,
  redeemed_at  TEXT,
  generated_at TEXT NOT NULL,
  -- One coupon per milestone, enforced at the storage layer: concurrent
  -- generation requests for the same milestone cannot both succeed.
  UNIQUE (milestone)
);
`;

export interface SeedProduct {
  id: string;
  name: string;
  priceCents: number;
  inventory: number;
}

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    id: 'p_keyboard',
    name: 'Mechanical Keyboard',
    priceCents: 8999,
    inventory: 40,
  },
  { id: 'p_mouse', name: 'Wireless Mouse', priceCents: 3499, inventory: 80 },
  {
    id: 'p_monitor',
    name: '27-inch 4K Monitor',
    priceCents: 32999,
    inventory: 25,
  },
  {
    id: 'p_headphones',
    name: 'Noise-Cancelling Headphones',
    priceCents: 24999,
    inventory: 12,
  },
  { id: 'p_cable', name: 'USB-C Cable 2m', priceCents: 1299, inventory: 200 },
  // Deliberately scarce: the oversell tests race against this product.
  {
    id: 'p_deskmat',
    name: 'Limited Edition Desk Mat',
    priceCents: 4999,
    inventory: 3,
  },
];
