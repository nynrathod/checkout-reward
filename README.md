# Checkout & Rewards Service

Ecommerce backend: carts, checkout, and milestone reward coupons. The point of
this exercise was predictability under retries, concurrency, and inventory
contention - the two files worth reading are `src/orders/orders.service.ts`
(one transaction, all guards) and `src/database/schema.ts` (all constraints).

NestJS 12, TypeScript, better-sqlite3, Vitest. ~6 hours.

## Run

Node 22+.

```bash
yarn install
yarn start:dev        # http://localhost:3000
```

SQLite is created and seeded on boot (6 products, `p_deskmat` scarce with
inventory 3). Clean slate: stop the server, `rm -f data/checkout.db*`.

Optional env: `PORT` (3000), `DATABASE_PATH` (data/checkout.db),
`COUPON_MILESTONE_N` (5), `COUPON_PERCENT_OFF` (10). Bad values crash at boot.

## Test

```bash
yarn test:e2e        
```

Includes the concurrency suite: 8 parallel checkouts against 3 units of
inventory, two checkouts racing one coupon, 6 simultaneous retries of the
same idempotency key.

## API

All money is integer cents. Every error is one envelope:

```json
{ "error": { "code": "SOME_CODE", "message": "..." } }
```

Clients branch on `code`, never on the message.

```text
GET    /health                          liveness
GET    /products                        list
GET    /products/:id                    404 PRODUCT_NOT_FOUND

POST   /carts                           201, empty cart
GET    /carts/:id                       live prices + totals
POST   /carts/:id/items                 { product_id, quantity }
PATCH  /carts/:id/items/:productId      { quantity } (absolute, >=1)
DELETE /carts/:id/items/:productId
```

Cart errors: 400 `VALIDATION_FAILED`, 404 `PRODUCT_NOT_FOUND` / `CART_NOT_FOUND` /
`CART_ITEM_NOT_FOUND`, 409 `INSUFFICIENT_INVENTORY` (best-effort at add time —
the real guard is at checkout), 409 `CART_NOT_OPEN` (checked-out carts are
frozen).

```text
POST   /carts/:cartId/checkout          header Idempotency-Key (required)
                                         body { coupon_code? }
GET    /orders/:id                      404 ORDER_NOT_FOUND
```

201 → order. Same key again → 200, same order, `x-idempotent-replay: true`,
no side effects. Same key with a different request → 422.

Checkout errors: 400 `IDEMPOTENCY_KEY_REQUIRED`, 404 `CART_NOT_FOUND` /
`COUPON_NOT_FOUND`, 409 `CART_NOT_OPEN` / `INSUFFICIENT_INVENTORY` /
`COUPON_ALREADY_REDEEMED`, 422 `CART_EMPTY`.

Order response is a snapshot (name + price at purchase time, survives later
product changes):

```json
{
  "id": "ord_...",
  "cart_id": "...",
  "status": "placed",
  "coupon_code": null,
  "subtotal_cents": 8999,
  "discount_cents": 0,
  "total_cents": 8999,
  "items": [
    {
      "product_id": "...",
      "product_name": "...",
      "unit_price_cents": 8999,
      "quantity": 1,
      "line_total_cents": 8999
    }
  ],
  "created_at": "..."
}
```

## Admin (no auth implemented)

```text
POST   /admin/coupons/generate          201, or 409 NO_ELIGIBLE_MILESTONE /
                                         COUPON_MILESTONE_ALREADY_REWARDED
GET    /admin/report                    pure read, never mutates
```

Milestone m is eligible at m*n placed orders, one coupon per milestone.
`percent_off` is snapshotted at generation. Report:

```json
{
  "orders_placed": 9,
  "revenue": {
    "gross_cents": 0,
    "discount_cents": 0,
    "net_cents": 0
  },
  "products": [
    {
      "product_id": "...",
      "product_name": "...",
      "quantity_sold": 3
    }
  ],
  "coupons": {
    "generated": 1,
    "available": 0,
    "redeemed": 1
  }
}
```

## Walkthrough

The whole system in one paste every endpoint, every failure mode, the race
(bash, Linux/WSL/macOS, needs `jq`, server on `yarn start:dev`):

