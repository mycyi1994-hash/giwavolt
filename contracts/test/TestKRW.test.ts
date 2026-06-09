import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("TestKRW", () => {
  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();
    const F = await ethers.getContractFactory("TestKRW");
    const t = await F.deploy();
    await t.waitForDeployment();
    return { t, owner, alice, bob };
  }

  it("has KRW-style metadata", async () => {
    const { t } = await deploy();
    expect(await t.name()).to.equal("Test KRW");
    expect(await t.symbol()).to.equal("tKRW");
    expect(await t.decimals()).to.equal(18);
  });

  it("owner can mint, non-owner cannot", async () => {
    const { t, owner, alice } = await deploy();
    await t.mint(alice.address, 1000n);
    expect(await t.balanceOf(alice.address)).to.equal(1000n);
    await expect(t.connect(alice).mint(alice.address, 1n)).to.be.revertedWith("not owner");
  });

  it("public faucet drips and then enforces cooldown", async () => {
    const { t, alice } = await deploy();
    await t.connect(alice).faucet();
    expect(await t.balanceOf(alice.address)).to.equal(await t.FAUCET_AMOUNT());
    await expect(t.connect(alice).faucet()).to.be.revertedWith("faucet cooldown");
    await time.increase(8 * 60 * 60);
    await t.connect(alice).faucet();
    expect(await t.balanceOf(alice.address)).to.equal((await t.FAUCET_AMOUNT()) * 2n);
  });

  it("transfers and transferFrom with allowance", async () => {
    const { t, owner, alice, bob } = await deploy();
    await t.mint(owner.address, 1000n);
    await t.transfer(alice.address, 400n);
    expect(await t.balanceOf(alice.address)).to.equal(400n);

    await t.connect(alice).approve(bob.address, 250n);
    await t.connect(bob).transferFrom(alice.address, bob.address, 250n);
    expect(await t.balanceOf(bob.address)).to.equal(250n);
    await expect(t.connect(bob).transferFrom(alice.address, bob.address, 1n)).to.be.revertedWith("insufficient allowance");
  });
});
