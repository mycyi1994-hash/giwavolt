import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Deploys SlideGame and (optionally) seeds the bankroll.
//   PRIVATE_KEY        deployer = default admin/oracle/treasury
//   ADMIN_ADDRESS      override (optional)
//   ORACLE_ADDRESS     override (optional)
//   TREASURY_ADDRESS   override (optional)
//   BANKROLL_ETH       initial bankroll to send (optional, e.g. "1.0")
async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  const oracle = process.env.ORACLE_ADDRESS || deployer.address;
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;

  console.log("Deploying SlideGame with");
  console.log("  deployer:", deployer.address);
  console.log("  admin:   ", admin);
  console.log("  oracle:  ", oracle);
  console.log("  treasury:", treasury);

  const F = await ethers.getContractFactory("SlideGame");
  const game = await F.deploy(admin, oracle, treasury);
  await game.waitForDeployment();
  const address = await game.getAddress();
  console.log("SlideGame:", address);

  const bankroll = process.env.BANKROLL_ETH;
  if (bankroll) {
    const tx = await deployer.sendTransaction({ to: address, value: ethers.parseEther(bankroll) });
    await tx.wait();
    console.log(`Funded bankroll with ${bankroll} ETH`);
  }

  const out = { network: network.name, slideGame: address, admin, oracle, treasury };
  const dir = join(__dirname, "..", "deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(`Wrote deployments/${network.name}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
