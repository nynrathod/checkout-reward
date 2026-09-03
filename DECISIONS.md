## Invariants

All enforced in SQL, not in JS. This is the table I'd point at in a code
review — every "where?" answer is one statement:

| Invariant | Enforcement |
|---|---|
| never oversell | `UPDATE products SET inventory = inventory - ? WHERE id = ? AND inventory >= ?` |
| one order per idempotency key | `UNIQUE(idempotency_key)` |
| cart checks out once | `UPDATE carts SET status='checked_out' WHERE id=? AND status='open'` |
| coupon redeemed once | `UPDATE coupons SET redeemed_at=? WHERE code=? AND redeemed_at IS NULL` |
| failed checkout consumes nothing | everything above happens in one transaction, rollback on any throw |
| one coupon per milestone | `UNIQUE(milestone)` |
| order explains itself | order_items snapshot name + price at purchase time |

## Ambiguities I had to resolve

- Price or stock changed between add and checkout: carts use **live** prices
  and don't reserve stock. The order snapshot is the only frozen money.
  Availability is checked best-effort at add time, for real at checkout.
- Coupon on a failed checkout: never consumed — rollback (tested).
- Same idempotency key with a different request: 422. That's a client bug,
  not a replay.
- Rounding: floor to the cent, capped at subtotal. Deterministic, never
  negative.
- `x` changed after generation: existing coupons keep their snapshotted
  percent_off.
- Payment: not modeled. A successful checkout is payment success — the spec
  says no real integration needed, and a fake async gateway would add failure
  modes nobody asked for.

## Decisions

**better-sqlite3 instead of TypeORM/Prisma.** TypeORM's async API makes
check-then-act races the default path — every await is an interleaving point,
and SQLite has no real SELECT FOR UPDATE. better-sqlite3 is synchronous on
one connection, so nothing interleaves in-process, and the SQL guards below
cover multi-instance anyway. Cost: hand-written SQL, which I'm fine with at
this size — the SQL is the invariant documentation.

**Guards in SQL, not locks in JS.** A conditional UPDATE is the check and the
act in one atomic statement — there's no window to race through, no matter
how many instances. Locks serialize; constraints reject. The database is the
one place all requests already meet.

**Client-supplied Idempotency-Key header.** Only the client knows a retry is
a retry. UNIQUE makes duplicates impossible rather than unlikely; when two
same-key requests race, the loser re-reads and returns the winner's order.
Strict — no key is a 400 — but explicit.

**No inventory reservation.** Reserving stock needs TTLs and expiry jobs —
real machinery the timebox doesn't justify, and it moves the race rather
than removing it. Trade-off: a cart can fail at checkout with
INSUFFICIENT_INVENTORY. Honest, and the error says exactly what happened.

**One error envelope with a code catalog.** Checkout can return three
different 409s — a status code can't tell them apart, a string code can.
Codes live in one typed file; invalid codes don't compile. ~60 lines.

**Schema as code, idempotent seed at boot.** Zero setup steps for anyone
cloning the repo. Cost: no migration history — the first thing I'd change
before real schema evolution.

**Milestones rewarded sequentially** (next = highest rewarded + 1, eligible
at m*n orders): nothing gets skipped even if generation is requested late;
UNIQUE(milestone) settles concurrent generation.

## Money

Integer cents everywhere, no floats near money. Discount is
floor(subtotal * percent / 100), capped at subtotal. CHECK constraints
on all money columns back this up.

## Errors

{ error: { code, message } } for everything, including validation.
400 malformed, 404 unknown, 409 state conflict, 422 semantic.

## Deferred

Auth on admin routes (spec says not required; all admin operations live in
one controller, clearly marked), cart TTL / expiry, product CRUD, coupon
listing endpoint, migrations, rate limiting, pagination.

## Multiple instances

The guards are storage-level, so N instances against a shared database work
unchanged — that was the point. What changes: SQLite → Postgres (pool,
driver-specific unique-violation detection), schema-as-code → migrations,
a real payment step inside the existing checkout transaction.

## AI use

Claude for scaffolding and first drafts of code and tests; everything was
run and reviewed. Where I overrode it:

- a service draft had an uncallable placeholder and a `transaction()()` double
  call — replaced wholesale instead of patching
- a generated Vitest config used an invalid SWC option (`module: { type: 'es' }`),
  the suite wouldn't even load — diagnosed from the error and removed
- generated tests asserted wrong numbers (inventory 78 vs 79) and one test
  "proved" checkout rollback but actually tested the add-time guard — I
  rebuilt it so the stock shortage happens between add and checkout, the
  window the invariant is actually about

The rule I ended with: a test I haven't seen fail proves nothing.

## Two more hours

1. The report groups by (product_id, product_name) — rename a product and its
   report line splits in two. Known weakness, trivial fix, I'd do it first.
2. A test interleaving coupon generation with concurrent checkouts.
3. An autocannon run to see it under real load, not just Promise.all.


---

```bash
rm API.md            # if you created it
git add .
git commit -m "docs: README and DECISIONS"
```