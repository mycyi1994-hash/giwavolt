import { expect } from "chai";
import { ethers } from "hardhat";

describe("GameVault", () => {
  async function deploy() {
    const [owner, operator, alice, bob] = await ethers.getSigners();
    const T = await ethers.getContractFactory("TestKRW");
    const token = await T.deploy();
    await token.waitForDeployment();
    const V = await ethers.getContractFactory("GameVault");
    const vault = await V.deploy(await token.getAddress(), operator.address);
    await vault.waitForDeployment();
    // give alice tokens + house bankroll
    await token.mint(alice.address, ethers.parseEther("1000000"));
    await token.mint(owner.address, ethers.parseEther("1000000"));
    return { token, vault, owner, operator, alice, bob };
  }

  async function signVoucher(vault: any, operator: any, user: string, cumulative: bigint) {
    const domain = {
      name: "GameVault",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await vault.getAddress(),
    };
    const types = { Withdraw: [{ name: "user", type: "address" }, { name: "cumulative", type: "uint256" }] };
    return operator.signTypedData(domain, types, { user, cumulative });
  }

  it("accepts deposits and tracks lifetime", async () => {
    const { token, vault, alice } = await deploy();
    await token.connect(alice).approve(await vault.getAddress(), ethers.parseEther("500000"));
    await vault.connect(alice).deposit(ethers.parseEther("300000"));
    expect(await vault.deposited(alice.address)).to.equal(ethers.parseEther("300000"));
    expect(await vault.freeBankroll()).to.equal(ethers.parseEther("300000"));
  });

  it("pays out an operator-signed cumulative voucher to the user only", async () => {
    const { token, vault, owner, operator, alice } = await deploy();
    // fund bankroll so winnings beyond deposits are covered
    await token.connect(owner).approve(await vault.getAddress(), ethers.parseEther("1000000"));
    await vault.connect(owner).fundBankroll(ethers.parseEther("500000"));

    const before = await token.balanceOf(alice.address);
    const cumulative = ethers.parseEther("120000");
    const sig = await signVoucher(vault, operator, alice.address, cumulative);
    // a relayer (bob/owner) can submit; funds still go to alice
    await vault.connect(owner).withdraw(alice.address, cumulative, sig);
    expect(await token.balanceOf(alice.address)).to.equal(before + cumulative);
    expect(await vault.withdrawn(alice.address)).to.equal(cumulative);
  });

  it("is idempotent / monotonic on cumulative", async () => {
    const { token, vault, owner, operator, alice } = await deploy();
    await token.connect(owner).approve(await vault.getAddress(), ethers.parseEther("1000000"));
    await vault.connect(owner).fundBankroll(ethers.parseEther("500000"));

    const c1 = ethers.parseEther("50000");
    await vault.withdraw(alice.address, c1, await signVoucher(vault, operator, alice.address, c1));
    // re-submitting the same cumulative pays nothing
    await expect(vault.withdraw(alice.address, c1, await signVoucher(vault, operator, alice.address, c1))).to.be.revertedWith("nothing to withdraw");
  });

  it("delta-only on increasing cumulative", async () => {
    const { token, vault, owner, operator, alice } = await deploy();
    await token.connect(owner).approve(await vault.getAddress(), ethers.parseEther("1000000"));
    await vault.connect(owner).fundBankroll(ethers.parseEther("500000"));
    const before = await token.balanceOf(alice.address);
    await vault.withdraw(alice.address, ethers.parseEther("50000"), await signVoucher(vault, operator, alice.address, ethers.parseEther("50000")));
    await vault.withdraw(alice.address, ethers.parseEther("80000"), await signVoucher(vault, operator, alice.address, ethers.parseEther("80000")));
    expect(await token.balanceOf(alice.address)).to.equal(before + ethers.parseEther("80000"));
  });

  it("rejects a forged signature", async () => {
    const { vault, alice, bob } = await deploy();
    const cumulative = ethers.parseEther("10000");
    // bob is not the operator
    const sig = await signVoucher(vault, bob, alice.address, cumulative);
    await expect(vault.withdraw(alice.address, cumulative, sig)).to.be.revertedWith("bad sig");
  });

  it("only owner rotates operator", async () => {
    const { vault, alice, bob } = await deploy();
    await expect(vault.connect(alice).setOperator(bob.address)).to.be.revertedWith("not owner");
  });
});
