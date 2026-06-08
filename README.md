# VOLT ⚡ — on-chain tap-trading game

A full on-chain **tap-trading** game on **Giwa Sepolia** (Chain ID `91342`)
with an original neon/cyberpunk UI. A live ETH/USD price line scrolls right; the
future is tiled with a **multiplier grid**. Tap a cell — if the real price line
passes through it, you win `stake × multiplier`.

- **Tap again to cancel** a bet (full refund) while it's still live.
- Cells closer than **10 seconds** are **locked** (can't be bet).
- Multipliers are exact fair odds minus a **7% house edge** (cyan = low, magenta
  = high); cells outside `(1x, 30x]` aren't offered, carving a probability cone.

> Separate module from the v1 prediction market (`/contracts`, `/web`, …). Same
> chain, same oracle trust model, its own contract + UI.

## Layout

| Path               | Stack                                  | Purpose                                   |
| ------------------ | -------------------------------------- | ----------------------------------------- |
| `contracts/`       | Hardhat + Solidity 0.8.24              | `SlideGame` — grid bets, real-price settle |
| `web/`             | Next.js 14 + Tailwind + canvas engine  | The Tap-Trading UI (live chart + grid)    |
| `docs/design.md`   | Markdown                               | Game + contract design notes              |

## Run the UI (demo mode)

The web app ships a fully client-side **demo** — a simulated live price line, a
live multiplier grid, tap-to-bet, win/lose payouts and a running balance. No
wallet or deployed contract needed.

```bash
cd game/web
npm install
npm run dev        # http://localhost:3000
```

Tap cells in the grid (right of the dashed "now" line). Pick a **Bid Size** in
the left panel first. Wins animate `+$payout`; the balance updates live.

## Contracts

```bash
cd game/contracts
npm install
npx hardhat test          # SlideGame unit tests
```

Deploy to Giwa Sepolia:

```bash
export PRIVATE_KEY=0x...          # deployer = default admin/oracle/treasury
export BANKROLL_ETH=1.0           # optional initial house bankroll
npx hardhat run scripts/deploy.ts --network giwaSepolia
# writes deployments/giwaSepolia.json
```

## How it works

1. **Admin opens a round** committing the multiplier grid + price bands *before*
   any price is known (`openRound`).
2. **Players tap cells** (`placeBet`), locking the cell's multiplier and
   reserving the potential payout against the bankroll.
3. As wall-clock time reaches each column, the **oracle posts the real price**
   (`setColumnPrice`); the band it lands in is the winning row.
4. **Anyone settles** (`settleBet`): winners get `stake × multiplier`, losers'
   stakes stay as house profit.

See [`docs/design.md`](./docs/design.md) for the full model, fairness argument
and liability accounting.

## Network

| Field        | Value                              |
| ------------ | ---------------------------------- |
| Network name | Giwa Sepolia                       |
| Chain ID     | `91342`                            |
| RPC URL      | `https://sepolia-rpc.giwa.io`      |
| Explorer     | `https://sepolia-explorer.giwa.io` |

## License

MIT
