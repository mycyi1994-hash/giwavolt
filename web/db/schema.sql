-- ProjectGIWA — production ledger schema (Postgres / Supabase)
-- Run this once in the Supabase SQL editor.

-- Off-chain game balance (KRW, 2 decimals). One row per wallet address.
create table if not exists accounts (
  address    text primary key,
  balance    numeric(30,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Append-only money log (audit trail of every stake/payout/claim/deposit/withdraw).
create table if not exists txns (
  id         bigserial primary key,
  address    text not null,
  delta      numeric(30,2) not null,
  kind       text not null,           -- claim | bet | payout | deposit | withdraw
  ref        text,                    -- game/round id, tx hash, etc.
  created_at timestamptz not null default now()
);
create index if not exists txns_address_idx on txns(address, id desc);

-- Provably-fair RNG state (server seed committed via hash; client seed + nonce).
create table if not exists fair_seeds (
  address          text primary key,
  server_seed      text not null,
  server_seed_hash text not null,
  client_seed      text not null default '',
  nonce            bigint not null default 0,
  created_at       timestamptz not null default now()
);

-- Faucet claim cooldown.
create table if not exists claims (
  address    text primary key,
  last_claim timestamptz
);

-- Cumulative withdraw entitlement authorised on-chain (base units, matches the
-- GameVault `withdrawn[user]` cumulative voucher).
create table if not exists withdrawals (
  address    text primary key,
  cumulative numeric(40,0) not null default 0,
  updated_at timestamptz not null default now()
);

-- Processed on-chain deposits (idempotency for the deposit watcher).
create table if not exists deposits (
  tx_hash      text,
  log_index    int not null default 0,
  address      text not null,
  amount       numeric(40,0) not null,
  processed_at timestamptz not null default now(),
  primary key (tx_hash, log_index)
);

-- Tap Trading bets. Server-authoritative: the browser proposes a cell, the
-- server prices it from its own market read, and settles it against the
-- exchange's published 1-second bar at col_t (see lib/server/oracle.ts).
-- quote_price / quote_vol are kept so a payout can be re-derived and audited.
create table if not exists tap_bets (
  id           bigserial primary key,
  address      text not null,
  stake        numeric(30,2) not null,
  mult         numeric(12,4) not null,
  band_lo      numeric(30,8) not null,   -- absolute price levels, not indices
  band_hi      numeric(30,8) not null,
  col_t        bigint not null,          -- settlement instant, epoch ms
  quote_price  numeric(30,8) not null,
  quote_vol    numeric(20,12) not null,
  quote_source text not null,
  status       text not null default 'live',  -- live | won | lost | void
  settle_price numeric(30,8),
  settle_source text,
  payout       numeric(30,2),
  created_at   timestamptz not null default now(),
  settled_at   timestamptz
);
create index if not exists tap_bets_open_idx on tap_bets(address, status, col_t);

-- Death Fun rounds. Server-authoritative and provably fair: the board is
-- generated from server_seed before the first tap, and only sha256(server_seed)
-- is published up front. bombs_idx is never sent to the browser while the round
-- is live — that column IS the game's secret. On bust or cash-out the seed and
-- the skull positions are released so the player can re-derive the exact board
-- (see lib/server/prng.ts).
create table if not exists death_rounds (
  id           bigserial primary key,
  address      text not null,
  difficulty   text not null,
  dim          int not null,
  stake        numeric(30,2) not null,
  bombs        int not null,
  bombs_idx    jsonb not null,          -- secret until status <> 'playing'
  mask         jsonb not null,          -- board shape; public from the start
  revealed     jsonb not null default '[]'::jsonb,  -- indices the player opened
  picks        int not null default 0,
  multiplier   numeric(12,4) not null default 1,
  status       text not null default 'playing',     -- playing | busted | stopped
  cashout      numeric(30,2) not null default 0,
  server_seed  text not null,           -- released only once the round ends
  server_seed_hash text not null,
  client_seed  text not null default '',
  nonce        bigint not null default 0,
  created_at   timestamptz not null default now(),
  settled_at   timestamptz
);
create index if not exists death_rounds_open_idx on death_rounds(address, status);

-- Bars the oracle has already seen, keyed by the bar's close time (epoch ms).
-- Settlement reads this before reaching for an exchange, so the outcome of a
-- bet does not depend on that exchange still answering at the moment a player
-- chooses to ask — an unfetchable settlement price is worth money to them.
create table if not exists price_bars (
  ts          bigint primary key,
  price       numeric(30,8) not null,
  source      text not null,
  recorded_at timestamptz not null default now()
);

-- Settlement attempts are recorded so a void is a considered outcome rather
-- than the result of one unlucky fetch at a moment of the player's choosing.
alter table tap_bets add column if not exists settle_attempts int not null default 0;
alter table tap_bets add column if not exists first_attempt_at timestamptz;
