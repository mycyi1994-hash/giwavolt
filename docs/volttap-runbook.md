# VoltTap REAL mode — go-live runbook

This wires the **Tap Trading** game's REAL mode to the chain on **Giwa Sepolia**.
Each tap is one signed transaction: a fixed **0.0001 ETH** stake, with the
win-chance derived from the tapped cell's multiplier, settled instantly by a
provably-fair on-chain roll (7% house edge). There is **no off-chain balance**
here — the Polymarket-style deposit model is a separate later phase.

## What's already wired (this slice)

- `game/web/lib/volttap.ts` — ABI, address (from env), constants, odds math.
- `game/web/lib/useVoltTap.ts` — imperative `tap(mult)` → sign → wait receipt →
  decode `Tapped` event → `{ win, payoutWei }`. Reads `freeBankroll`.
- `app/terminal/tap/page.tsx` — REAL taps call the chain via `onRealTap`.
- `components/play/TapPanel.tsx` — REAL mode shows native ETH balance, fixed
  stake, and the house bankroll.

REAL mode is **gated**: with `NEXT_PUBLIC_VOLTTAP_ADDRESS` unset the UI stays in
demo behaviour and shows "deploy VoltTap to enable".

## 1. Get a funded deployer key on Giwa Sepolia

You need an account with some Giwa Sepolia ETH (deployer = contract owner, and
it also seeds the house bankroll). Bridge/faucet per Giwa docs.

```bash
cd game/contracts
cp .env.example .env   # if present; otherwise create .env
# .env:
#   PRIVATE_KEY=0x...            # funded deployer
#   GIWA_RPC_URL=https://sepolia-rpc.giwa.io   # optional, this is the default
```

## 2. Deploy + seed the bankroll

```bash
cd game/contracts
npm install
npm run compile
BANKROLL_ETH=0.05 npm run deploy:volttap
# → prints "VoltTap: 0x...." and writes deployments/voltTap.giwaSepolia.json
```

`BANKROLL_ETH` is the house float (must cover the largest single payout =
stake × multiplier). Default is 0.05 ETH. Top up later with the contract's
`fund()` / a plain transfer, or pull profit with `withdraw(amount, to)` (owner
only).

## 3. Point the web app at it

```bash
cd game/web
# .env.local:
NEXT_PUBLIC_VOLTTAP_ADDRESS=0x...   # address from step 2
NEXT_PUBLIC_GIWA_RPC_URL=https://sepolia-rpc.giwa.io
NEXT_PUBLIC_WC_PROJECT_ID=          # optional, only for WalletConnect QR
```

Restart `npm run dev` (or redeploy). Connect a wallet on Giwa Sepolia, switch
the Tap Trading toggle to **REAL**, and tap a cell — you'll sign a tx and the
result lands when it mines.

## 4. Sanity checks

- Banner reads `◆ REAL — on-chain · 0.0001 ETH/tap` (not the "deploy" hint).
- TapPanel shows your wallet ETH balance and `HOUSE BANKROLL`.
- A losing tap deducts 0.0001 ETH + gas; a win pays `stake × multiplier`.
- If the bankroll can't cover a payout, the tap is rejected client-side with
  "house bankroll can't cover that payout".

## Not in this slice (next phases)

- Off-chain deposit balance / no-signature play (needs a custody backend +
  deposit watcher + settlement).
- SlideGame-based games (Candle / Breakout) — need an oracle posting real
  prices + a round keeper.
- Indexer-backed LiveFeed / leaderboard / history (currently mocked).
