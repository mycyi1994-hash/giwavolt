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

## Two markets

Tap Trading runs on either of two markets, picked from the toolbar. They sit
behind one interface that answers a single question — *what is σ of the price at
time T?* — which is why the grid, the chart and the settlement logic needed to
learn nothing about the second one.

| | **BTC** | **VOLT** |
| --- | --- | --- |
| Price | live exchange trades | generated here, from a seed |
| σ | **estimated** from ticks | **declared** on a public schedule |
| House edge | 6.5–6.8% (estimate carries error) | exactly 7.00% |
| Goes quiet? | yes — and then betting pauses | never |
| Needs network | yes | no |
| REAL money | yes | **no — DEMO only** |

**VOLT** exists for three reasons. DEMO has to work with no network, and the
exchange sockets are geo-blocked in some regions — a play-money demo stuck on
"CONNECTING…" is worse than no demo. A quiet real market pauses betting,
correctly but boringly. And because we *declare* the volatility instead of
measuring it, the grid prices against the true process and the edge is exact.

The interesting part isn't that it's more volatile. The grid is scale-invariant
in σ: doubling a *constant* volatility widens every band by the same factor and
leaves the multiplier ladder — and the entire feel of the game — unchanged. So
the drama comes from σ *varying*, on two incommensurable periods, swinging about
7× between calm and storm. The board visibly breathes with it:

```
t(s)     σ/yr    band  cells  ladder
0        456%   $1.239    14  9.7× … 33.4×
24       714%   $1.348    14  9.7× … 33.4×
48       255%   $0.539    14  9.7× … 33.4×
72       143%   $0.634    14  9.7× … 33.4×
```

Same ladder throughout — the difficulty knob is the band height, not the payout.
That schedule is public and deterministic, which is exactly what keeps the
pricing exact: with a known σ(t) the terminal distribution over any horizon is
still Gaussian with variance ∫σ²dt, so we compute it rather than estimate it.
The player knows how violent the next thirty seconds will be. They still don't
know which way.

VOLT is **DEMO only**, and that's a security boundary rather than a preference:
the browser generates the path, so the browser can read the seed and know the
future. Harmless for play money, disqualifying for real. Promoting it to REAL
would mean driving the path from a server-held hash chain, revealed link by
link — the same commit-reveal shape Death Fun already uses.

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

## Death Fun is server-authoritative too

The board used to live in the browser — including `bombsIdx`, the skull
positions. Anyone with devtools could read the answer key. REAL rounds are now
dealt server-side and the skulls stay there:

```
POST /api/game/death/start     deals the board, debits the stake,
                               publishes sha256(serverSeed)
POST /api/game/death/reveal    looks up one tile; the answer was fixed at deal time
POST /api/game/death/cashout    pays stake x the multiplier stored on the row
GET  /api/game/death/round     resume a round left open by a closed tab
```

The board comes from a seeded stream — `HMAC(serverSeed, clientSeed:nonce:i)` —
and the server commits to `sha256(serverSeed)` before the first tap, so it can't
pick a board after seeing where you click. You supply a `clientSeed`, so it
can't have pre-computed an unlucky one for you either. When the round ends the
seed is published and replaying it re-derives the exact board — shape and skulls
both. While the round is live, an unopened tile reads `hidden` in the API
response whether or not it hides a skull.

## Verifying it

```bash
npm run verify:vol       # estimator recovers a known volatility; refuses when it can't
npm run verify:edge      # Monte-Carlo of the realised house edge across regimes

# server-authoritative settlement, against a real Postgres:
createdb volt && psql -d volt -f db/schema.sql
DATABASE_URL=postgres://…/volt npm run verify:tap-api
DATABASE_URL=postgres://…/volt npm run verify:death-api

# and over real HTTP, against a running server:
npm run mock:exchange 5399 &
DATABASE_URL=… BINANCE_API_BASE=http://127.0.0.1:5399 npm start &
npm run verify:tap-http
```

`verify:tap-api` covers input validation, that outcomes match the published
price, that concurrent settles pay exactly once, that a void takes sustained
failure rather than one badly-timed fetch, and that the `txns` log reconciles
with the balance. `verify:death-api` checks that no skull position is inferable
from a live round's payload, that the published seed regenerates the exact
board, that a round can't be re-rolled or touched by another address, and that
concurrent cash-outs pay once.

## Where the economic risk actually lives

The grid pays the reciprocal of a probability, so its biggest multipliers sit
furthest into the tail — and tail probabilities are *exponentially* sensitive to
the volatility used to compute them. That makes a few things load-bearing:

- **The client names a cell, it doesn't describe one.** `place` snaps whatever
  band it's sent onto the server's own lattice. An arbitrary band could be
  solved for the position the model prices worst.
- **Volatility is refused, never clamped**, outside its guard rails, and pricing
  takes the *larger* of a 10-minute and a 90-second estimate. Volatility
  clusters, and a player chooses when to bet — any window that lags a spike is a
  window they can wait for.
- **`MAX_MULT` is 50, not 100.** That's where a plausible mis-estimate can still
  only dent the edge instead of inverting it.
- **The quote is fetched fresh per bet** and the horizon is measured from the
  quote's own timestamp, with the quote's age charged to the model. A stale
  centre is arbitrageable by anyone watching a faster feed — which is everyone.
- **A void is not a free option.** It refunds the stake and the player triggers
  settlement, so cheap voiding would mean "bank the winners, retry the losers
  until the oracle blinks". Bars the oracle has seen are persisted to
  `price_bars`, and voiding needs repeated failures spread over real time.

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
npm run verify:testkrw              # publish source to Giwa's Blockscout
BANKROLL_TKRW=10000000 npm run deploy:vault
npm run verify:vault
```

Verifying is a separate step and not an optional one: until the source is
published, the explorer shows bytecode, so a player cannot read the custody
contract they are depositing into. Live addresses and their verification status
are in [`contracts/DEPLOYMENTS.md`](contracts/DEPLOYMENTS.md).

Full guides in [`docs/`](docs) — start with `production-architecture.md`.
