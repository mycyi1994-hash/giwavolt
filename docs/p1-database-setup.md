# P1 — Database + server-authoritative ledger

Moves the game balance off the JSON file into Postgres and makes settlement
**server-decided** (anti-cheat). The browser can no longer fake wins or set its
own balance.

## What's built

- `db/schema.sql` — Postgres tables (accounts, txns, fair_seeds, claims,
  withdrawals, deposits).
- `lib/server/db.ts` — Postgres client (postgres.js, serverless-friendly).
- `lib/server/ledger.ts` — atomic balance ops (`debit` can't go negative),
  `claim`, audit log. Same function names as before, now DB-backed.
- `lib/server/fair.ts` — provably-fair RNG (server-seed commit/reveal + HMAC).
- `app/api/game/tap/route.ts` — **server-authoritative Tap**: server rolls and
  settles; client only learns the result. Reference for the other games.

## Setup

1. Create a free Postgres at [supabase.com](https://supabase.com) (or Neon).
2. In the Supabase **SQL editor**, paste & run `web/db/schema.sql`.
3. Get the connection string: top **Connect** button → **Direct** tab →
   **Transaction pooler** (port 6543). Replace `[YOUR-PASSWORD]`.
4. Put it in `web/.env.local`:
   ```
   DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres
   ```
5. `npm run dev`. Claim / play / balance now run through Postgres.

## Next (still to wire)

- Point the **Tap client** at `/api/game/tap` (server-authoritative) instead of
  client-side settlement.
- Same server-authoritative treatment for **Death** (instant RNG), and
  **Candle/Breakout** via the price **oracle** (P2).
- Replace the direct-send **withdraw** with a **GameVault voucher** (P3):
  operator signs `Withdraw(user, cumulative)`, backend relays the tx.
- Deposit watcher: GameVault `Deposited` events → `credit()`.

> Until the clients are repointed, the old client-reported `/api/account/adjust`
> still exists — it's the thing P1 replaces, so it'll be removed once every game
> calls the server-authoritative endpoints.
