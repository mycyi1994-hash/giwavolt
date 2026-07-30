# P4 — Deploy to Vercel (public URL)

Puts the app online so anyone can play. Frontend + API routes run on Vercel;
the balance lives in Supabase Postgres (already set up in P1).

## Before you start

- DB works locally (P1 done). The Supabase schema is already created.
- (Optional now) GameVault deployed — needed for on-chain deposit/withdraw.
  The free **GET TEST KRW** faucet + play work without it; you can add the vault
  env later and redeploy.
- ⚠️ Rotate the exposed `FAUCET_PRIVATE_KEY` to a fresh wallet before a real
  public launch (testnet, so low urgency — but do it before sharing widely).

## 1. Get a WalletConnect project id (recommended)

On a public domain the default placeholder id triggers a 403 and the
WalletConnect QR won't work (injected wallets like MetaMask still work without
it). Grab a free one at https://cloud．reown．com (formerly WalletConnect Cloud)
→ create a project → copy the **Project ID** → use as `NEXT_PUBLIC_WC_PROJECT_ID`.

## 2. Import the repo into Vercel

1. https://vercel.com → sign in with GitHub → **Add New… → Project**.
2. Import `mycyi1994-hash/giwavolt`.
3. **Root Directory: `web`** ← critical; the Next app is not at the
   repo root. Click *Edit* and pick it.
4. Framework: **Next.js** (auto-detected). Leave build/install as-is (vercel.json
   already sets `npm install --legacy-peer-deps`).
5. Set the production branch to the branch you're deploying (Project →
   Settings → Git → Production Branch), or merge to `main` first.

## 3. Environment Variables (Vercel → Project → Settings → Environment Variables)

**For a DEMO-only deployment, nothing is required.** Deploy with no variables
at all and both games are playable — DEMO is entirely client-side, and the
REAL button stays disabled because `NEXT_PUBLIC_REAL_MODE` is unset. This is
the right shape for a public demo link.

To turn REAL on, all four together:
```
NEXT_PUBLIC_REAL_MODE        = on
DATABASE_URL                 = postgresql://postgres.<ref>:<pw>@...pooler.supabase.com:6543/postgres
NEXT_PUBLIC_TESTKRW_ADDRESS  = 0x616cb26e3Af3895DEAc5A53f760ECEFaEF4e78bc
FAUCET_PRIVATE_KEY           = 0x...   (server-only; do NOT prefix NEXT_PUBLIC)
```
Setting `NEXT_PUBLIC_REAL_MODE=on` without the other three re-creates the bug
it exists to prevent: an enabled button over a ledger that has no database.
Recommended:
```
NEXT_PUBLIC_WC_PROJECT_ID    = <from step 1>
NEXT_PUBLIC_GIWA_RPC_URL     = https://sepolia-rpc.giwa.io
```
When the vault is deployed:
```
NEXT_PUBLIC_GAMEVAULT_ADDRESS = 0x...
OPERATOR_PRIVATE_KEY          = 0x...   (server-only)
```
> Use the **Transaction pooler** DATABASE_URL (port 6543) — serverless needs the
> pooler, not the direct 5432 connection.

## 4. Deploy & test

- Click **Deploy**. You'll get a `https://<project>.vercel.app` URL.
- Open it → connect wallet on Giwa Sepolia → REAL → **GET TEST KRW** → balance
  should appear (served from Postgres).
- Check Supabase → Table Editor → `accounts` to see live rows.

## Gotchas

- **500 on /api/account/\***: DATABASE_URL wrong/missing in Vercel, or schema not
  run. Check Vercel → Deployments → Functions logs.
- **Wallet won't connect**: add `NEXT_PUBLIC_WC_PROJECT_ID`, or just use MetaMask
  (injected works without it).
- **Build fails**: ensure Root Directory = `web`.
- Redeploy after changing env vars (Vercel → Deployments → Redeploy).

## After deploy

- Repoint games to the server-authoritative endpoints (anti-cheat) — the
  `/api/game/*` work is in progress.
- Deploy GameVault + set its env to enable real deposit/withdraw.
