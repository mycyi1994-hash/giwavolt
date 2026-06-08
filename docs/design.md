# GIWA Slide — design notes

A full on-chain **tap-trading** game for Giwa Sepolia (Chain ID `91342`),
inspired by the HyperSwap "Tap Trading" UX. A live BTC/ETH price line scrolls
right; the future is covered by a **multiplier grid**. Players tap cells; if the
real price line passes through a tapped cell, they win `stake × multiplier`.

This module is intentionally **separate** from the v1 prediction market — it
reuses the same chain, oracle trust model and design language, but ships its own
contract, web app and (future) bot.

## Game loop

```
            past │ now            future ──────────────▶
  price ─────────●                ┌────┬────┬────┬────┐   higher rows /
  line          ╱ ╲               │1.4x│1.9x│2.6x│3.8x│   later columns
       ────────╯   ╲   ╭──────────┤1.3x│1.6x│2.1x│2.9x│   pay more
                    ╰──╯           │1.3x│1.5x│1.9x│2.5x│ ◀ band hugging the
                                   └────┴────┴────┴────┘   line is cheapest
   tap a cell ▶ bet locked at that cell's multiplier
   line reaches the column ▶ the band the price lands in wins
```

- **Columns** = future sample times (every `columnInterval` seconds).
- **Rows** = fixed price bands (a ladder of width `step`).
- A column resolves when wall-clock time reaches its sample time: the oracle
  posts the real price, the band containing it is the **winning row**, and every
  bet on that `(column, row)` cell pays `stake × lockedMultiplier`.

## Why this is fair / on-chain

- The **multiplier grid is committed when a round opens**, before any of the
  round's prices are known, so the operator cannot tune odds against live bets.
- The **line is the real market price** (Upbit BTC/ETH via the oracle role) —
  unpredictable and not manipulable by the house.
- A bet locks its multiplier on-chain at tap time (`lockedMult`), and is settled
  trustlessly: anyone (player or keeper) can call `settleBet`.
- The **bankroll cannot be over-exposed**: every tap reserves its full potential
  payout in `lockedLiability`, and a tap reverts if the contract balance can't
  cover it.

Trust assumption today = the price oracle (same as the v1 prediction market).
v2 can decentralise it (k-of-n threshold or optimistic), exactly as in the
prediction-market roadmap.

## Contract — `SlideGame.sol`

Native GIWA ETH is the bet token (no ERC-20 needed on testnet).

| Function | Who | Purpose |
| --- | --- | --- |
| `openRound(asset, startPrice, startTime, columnInterval, numColumns, numRows, thresholds[], mults[])` | admin | Commit a round + its full multiplier grid (row-major `mults[col*numRows+row]`, bps) and band thresholds. |
| `placeBet(roundId, column, row)` payable | anyone | Tap a cell. Locks `stake×mult` against the bankroll; reverts past the column's sample time or on an unbettable cell. |
| `setColumnPrice(roundId, column, price)` | oracle | Post the real price for a column once its sample time passes; derives the winning row. |
| `settleBet(betId)` | anyone | Pay winners `stake×mult`; losers' stake stays as house profit. |
| `fundBankroll()` / `receive()` | anyone | Top up the house bankroll. |
| `withdrawFree(amount, to)` | admin | Withdraw bankroll **not** reserved against open bets. |
| `closeRound`, `setRoles`, `setBetLimits` | admin | Lifecycle / config. |

Multipliers are basis points (`10000 = 1x`); each must be `> 1x` or `0`
(unbettable cell). Bands: `numRows-1` ascending `thresholds` define `numRows`
price bands; `row 0` is below `thresholds[0]`, the top row is `≥` the last.

### Liability accounting

```
place:  balance += stake;     lockedLiability += stake*mult   (require ≤ balance)
win:    balance -= payout;    lockedLiability -= payout        (player paid)
lose:   balance unchanged;    lockedLiability -= payout        (house keeps stake)
freeBankroll = balance - lockedLiability
```

## Web — multiplier model

The on-chain contract accepts *any* committed grid. The web/operator computes a
**gamified ladder** (`web/lib/grid.ts`): cells near the line ≈ `1.3x`, growing
with vertical distance `n` (in bands) and time horizon `h`:

```
multiplier = clamp(MIN + A · n^1.6 · (0.6 + 0.12·h),  1.3x,  30x)
```

This produces the reference look — the band hugging the line is cheapest, the
far corners reach the cap — while the house edge is enforced on-chain by the
committed grid + bankroll limits.

## Status

- ✅ `SlideGame.sol` + tests (`game/contracts`)
- ✅ Web UI/UX, playable in client-side **demo mode** (`game/web`)
- ⏳ Wire the web to the deployed contract (wagmi reads/writes)
- ⏳ Oracle/round bot: open rounds, post Upbit prices per column, settle bets
- ⏳ Indexer for round/grid/bet history

## v2 ideas

- Decentralised price oracle (k-of-n / optimistic), shared with the market.
- ERC-1155 "ticket" NFTs for open taps so positions are transferable.
- Batch `settleBets(ids[])` keeper + auto-settle on the next tap.
- Per-asset rounds (BTC + ETH) and configurable round cadence.
