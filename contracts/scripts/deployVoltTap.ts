import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Deploys VoltTap and (optionally) seeds the bankroll.
//   PRIVATE_KEY    deployer = owner (read from hardhat config / network accounts)
//   BANKROLL_ETH   initial bankroll to send (optional, default "0.05")
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying VoltTap with");
  console.log("  deployer/owner:", deployer.address);
  console.log("  network:       ", network.name);

  const F = await ethers.getContractFactory("VoltTap");
  const volt = await F.deploy();
  await volt.waitForDeployment();
  const address = await volt.getAddress();
  console.log("VoltTap:", address);

  const bankroll = process.env.BANKROLL_ETH ?? "0.05";
  if (bankroll && Number(bankroll) > 0) {
    const tx = await deployer.sendTransaction({ to: address, value: ethers.parseEther(bankroll) });
    await tx.wait();
    console.log(`Funded bankroll with ${bankroll} ETH`);
  }

  const out = { network: network.name, voltTap: address, owner: deployer.address };
  const dir = join(__dirname, "..", "deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `voltTap.${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(`Wrote deployments/voltTap.${network.name}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
