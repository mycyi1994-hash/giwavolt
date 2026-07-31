import { ethers, network } from "hardhat";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Deploys GameVault for the off-chain game balance (on-chain custody).
//   PRIVATE_KEY    deployer = owner
//   TESTKRW_ADDRESS  the tKRW token (else read from deployments/testKRW.<net>.json)
//   OPERATOR_ADDRESS the backend signer that authorises withdrawals. REQUIRED,
//                    and must not be the deployer — see GameVault's constructor.
//   BANKROLL_TKRW    optional tKRW to seed the house bankroll (default "0")
async function main() {
  const [deployer] = await ethers.getSigners();

  let token = process.env.TESTKRW_ADDRESS;
  if (!token) {
    try {
      token = JSON.parse(readFileSync(join(__dirname, "..", "deployments", `testKRW.${network.name}.json`), "utf8")).testKRW;
    } catch {
      throw new Error("Set TESTKRW_ADDRESS (or deploy TestKRW first).");
    }
  }
  // No defaulting to the deployer. The vault rejects operator == owner, so the
  // old default now always reverts — and reverting costs gas and reports as
  // "operator is owner" from inside the constructor, which reads like a bug in
  // the contract rather than a missing variable. Fail here, before the tx.
  const operator = process.env.OPERATOR_ADDRESS;
  if (!operator) {
    throw new Error(
      "Set OPERATOR_ADDRESS. It signs withdrawal vouchers from the server, so it must be a\n" +
        "separate address from the deployer: the deployer's key stays off the server and is what\n" +
        "revokes the operator if that server is compromised. A fresh wallet account is enough —\n" +
        "it never needs funding, it only signs."
    );
  }
  if (operator.toLowerCase() === deployer.address.toLowerCase()) {
    throw new Error("OPERATOR_ADDRESS must not be the deployer — the vault would reject it.");
  }

  console.log("Deploying GameVault with");
  console.log("  deployer/owner:", deployer.address);
  console.log("  token:         ", token);
  console.log("  operator:      ", operator);
  console.log("  network:       ", network.name);

  const V = await ethers.getContractFactory("GameVault");
  const vault = await V.deploy(token!, operator);
  await vault.waitForDeployment();
  const address = await vault.getAddress();
  console.log("GameVault:", address);

  const bankroll = process.env.BANKROLL_TKRW ?? "0";
  if (Number(bankroll) > 0) {
    const T = await ethers.getContractAt("TestKRW", token!);
    await (await T.approve(address, ethers.parseEther(bankroll))).wait();
    await (await vault.fundBankroll(ethers.parseEther(bankroll))).wait();
    console.log(`Funded bankroll with ${bankroll} tKRW`);
  }

  const out = { network: network.name, gameVault: address, token, owner: deployer.address, operator };
  const dir = join(__dirname, "..", "deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `gameVault.${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(`Wrote deployments/gameVault.${network.name}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
