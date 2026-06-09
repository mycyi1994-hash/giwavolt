import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Deploys TestKRW (tKRW) and mints an initial supply to the faucet wallet so
// the server-side faucet has tokens to hand out.
//   PRIVATE_KEY   deployer = owner (read from hardhat config / network accounts)
//   FAUCET_WALLET address that will run the push faucet (default: deployer)
//   FAUCET_SEED   tKRW to mint to the faucet wallet (default "1000000000", i.e. 1e9 tKRW)
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying TestKRW with");
  console.log("  deployer/owner:", deployer.address);
  console.log("  network:       ", network.name);

  const F = await ethers.getContractFactory("TestKRW");
  const t = await F.deploy();
  await t.waitForDeployment();
  const address = await t.getAddress();
  console.log("TestKRW:", address);

  const faucetWallet = process.env.FAUCET_WALLET ?? deployer.address;
  const seed = process.env.FAUCET_SEED ?? "1000000000"; // 1,000,000,000 tKRW
  if (Number(seed) > 0) {
    const tx = await t.mint(faucetWallet, ethers.parseEther(seed));
    await tx.wait();
    console.log(`Minted ${seed} tKRW to faucet wallet ${faucetWallet}`);
  }

  const out = { network: network.name, testKRW: address, owner: deployer.address, faucetWallet };
  const dir = join(__dirname, "..", "deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `testKRW.${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(`Wrote deployments/testKRW.${network.name}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
