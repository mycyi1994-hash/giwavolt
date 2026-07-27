# VOLT ⚡ — crypto arcade (Giwa Sepolia)

Two games — **Tap Trading** and **Death Fun** — in a neon cyberpunk terminal.
Two modes:

- **DEMO** — local play money, zero setup.
- **REAL** — plays in **tKRW** test money with **no per-bet signatures**. The
  balance is an off-chain server ledger (Postgres); money moves on-chain only at
  the edges: faucet/claim in, **GameVault** deposit/withdraw in & out.

## How REAL mode works

```
wallet connect (no sig)
  → GET TEST KRW            server credits the ledger          (no sig)
  → play any game           stakes/payouts hit the ledger      (no sig)
  → DEPOSIT                 approve + GameVault.deposit()      (the only user sigs)
  → WITHDRAW                operator signs an EIP-712 voucher,
                            backend relays — real tKRW out     (no user sig)
```

## Tap Trading runs on the real price

The chart is the live BTC/USD trade series from Binance or Coinbase — whichever
socket answers first, and only ever one of them, since blending venues would
invent movement that never happened. Nothing about the line is generated: no
seed price, no easing, no interpolated points. If there is no real price yet the
chart is blank, and a column that comes due without a fresh tick voids its bets
and refunds them rather than settling on a price the feed can't vouch for.

Odds come from the volatility of that same series. Each cell pays
`multiplier = 0.93 / P(price lands in the cell)`, where the probability uses
realized volatility measured from the last 10 minutes of trades
(`web/lib/priceFeed.ts` → `web/lib/grid.ts`). The band height is sized from that
volatility too, so the grid keeps a constant shape as the market speeds up and
slows down.

Measuring it properly matters more than it might look. Trade prints bounce
between bid and ask, and naive tick-by-tick realized variance reads that bounce
as volatility — about **6.8× the true value** on a simulated BTC feed. Since the
multipliers are roughly linear in the volatility they're handed, that error
would go straight into the payouts. So the estimator samples on two grids and
subtracts the noise term, and when too little signal survives the subtraction it
reports nothing and the game stops quoting until the measurement is sound.

At a realistic BTC spread the realised edge lands at **6.7–6.8%** against a 7%
target, with median volatility error near 2%. Note the honest caveat that
follows: the edge is exact *given* the volatility estimate, and a real estimate
carries error — the old simulated chart could claim exactness only because it
generated the price with the very volatility it priced against.

## REAL mode is settled by the server

In DEMO mode the browser settles its own bets; there's no money to protect. In
REAL mode it doesn't get a vote. A tap sends only a **settlement time and a
price band** — the server does the rest:

```
POST /api/game/tap/place    validates the cell against its own grid,
                            prices it from its own market read,
                            debits the stake atomically, stores the quote
POST /api/game/tap/settle   resolves each due bet against the exchange's
                            PUBLISHED 1-second bar at that instant
```

Settlement deliberately does not use a price this server remembers. It asks the
exchange for the bar covering the bet's settlement second, so **a player can
re-query the same public endpoint and check the result** — and a serverless
function has no memory to trust anyway, since instances come and go between a
bet and its settlement. `tap_bets` keeps the price and volatility each bet was
quoted on, so any payout can be re-derived after the fact.

A multiplier the client reports is never used. A band the client shapes to its
own advantage is rejected — the requested height has to match the server's
current grid. And when the settlement price can't be fetched, the bet is voided
and the stake refunded rather than resolved on a guess.

## Verifying it

```bash
npm run verify:vol       # estimator recovers a known volatility; refuses when it can't
npm run verify:edge      # Monte-Carlo of the realised house edge across regimes

# server-authoritative settlement, against a real Postgres:
createdb volt && psql -d volt -f db/schema.sql
DATABASE_URL=postgres://…/volt npm run verify:tap-api

# and over real HTTP, against a running server:
npm run mock:exchange 5399 &
DATABASE_URL=… BINANCE_API_BASE=http://127.0.0.1:5399 npm start &
npm run verify:tap-http
```

`verify:tap-api` covers input validation, that outcomes match the published
price, that concurrent settles pay exactly once, that an unfetchable price
voids and refunds, and that the `txns` log reconciles with the balance.

## Layout

| Path         | Stack                                 | Purpose                                          |
| ------------ | ------------------------------------- | ------------------------------------------------ |
| `web/`       | Next.js 14 + Tailwind + canvas        | UI + API routes (ledger, faucet, vault, games)   |
| `contracts/` | Hardhat + Solidity 0.8.24             | `TestKRW.sol` (tKRW), `GameVault.sol` (custody)  |
| `docs/`      | Markdown                              | Architecture + runbooks (P1/P3/P4 guides)        |

## Run

```bash
cd web
npm install
cp .env.local.example .env.local   # DATABASE_URL + token/keys for REAL mode
npm run dev                        # http://localhost:3000
```

## Deploy contracts

```bash
cd contracts                        # .env: PRIVATE_KEY=0x... (funded test wallet)
npm install && npm test
npm run deploy:testkrw              # tKRW token
BANKROLL_TKRW=10000000 npm run deploy:vault
```

Full guides in [`docs/`](docs) — start with `production-architecture.md`.
