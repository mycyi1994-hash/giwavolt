import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// helper: flatten a [col][row] grid into row-major mults[col*numRows+row]
function flatten(grid: number[][]): number[] {
  const out: number[] = [];
  for (const col of grid) for (const m of col) out.push(m);
  return out;
}

describe("SlideGame", () => {
  async function deploy() {
    const [admin, oracle, treasury, alice] = await ethers.getSigners();
    const F = await ethers.getContractFactory("SlideGame");
    const game = await F.deploy(admin.address, oracle.address, treasury.address);
    await game.waitForDeployment();
    // fund the bankroll generously
    await admin.sendTransaction({ to: await game.getAddress(), value: ethers.parseEther("100") });
    return { game, admin, oracle, treasury, alice };
  }

  // 2 columns x 3 rows. thresholds [1000, 2000] => rows: <1000 | 1000..2000 | >=2000
  // multipliers (bps): everything 3x except an unbettable cell (0)
  function sampleRound() {
    const grid = [
      [30000, 20000, 30000], // column 0
      [50000, 0, 50000], //     column 1 (middle cell not bettable)
    ];
    return { numColumns: 2, numRows: 3, thresholds: [1000, 2000], mults: flatten(grid) };
  }

  it("opens a round and exposes the grid", async () => {
    const { game } = await deploy();
    const now = await time.latest();
    const { numColumns, numRows, thresholds, mults } = sampleRound();
    await game.openRound("ETH/USD", 1500, now + 100, 60, numColumns, numRows, thresholds, mults);

    const grid = await game.getGrid(1);
    expect(grid.map(Number)).to.deep.equal(mults);
    expect((await game.getThresholds(1)).map(Number)).to.deep.equal(thresholds);
  });

  it("pays a winning tap and keeps a losing stake", async () => {
    const { game, alice, oracle } = await deploy();
    const start = (await time.latest()) + 100;
    const { numColumns, numRows, thresholds, mults } = sampleRound();
    await game.openRound("ETH/USD", 1500, start, 60, numColumns, numRows, thresholds, mults);

    // Alice taps column 0, row 1 (price band 1000..2000) at 2x with 1 ETH
    const stake = ethers.parseEther("1");
    await game.connect(alice).placeBet(1, 0, 1, { value: stake }); // 2x
    // and a losing tap: column 0, row 2 (>=2000) at 3x with 1 ETH
    await game.connect(alice).placeBet(1, 0, 2, { value: stake }); // 3x

    // liability = 2 ETH + 3 ETH = 5 ETH
    expect(await game.lockedLiability()).to.equal(ethers.parseEther("5"));

    // oracle posts price 1500 for column 0 after its sample time -> row 1 wins
    await time.increaseTo(start + 1);
    await game.connect(oracle).setColumnPrice(1, 0, 1500);
    expect(await game.winningRow(1, 0)).to.equal(1);

    // settle winning bet (id 1) -> 2 ETH payout
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await game.settleBet(1); // anyone can settle; admin signer pays gas
    await tx.wait();
    const after = await ethers.provider.getBalance(alice.address);
    expect(after - before).to.equal(ethers.parseEther("2"));

    // settle losing bet (id 2) -> no payout, liability released
    await game.settleBet(2);
    expect(await game.lockedLiability()).to.equal(0);
  });

  it("rejects taps on closed columns and unbettable cells", async () => {
    const { game, alice } = await deploy();
    const start = (await time.latest()) + 100;
    const { numColumns, numRows, thresholds, mults } = sampleRound();
    await game.openRound("ETH/USD", 1500, start, 60, numColumns, numRows, thresholds, mults);

    // column 1, middle row is multiplier 0 -> not bettable
    await expect(
      game.connect(alice).placeBet(1, 1, 1, { value: ethers.parseEther("1") })
    ).to.be.revertedWith("cell not bettable");

    // move past column 0 sample time -> betting on column 0 closed
    await time.increaseTo(start + 1);
    await expect(
      game.connect(alice).placeBet(1, 0, 1, { value: ethers.parseEther("1") })
    ).to.be.revertedWith("column closed");
  });

  it("reverts a tap the bankroll cannot cover", async () => {
    const [admin, oracle, treasury, alice] = await ethers.getSigners();
    const F = await ethers.getContractFactory("SlideGame");
    const game = await F.deploy(admin.address, oracle.address, treasury.address);
    await game.waitForDeployment();
    // tiny bankroll: only fund 1 ETH
    await admin.sendTransaction({ to: await game.getAddress(), value: ethers.parseEther("1") });

    const start = (await time.latest()) + 100;
    const { numColumns, numRows, thresholds, mults } = sampleRound();
    await game.openRound("ETH/USD", 1500, start, 60, numColumns, numRows, thresholds, mults);

    // 1 ETH stake at 3x (row 2) => 3 ETH payout > 1 (bankroll) + 1 (stake) = 2 ETH balance
    await expect(
      game.connect(alice).placeBet(1, 0, 2, { value: ethers.parseEther("1") })
    ).to.be.revertedWith("bankroll too low");
  });
});
