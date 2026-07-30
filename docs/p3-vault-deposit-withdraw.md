# P3 — On-chain deposit & withdraw via GameVault

Real money in/out through the on-chain custody contract. Deposits are the only
time a player signs; withdrawals are relayed by the operator (no user signature).

## What's built

- `lib/gamevault.ts` — Vault ABI, address, EIP-712 voucher domain/types.
- `lib/useVaultDeposit.ts` — `deposit(amountKrw)`: approve → `Vault.deposit()` →
  `/api/account/deposit/sync` credits the off-chain balance.
- `app/api/account/deposit/sync` — reads the player's `Deposited` events and
  credits any not seen before (idempotent via the `deposits` table).
- `app/api/account/withdraw` — debits the ledger, signs an EIP-712
  `Withdraw(user, cumulative)` voucher with the operator key, and relays
  `Vault.withdraw()`; refunds the ledger if the tx fails.
- Tap panel: **DEPOSIT** (shows only when the vault is configured) + **WITHDRAW**.

## Setup

### 1. Deploy the vault (needs a little ETH for gas)

```bash
cd contracts            # .env has PRIVATE_KEY (your test wallet)
npm run compile
# operator defaults to the deployer; seed some bankroll so winnings can be paid
BANKROLL_TKRW=10000000 npm run deploy:vault
# → prints "GameVault: 0x..." and writes deployments/gameVault.giwaSepolia.json
```

(`TESTKRW_ADDRESS` is read from `deployments/testKRW.giwaSepolia.json`
automatically, or set it in the env.)

### 2. Configure the web app

`web/.env.local`:
```
NEXT_PUBLIC_GAMEVAULT_ADDRESS=0x...        # from step 1
OPERATOR_PRIVATE_KEY=0x...                 # same key as the deployer/operator (server-only)
# GAMEVAULT_DEPLOY_BLOCK=12345             # optional: speeds up deposit scans
```
If you use one key for everything, `OPERATOR_PRIVATE_KEY` can equal
`FAUCET_PRIVATE_KEY` (it falls back to it). The operator address **must** match
the vault's operator (the deployer by default).

Restart `npm run dev`.

## How it flows

- **Deposit:** player clicks DEPOSIT → approves tKRW → `Vault.deposit()` →
  server reads the `Deposited` event and credits the game balance. (2 signatures,
  one-time money-in.)
- **Play:** no signatures (off-chain balance).
- **Withdraw:** player clicks WITHDRAW → server signs a cumulative voucher and
  relays `Vault.withdraw()` → real tKRW lands in the player's wallet. (No user
  signature/gas.)

## Bankroll

The vault must hold enough tKRW to pay net winnings beyond deposits. Seed it at
deploy (`BANKROLL_TKRW`) or send tKRW to the vault later / call `fundBankroll`.
Withdraws fail with "transfer amount exceeds balance" if the vault runs dry.

## Notes / next

- Withdraw currently cashes out the **full** balance; a custom amount field can
  be added.
- The deposit watcher is on-demand (scans on the player's click). For busy
  deployments add a `GAMEVAULT_DEPLOY_BLOCK` or a periodic sync.
- Players need on-chain tKRW to deposit — they get it by withdrawing first, or
  from the testnet token holder. The off-chain **GET TEST KRW** faucet is the
  main on-ramp.
