# Production architecture (testnet launch)

Real, deployable build on **Giwa Sepolia** that people can use. No-popup play,
on-chain custody, server-authoritative (anti-cheat) settlement.

## Decisions

- **Hosting/DB:** Vercel (Next.js app + API routes) + Supabase/Neon **Postgres**.
- **Custody:** on-chain **GameVault** contract (auditable, funds not in a personal
  wallet). Deposits/withdrawals are on-chain; play is off-chain.
- **Settlement:** **server-authoritative** — the server decides outcomes, so the
  browser can't fake wins. Fairness is verifiable: **provably-fair commit-reveal**
  RNG for Death, **price oracle** for Tap.
  > Status: not yet wired. `/api/game/tap` exists but nothing calls it, and Tap
  > currently settles in the browser against the live price feed. See P2.
- **Trust (honest):** removes external theft + gives transparent on-chain
  deposit/withdraw + verifiable fairness. Because play is off-chain the operator
  still signs balances (can't be made fully trustless without state channels).

## Flow

```
Browser ──connect (no sig)── identity
   ├─ deposit: approve + GameVault.deposit()      (on-chain, 1–2 sigs)
   ├─ play:    HTTP only                           (no sig, server-authoritative)
   └─ withdraw: request → backend relays voucher   (no user sig; funds → user)
        │
Backend (Vercel API + Supabase)
   ├─ Postgres ledger (authoritative balances, bets, seeds, nonces)
   ├─ game engine: server RNG (commit-reveal) + price oracle resolution
   ├─ deposit watcher: GameVault `Deposited` events → credit balance
   └─ withdraw signer: operator key signs EIP-712 cumulative voucher
        │
Giwa Sepolia: TestKRW (tKRW) + GameVault
```

## GameVault (done — `game/contracts/src/GameVault.sol`)

- `deposit(amount)` — pull tKRW (approve first); credits lifetime, emits `Deposited`.
- `fundBankroll(amount)` — house tops up to cover net winnings.
- `withdraw(user, cumulative, sig)` — pays `cumulative - withdrawn[user]` to
  `user` if `sig` is the operator's EIP-712 `Withdraw(user,cumulative)`. Monotonic
  + replay-safe. Any relayer can submit (so the player needs no gas/sig).
- `setOperator` (owner) rotates the backend signer.
- 6 tests passing.

## Phases

- **P0 — Vault contract** ✅ built + tested.
- **P1 — DB + server-authoritative engine:** Supabase schema (users, balances,
  bets, fair-seeds, withdraw-nonces). Move the ledger off the JSON file. Each bet
  is created + resolved server-side; client only animates.
- **P2 — Provably-fair + oracle:** commit-reveal seeds for Death; a
  server-side BTC price oracle for Tap resolution. The browser already plays
  Tap against the real trade feed (`web/lib/priceFeed.ts`), but it also settles
  its own bets — the server needs to record the same feed and decide outcomes
  before REAL mode can be trusted.
- **P3 — Deposit/withdraw wiring:** deposit watcher (events → credit); withdraw
  endpoint signs a voucher and relays the tx; frontend deposit/withdraw UI.
- **P4 — Deploy:** Vercel + Supabase env, operator key as a server secret,
  faucet abuse limits, monitoring. Public URL.
- **P5 — Real data + cleanup:** indexer-backed feed/leaderboard; remove orphaned
  code (old `web/` app, VoltTap/SlideGame, oracle-bot) or repurpose.

## Keys / env (production)

- `OPERATOR_PRIVATE_KEY` (server-only) — signs withdraw vouchers + relays.
- `DATABASE_URL` — Postgres.
- `NEXT_PUBLIC_TESTKRW_ADDRESS`, `NEXT_PUBLIC_GAMEVAULT_ADDRESS`.
- Price feed key if the oracle source needs one.
