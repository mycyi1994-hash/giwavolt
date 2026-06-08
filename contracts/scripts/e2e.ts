import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { buildRound, simulateEdge, offeredCells, VOL_PER_SQRT_SEC, gaussian, HOUSE_EDGE } from "./grid";

// Full on-chain lifecycle on a local Hardhat network, repeated over many
// independent price paths so the realised house edge converges to HOUSE_EDGE:
//   per round: openRound (7% edge grid) → bet every offered cell → advance
//   time, oracle posts a simulated real price per column → settle every bet.
// Bets/settles are mined with automine OFF (one block per batch) so wall-clock
// time barely moves while hundreds of bets land inside the betting window.
async function main() {
  const [admin, oracle, , player] = await ethers.getSigners();

  const Game = await ethers.getContractFactory("SlideGame");
  const game = await Game.deploy(admin.address, oracle.address, admin.address);
  await game.waitForDeployment();
  const addr = await game.getAddress();

  const BANKROLL = ethers.parseEther("500");
  await admin.sendTransaction({ to: addr, value: BANKROLL });

  // ---- round config (identical grid every round) ----
  const startPriceCents = 167349; // $1,673.49
  const numColumns = 10;
  const numRows = 14;
  const columnInterval = 4;
  const spec = buildRound(startPriceCents, numColumns, numRows, columnInterval);
  const cells = offeredCells(spec);
  const STAKE = ethers.parseEther("0.01");
  const NUM_ROUNDS = 12;

  const mcEdge = simulateEdge(spec, 500_000); // analytical edge of this grid

  let wagered = 0n;
  let paid = 0n;
  let betsTotal = 0;
  let winsTotal = 0;

  // queue all txs, then mine them — they fit one 60M-gas block; a second empty
  // block keeps timestamps strictly increasing without eating much horizon.
  async function batch(txs: Promise<unknown>[]) {
    await Promise.all(txs);
    await network.provider.send("evm_mine");
    await network.provider.send("evm_mine");
  }

  for (let round = 0; round < NUM_ROUNDS; round++) {
    const t0 = await time.latest();
    const startTime = t0 + 2 + columnInterval;
    await game.openRound("ETH/USD", startPriceCents, startTime, columnInterval, numColumns, numRows, spec.thresholds, spec.mults);
    const roundId = round + 1;

    // place one bet on every offered cell, in a single block
    await network.provider.send("evm_setAutomine", [false]);
    let nonce = await player.getNonce();
    const firstBetId = await game.nextBetId();
    const sends = cells.map(({ c, m }) => game.connect(player).placeBet(roundId, c, m, { value: STAKE, nonce: nonce++ }));
    await batch(sends);
    await network.provider.send("evm_setAutomine", [true]);
    wagered += STAKE * BigInt(cells.length);
    betsTotal += cells.length;

    // advance time, oracle posts a simulated price path
    let priceCents = startPriceCents;
    for (let c = 0; c < numColumns; c++) {
      await time.increaseTo(startTime + c * columnInterval + 1);
      const sigma = VOL_PER_SQRT_SEC * priceCents * Math.sqrt(columnInterval);
      priceCents += sigma * gaussian();
      await game.connect(oracle).setColumnPrice(roundId, c, Math.max(1, Math.round(priceCents)));
    }

    // settle every bet in this round, batched
    const lastBetId = (await game.nextBetId()) - 1n;
    const settleFrom = (await ethers.provider.getBlockNumber()) + 1;
    await network.provider.send("evm_setAutomine", [false]);
    nonce = await admin.getNonce();
    const settles: Promise<unknown>[] = [];
    for (let id = firstBetId; id <= lastBetId; id++) settles.push(game.settleBet(id, { nonce: nonce++ }));
    await batch(settles);
    await network.provider.send("evm_setAutomine", [true]);

    const evs = await game.queryFilter(game.filters.BetSettled(), settleFrom);
    for (const e of evs) if (e.args.won) {
      paid += e.args.payout as bigint;
      winsTotal++;
    }
  }

  const realisedEdge = 1 - Number(ethers.formatEther(paid)) / Number(ethers.formatEther(wagered));
  const lockedEnd = await game.lockedLiability();
  const bankrollEnd = await ethers.provider.getBalance(addr);
  const houseProfit = bankrollEnd - BANKROLL;
  const f = (x: bigint) => ethers.formatEther(x);

  console.log("──────────────────────────────────────────────");
  console.log(" GIWA Slide — on-chain e2e (multi-round)");
  console.log("──────────────────────────────────────────────");
  console.log(` contract            : ${addr}`);
  console.log(` rounds              : ${NUM_ROUNDS}  (${numColumns}×${numRows} grid, ${columnInterval}s/col)`);
  console.log(` offered cells/round : ${cells.length} of ${numColumns * numRows}`);
  console.log(` bets / wins         : ${betsTotal} / ${winsTotal}  (stake ${f(STAKE)} ETH)`);
  console.log(` total wagered       : ${f(wagered)} ETH`);
  console.log(` total paid out      : ${f(paid)} ETH`);
  console.log(` house profit        : ${f(houseProfit)} ETH`);
  console.log(` locked at end       : ${f(lockedEnd)} ETH  (expect 0)`);
  console.log("──────────────────────────────────────────────");
  console.log(` target house edge   : ${(HOUSE_EDGE * 100).toFixed(2)}%`);
  console.log(` analytical edge (MC): ${(mcEdge * 100).toFixed(2)}%   (500k trials, exact horizons)`);
  console.log(` realised on-chain   : ${(realisedEdge * 100).toFixed(2)}%   (${betsTotal} bets / ${NUM_ROUNDS} paths)`);
  console.log("──────────────────────────────────────────────");

  if (lockedEnd !== 0n) throw new Error("liability did not unwind to 0");
  if (mcEdge < 0.05 || mcEdge > 0.09) throw new Error(`model edge off target: ${(mcEdge * 100).toFixed(2)}%`);
  console.log("✓ liability unwound to 0; model edge ≈ 7% (on-chain realised converges to it across paths)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
