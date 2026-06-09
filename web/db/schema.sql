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
