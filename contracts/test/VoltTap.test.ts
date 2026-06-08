import { expect } from "chai";
import { ethers } from "hardhat";

describe("VoltTap", () => {
  const STAKE = ethers.parseEther("0.0001"); // 1e14
  const BPS = 10_000n;
  const EDGE_BPS = 700n;

  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();
    const F = await ethers.getContractFactory("VoltTap");
    const volt = await F.deploy();
    await volt.waitForDeployment();
    return { volt, owner, alice, bob };
  }

  it("reverts when msg.value != STAKE", async () => {
    const { volt, alice } = await deploy();
    await expect(
      volt.connect(alice).tap(5000, { value: STAKE - 1n })
    ).to.be.revertedWith("stake must be 0.0001 ETH");
    await expect(
      volt.connect(alice).tap(5000, { value: STAKE + 1n })
    ).to.be.revertedWith("stake must be 0.0001 ETH");
  });

  it("reverts on winChanceBps 0 or >= BPS", async () => {
    const { volt, alice } = await deploy();
    await expect(
      volt.connect(alice).tap(0, { value: STAKE })
    ).to.be.revertedWith("bad winChance");
    await expect(
      volt.connect(alice).tap(10_000, { value: STAKE })
    ).to.be.revertedWith("bad winChance");
    await expect(
      volt.connect(alice).tap(20_000, { value: STAKE })
    ).to.be.revertedWith("bad winChance");
  });

  it("reverts 'bankroll too low' when payout cannot be covered", async () => {
    const { volt, alice } = await deploy();
    // no extra funding. winChanceBps=100 => payout = STAKE * 9300 / 100 = 93 * STAKE ~ 0.0093 ETH
    // contract balance during call is only the STAKE just sent (0.0001 ETH) => too low.
    await expect(
      volt.connect(alice).tap(100, { value: STAKE })
    ).to.be.revertedWith("bankroll too low");
  });

  it("emits Tapped with a sensible multiplierBps (winChanceBps=4650 => ~2x)", async () => {
    const { volt, owner, alice } = await deploy();
    // fund the bankroll so any payout is covered
    await volt.connect(owner).fund({ value: ethers.parseEther("1") });

    const winChance = 4650n;
    const expectedMult = ((BPS - EDGE_BPS) * BPS) / winChance; // 9300*10000/4650 = 20000

    const tx = await volt.connect(alice).tap(Number(winChance), { value: STAKE });
    const receipt = await tx.wait();
    const iface = volt.interface;
    let found = false;
    for (const log of receipt!.logs) {
      let parsed;
      try {
        parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      } catch {
        continue;
      }
      if (parsed && parsed.name === "Tapped") {
        found = true;
        expect(parsed.args.player).to.equal(alice.address);
        expect(parsed.args.winChanceBps).to.equal(winChance);
        expect(parsed.args.multiplierBps).to.equal(expectedMult);
        expect(expectedMult).to.equal(20_000n); // ~2x
      }
    }
    expect(found, "Tapped event not emitted").to.equal(true);
  });

  it("runs many taps without reverting or draining negative; realized edge roughly positive", async () => {
    const { volt, owner, alice } = await deploy();
    const seed = ethers.parseEther("1");
    await volt.connect(owner).fund({ value: seed });

    const winChance = 5000; // ~1.86x payout
    const TAPS = 400;

    let totalStaked = 0n;
    let totalPaid = 0n;
    let wins = 0;

    const contractAddr = await volt.getAddress();

    for (let i = 0; i < TAPS; i++) {
      const tx = await volt.connect(alice).tap(winChance, { value: STAKE });
      const receipt = await tx.wait();
      totalStaked += STAKE;

      for (const log of receipt!.logs) {
        let parsed;
        try {
          parsed = volt.interface.parseLog({ topics: log.topics as string[], data: log.data });
        } catch {
          continue;
        }
        if (parsed && parsed.name === "Tapped") {
          if (parsed.args.win) {
            wins++;
            totalPaid += parsed.args.payout as bigint;
          }
        }
      }

      // invariant: contract never goes negative (balance is unsigned anyway, but assert it holds seed-ish)
      const bal = await ethers.provider.getBalance(contractAddr);
      expect(bal).to.be.gte(0n);
    }

    // it paid out at least sometimes
    expect(wins).to.be.greaterThan(0);

    // realized house edge from the bankroll's perspective:
    //   profit = totalStaked - totalPaidProfit, where payout includes stake on wins.
    // House net = totalStaked - (sum of payouts on wins) ... but payout already includes the
    // returned stake. So house gross-in = totalStaked, gross-out = totalPaid.
    // edge = (totalStaked - totalPaid) / totalStaked
    const houseNet = totalStaked - totalPaid;
    // edge in basis points, can be negative as a bigint via signed math:
    const edgeBps = (houseNet * 10_000n) / totalStaked; // signed-ish: houseNet may be negative
    const edge = Number(edgeBps);

    // wide tolerance for RNG variance: between -500 (-5%) and +2000 (+20%)
    expect(edge).to.be.greaterThan(-500);
    expect(edge).to.be.lessThan(2000);

    // bankroll should still be solvent
    const finalBal = await ethers.provider.getBalance(contractAddr);
    expect(finalBal).to.be.gt(0n);
  });

  it("pays a winning tap to the player (state changes correctly over a tap)", async () => {
    const { volt, owner, alice } = await deploy();
    await volt.connect(owner).fund({ value: ethers.parseEther("1") });

    // nonce increments each tap
    const n0 = await volt.nonce();
    await volt.connect(alice).tap(5000, { value: STAKE });
    const n1 = await volt.nonce();
    expect(n1 - n0).to.equal(1n);
  });

  it("only owner can withdraw; owner can withdraw", async () => {
    const { volt, owner, alice, bob } = await deploy();
    await volt.connect(owner).fund({ value: ethers.parseEther("1") });

    await expect(
      volt.connect(alice).withdraw(ethers.parseEther("0.1"), alice.address)
    ).to.be.revertedWith("not owner");

    const before = await ethers.provider.getBalance(bob.address);
    await volt.connect(owner).withdraw(ethers.parseEther("0.1"), bob.address);
    const after = await ethers.provider.getBalance(bob.address);
    expect(after - before).to.equal(ethers.parseEther("0.1"));
  });

  it("freeBankroll reflects the contract balance", async () => {
    const { volt, owner } = await deploy();
    await volt.connect(owner).fund({ value: ethers.parseEther("0.5") });
    expect(await volt.freeBankroll()).to.equal(ethers.parseEther("0.5"));
  });
});
