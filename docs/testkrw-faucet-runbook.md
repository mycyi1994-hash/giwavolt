# Test KRW (tKRW) + faucet — runbook

Play-money token so people can try the games on Giwa Sepolia without real
testnet USDC/ETH. The faucet **pushes** tKRW (plus a little gas ETH) to a
wallet, so users with zero ETH can still receive — they don't sign anything.

## Pieces (this slice)

- `game/contracts/src/TestKRW.sol` — minimal ERC-20 (`tKRW`, 18 dp). Owner can
  `mint`; anyone with gas can pull a rate-limited `faucet()` drip.
- `game/web/app/api/faucet/route.ts` — server endpoint. A funded hot wallet
  sends the caller tKRW + dust ETH. Per-address cooldown.
- `game/web/components/account/FaucetButton.tsx` — "GET TEST KRW" button.
- `game/web/lib/testkrw.ts` / `useTestKrw.ts` — token config + balance read.
- Tap Trading REAL panel shows the tKRW balance + faucet button.

Everything is **gated**: with the env vars unset the UI shows a "not deployed"
hint and nothing breaks.

## 1. Deploy the token (needs a little ETH for gas)

```bash
cd game/contracts
# .env: PRIVATE_KEY=0x...   (funded deployer = token owner)
npm install && npm run compile
FAUCET_WALLET=0xYOURFAUCETWALLET FAUCET_SEED=1000000000 npm run deploy:testkrw
# → prints "TestKRW: 0x..." and mints 1e9 tKRW to the faucet wallet
# → writes deployments/testKRW.giwaSepolia.json
```

`FAUCET_WALLET` is the hot wallet the server faucet will send from (can be the
deployer). It receives the seed tKRW. It also needs some **ETH** so it can pay
gas and hand out dust ETH.

## 2. Configure the web app

```bash
cd game/web   # .env.local
NEXT_PUBLIC_TESTKRW_ADDRESS=0x...        # token address from step 1
FAUCET_PRIVATE_KEY=0x...                 # the FAUCET_WALLET's private key (server-only!)
# optional:
# FAUCET_DRIP_TKRW=1000000
# FAUCET_DRIP_ETH=0.002
# FAUCET_COOLDOWN_MS=28800000
```

> **Security:** `FAUCET_PRIVATE_KEY` has no `NEXT_PUBLIC_` prefix on purpose — it
> must never reach the browser. On Vercel add it as a (non-public) Environment
> Variable. It's a testnet hot wallet; keep only small amounts in it.

## 3. Try it

`npm run dev`, connect a wallet on Giwa Sepolia, open Tap Trading → REAL. Click
**GET TEST KRW** — the server sends tKRW (+ dust ETH) and the balance updates in
a few seconds. No signature needed.

## Not yet (next phases)

- **Spending tKRW in-game.** Right now tKRW is shown/claimable but betting isn't
  wired to it yet. Next: settle plays in tKRW — either per-bet on-chain
  (VoltTapKRW) or the chosen deposit→off-chain model (custody backend +
  settlement). The faucet/token built here feed both.
- Surface the faucet on the landing page too (currently in the Tap REAL panel).
- Abuse resistance beyond the in-memory cooldown (e.g. captcha / per-IP).