```bash
BASE=http://localhost:3000

# catalog: 6 seeded products, p_deskmat scarce (inventory 3)
curl -s $BASE/products | jq

# cart: create, add, update, view
cart=$(curl -s -X POST $BASE/carts | jq -r '.id')
curl -s -X POST $BASE/carts/$cart/items -H 'Content-Type: application/json' \
  -d '{"product_id":"p_keyboard","quantity":2}' | jq
curl -s -X PATCH $BASE/carts/$cart/items/p_keyboard -H 'Content-Type: application/json' \
  -d '{"quantity":1}' | jq
curl -s $BASE/carts/$cart | jq

# validation: 400 + 404, machine-readable codes
curl -s -w '\nHTTP %{http_code}\n' -X POST $BASE/carts/$cart/items \
  -H 'Content-Type: application/json' -d '{"product_id":"p_keyboard","quantity":0}'
curl -s -w '\nHTTP %{http_code}\n' -X POST $BASE/carts/$cart/items \
  -H 'Content-Type: application/json' -d '{"product_id":"p_ghost","quantity":1}'

# checkout, then fetch the order
order=$(curl -s -X POST $BASE/carts/$cart/checkout \
  -H 'Idempotency-Key: k1' -H 'Content-Type: application/json' -d '{}' | jq -r '.id')
curl -s $BASE/orders/$order | jq

# retry the same key: 200, same order, inventory charged once
curl -i -X POST $BASE/carts/$cart/checkout \
  -H 'Idempotency-Key: k1' -H 'Content-Type: application/json' -d '{}'
curl -s $BASE/products/p_keyboard | jq

# failure modes: no key / second checkout / mutate a checked-out cart
curl -s -w '\nHTTP %{http_code}\n' -X POST $BASE/carts/$cart/checkout \
  -H 'Content-Type: application/json' -d '{}'
curl -s -w '\nHTTP %{http_code}\n' -X POST $BASE/carts/$cart/checkout \
  -H 'Idempotency-Key: k2' -H 'Content-Type: application/json' -d '{}'
curl -s -w '\nHTTP %{http_code}\n' -X POST $BASE/carts/$cart/items \
  -H 'Content-Type: application/json' -d '{"product_id":"p_cable","quantity":1}'

# 4 more orders -> milestone 1 (n=5)
for i in 1 2 3 4; do
  c=$(curl -s -X POST $BASE/carts | jq -r '.id')
  curl -s -o /dev/null -X POST $BASE/carts/$c/items -H 'Content-Type: application/json' \
    -d '{"product_id":"p_mouse","quantity":1}'
  curl -s -o /dev/null -X POST $BASE/carts/$c/checkout -H "Idempotency-Key: m$i" \
    -H 'Content-Type: application/json' -d '{}'
done

# coupons: generate, gate (409), redeem, reuse (409)
coupon=$(curl -s -X POST $BASE/admin/coupons/generate | jq -r '.code')
curl -s -w '\nHTTP %{http_code}\n' -X POST $BASE/admin/coupons/generate
c2=$(curl -s -X POST $BASE/carts | jq -r '.id')
curl -s -o /dev/null -X POST $BASE/carts/$c2/items -H 'Content-Type: application/json' \
  -d '{"product_id":"p_monitor","quantity":1}'
curl -s -X POST $BASE/carts/$c2/checkout -H 'Idempotency-Key: cp1' \
  -H 'Content-Type: application/json' -d "{\"coupon_code\":\"$coupon\"}" | jq
c3=$(curl -s -X POST $BASE/carts | jq -r '.id')
curl -s -o /dev/null -X POST $BASE/carts/$c3/items -H 'Content-Type: application/json' \
  -d '{"product_id":"p_cable","quantity":1}'
curl -s -w '\nHTTP %{http_code}\n' -X POST $BASE/carts/$c3/checkout \
  -H 'Idempotency-Key: cp2' -H 'Content-Type: application/json' \
  -d "{\"coupon_code\":\"$coupon\"}"

# THE RACE: 8 parallel checkouts vs 3 units -> 3x 201, 5x 409, inventory 0
rc=$(for i in 1 2 3 4 5 6 7 8; do curl -s -X POST $BASE/carts | jq -r '.id'; done)
for c in $rc; do curl -s -o /dev/null -X POST $BASE/carts/$c/items \
  -H 'Content-Type: application/json' -d '{"product_id":"p_deskmat","quantity":1}'; done
for c in $rc; do ( curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST $BASE/carts/$c/checkout -H "Idempotency-Key: race-$c" \
  -H 'Content-Type: application/json' -d '{}' ) & done; wait
curl -s $BASE/products/p_deskmat | jq

# report: reconciles with the orders above; run twice, never mutates
curl -s $BASE/admin/report | jq
curl -s $BASE/admin/report | jq
```

Decisions and deferred work: [DECISIONS.md](DECISIONS.md).
