# Deployments — Giwa Sepolia

Chain ID `91342` · RPC `https://sepolia-rpc.giwa.io` ·
Explorer `https://sepolia-explorer.giwa.io` (Blockscout)

This file is the checked-in record. It used to not exist: `deployments/` was in
`.gitignore`, so the JSON the deploy scripts write never reached the repo and the
only trace of a live address was a line in a Vercel setup guide. Addresses are
public by construction — the reason to keep them is so anyone can look up what
the running app is actually pointed at.

| Contract | Address | Explorer | Source verified |
| --- | --- | --- | --- |
| `TestKRW` (tKRW) | `0x616cb26e3Af3895DEAc5A53f760ECEFaEF4e78bc` | [address](https://sepolia-explorer.giwa.io/address/0x616cb26e3Af3895DEAc5A53f760ECEFaEF4e78bc) | **unconfirmed — run `npm run verify:testkrw`** |
| `GameVault` | not recorded | — | not deployed as far as this repo shows |

The tKRW address is the one `docs/p4-deploy-vercel.md` configures
`NEXT_PUBLIC_TESTKRW_ADDRESS` with for the production Vercel deployment. It has
not been checked against the chain from inside this repo, and no deployment
block, owner or faucet wallet was recorded, so treat the row as "what production
is configured with" rather than a confirmed on-chain fact until someone opens the
explorer link.

`GameVault` is the custody contract for REAL-mode deposits and withdrawals.
`p4-deploy-vercel.md` lists `NEXT_PUBLIC_GAMEVAULT_ADDRESS` under "when the vault
is deployed" and leaves it blank, so REAL-mode deposit/withdraw is not live.

## Deploy and verify

```bash
cd game/contracts
npm install && npm test              # 10 tests

npm run deploy:testkrw               # writes deployments/testKRW.giwaSepolia.json
npm run verify:testkrw               # publishes source to Blockscout

TESTKRW_ADDRESS=0x… npm run deploy:vault
npm run verify:vault
```

Verification has to be its own step: a deployed-but-unverified address shows
bytecode only, so nobody can read the custody contract they are depositing into.
The compiler settings in `hardhat.config.ts` (0.8.24, optimizer on, 200 runs) are
what verification is matched against — changing them after a deploy makes the
live contract unverifiable against this source tree.

After a deploy, update the table above and the address in
`docs/p4-deploy-vercel.md`, and set the matching `NEXT_PUBLIC_*` variable in
Vercel.
