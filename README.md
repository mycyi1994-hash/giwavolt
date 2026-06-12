# VOLT ⚡ — crypto arcade (Giwa Sepolia)

Four games — **Tap Trading, Next Candle, Breakout, Death Fun** — in a neon
cyberpunk terminal. Two modes:

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

Tap Trading's multiplier grid is exact fair odds minus a **7% house edge**:
`multiplier = 0.93 / P(price lands in the cell)` (see `web/lib/grid.ts`), so
every offered cell has the same EV and the edge is fully verifiable.

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
