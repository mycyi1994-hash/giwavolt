import { network, run } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

// Verify the deployed contracts' source on Giwa's Blockscout.
//
// Deploying is only half of it: until the source is verified the explorer shows
// bytecode, so a player cannot read the custody contract they are depositing
// into, and we cannot point anyone at a readable link. Run after deploying:
//
//   npm run verify:testkrw
//   npm run verify:vault
//
// Addresses come from deployments/<name>.<network>.json (written by the deploy
// scripts) or from the environment, so a redeploy needs no edits here.
//
// Verification is idempotent — re-running against an already-verified address
// reports "Already Verified" and exits 0, so this is safe to repeat.

type Target = { label: string; address: string; args: unknown[] };

function fromManifest(file: string, key: string): string | undefined {
  try {
    const j = JSON.parse(readFileSync(join(__dirname, "..", "deployments", file), "utf8"));
    return j[key];
  } catch {
    return undefined;
  }
}

function resolve(which: string): Target {
  const net = network.name;
  if (which === "testkrw") {
    const address = process.env.TESTKRW_ADDRESS ?? fromManifest(`testKRW.${net}.json`, "testKRW");
    if (!address) throw new Error(`No TestKRW address. Set TESTKRW_ADDRESS or deploy first.`);
    return { label: "TestKRW", address, args: [] }; // no constructor args
  }
  if (which === "vault") {
    const address = process.env.GAMEVAULT_ADDRESS ?? fromManifest(`gameVault.${net}.json`, "gameVault");
    if (!address) throw new Error(`No GameVault address. Set GAMEVAULT_ADDRESS or deploy first.`);
    // GameVault's constructor takes (token, operator) and verification fails
    // unless both are byte-identical to what was passed at deploy time.
    const token = process.env.TESTKRW_ADDRESS ?? fromManifest(`gameVault.${net}.json`, "token");
    const operator = process.env.OPERATOR_ADDRESS ?? fromManifest(`gameVault.${net}.json`, "operator");
    if (!token || !operator) {
      throw new Error("GameVault needs its constructor args: set TESTKRW_ADDRESS and OPERATOR_ADDRESS.");
    }
    return { label: "GameVault", address, args: [token, operator] };
  }
  throw new Error(`Unknown target "${which}" — expected "testkrw" or "vault".`);
}

async function main() {
  const which = process.argv[2] ?? process.env.VERIFY_TARGET;
  if (!which) throw new Error('Usage: hardhat run scripts/verify.ts --network giwaSepolia -- <testkrw|vault>');
  const t = resolve(which);
  console.log(`Verifying ${t.label} at ${t.address} on ${network.name}`);
  if (t.args.length) console.log("  constructor args:", t.args);
  await run("verify:verify", { address: t.address, constructorArguments: t.args });
}

main().catch((e) => {
  // "Already Verified" is the success case on a re-run, not a failure.
  if (String(e?.message ?? e).toLowerCase().includes("already verified")) {
    console.log("Already verified — nothing to do.");
    return;
  }
  console.error(e);
  process.exitCode = 1;
});
