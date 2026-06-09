# Test KRW (tKRW) — off-chain play balance + faucet/withdraw

Lets people play **every game** in tKRW on Giwa Sepolia with **no signatures**.
The game balance is an off-chain ledger keyed by the connected wallet; faucet
credits it, games settle against it instantly, and withdraw turns it back into
real on-chain tKRW.

## How it works

- **Connect wallet** → identity (no signature, just account access).
- **GET TEST KRW** → server credits your off-chain balance (`/api/account/claim`).
- **Play any game** → stakes/payouts adjust the balance (`/api/account/adjust`).
  No popups. All games share one balance per wallet address.
- **WITHDRAW** → the house wallet sends real tKRW to your wallet
  (`/api/account/withdraw`). Only this step touches the chain.

Pieces:

- `lib/server/ledger.ts` — file-backed ledger (`.data/ledger.json`).
- `app/api/account/{balance,claim,adjust,withdraw}/route.ts` — the endpoints.
- `components/play/PlayProvider.tsx` — REAL balance = server ledger; `adjust()`
  routes real deltas to the server. Every game uses this, so they all work.
- `game/contracts/src/TestKRW.sol` — the real tKRW token (only used for withdraw).

> **SECURITY (demo):** settlement is client-reported, so it's cheatable. This
> proves the no-signature flow on testnet; real money needs server-authoritative
> outcomes (oracles / server RNG) and a real DB instead of the JSON file.

## Setup

You already deployed `TestKRW`. You only need two env vars in `game/web/.env.local`:

```
NEXT_PUBLIC_TESTKRW_ADDRESS=0x...   # your tKRW token (for withdrawals)
FAUCET_PRIVATE_KEY=0x...            # house wallet key, server-only (holds tKRW)
```

Optional:
```
FAUCET_DRIP_TKRW=1000000   # credited per "GET TEST KRW" (default 1,000,000)
FAUCET_COOLDOWN_MS=0       # per-address claim cooldown (default none)
```

The house wallet (`FAUCET_PRIVATE_KEY`) must hold tKRW so it can pay out
withdrawals. The deploy script already minted the seed to it. It needs a little
ETH only when someone actually withdraws (gas for the transfer).

Then `npm run dev`, open Tap Trading → REAL → **GET TEST KRW** → play any game.

## Notes / next

- Tap Trading's panel is fully wired (₩ balance, KRW bid sizes, claim, withdraw).
  Candle / Breakout / Death already use the same shared balance (claim once in
  Tap and it's available everywhere); their side panels still show a `$`/USDC
  style label until a display pass.
- Persistence is a JSON file — for a hosted deploy (Vercel) move the ledger to a
  real DB/KV, since serverless filesystems are ephemeral.
