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
| `TestKRW` (tKRW) | `0x616cb26e3Af3895DEAc5A53f760ECEFaEF4e78bc` | [address](https://sepolia-explorer.giwa.io/address/0x616cb26e3Af3895DEAc5A53f760ECEFaEF4e78bc) | **yes** — verified 2026-07-31, partial match |
| `GameVault` | not recorded | — | not deployed as far as this repo shows |

The tKRW address is confirmed on-chain: the explorer reports it as `Test KRW
(tKRW)`, created by `0x5E…F1C0`, and its source is published — solc 0.8.24,
optimizer on, 200 runs, EVM paris, `src/TestKRW.sol`.

Blockscout calls it a **partial match**, which is the expected outcome here and
not a defect: the runtime bytecode matches the compiled source exactly, and only
the trailing metadata hash differs, because the deploy and this verification did
not compile from byte-identical settings (this repo builds solc through the
solc-js package rather than a native binary). Source, ABI and the Read/Write
tabs all work, which is what verification is for.

Still not recorded: the deployment block and the faucet wallet. Neither is
needed to read the contract, but `GAMEVAULT_DEPLOY_BLOCK`-style optimisations
would want the former.

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
