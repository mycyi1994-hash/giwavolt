// Does the realized-vol estimator actually recover the volatility of a price
// series? If it doesn't, the whole grid is mispriced, so this is the load-
// bearing test for the real-price switch.
import { measureVol, measureVolForPricing, VOL_MIN, VOL_MAX, type Tick } from "../lib/vol";

// Box-Muller with a fixed seed so the run is reproducible.
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** GBM sampled at irregular tick intervals, the way a trade feed arrives. */
function makeTicks(volPerSqrtSec: number, seconds: number, ticksPerSec: number, bidAskBp = 0): Tick[] {
  const out: Tick[] = [];
  let p = 118_000;
  let t = Date.now() - seconds * 1000;
  const end = t + seconds * 1000;
  while (t < end) {
    const dtMs = (1000 / ticksPerSec) * (0.4 + 1.2 * rand()); // jittered arrivals
    const dt = dtMs / 1000;
    p *= Math.exp(volPerSqrtSec * Math.sqrt(dt) * gauss());
    t += dtMs;
    // microstructure noise: trades print alternately at bid and ask
    const noise = bidAskBp ? (rand() < 0.5 ? -1 : 1) * p * bidAskBp * 1e-4 : 0;
    out.push({ t: Math.round(t), p: p + noise });
  }
  return out;
}

let fails = 0;
function check(name: string, got: number | null, want: number, tolPct: number) {
  if (got === null) {
    console.log(`  FAIL ${name}: estimator returned null`);
    fails++;
    return;
  }
  const errPct = Math.abs(got / want - 1) * 100;
  const ok = errPct <= tolPct;
  if (!ok) fails++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"} ${name}: want ${want.toExponential(2)}, got ${got.toExponential(2)} (${errPct.toFixed(1)}% off, tol ${tolPct}%)`
  );
}

console.log("recovering a known volatility from a simulated tick feed:");
for (const vol of [0.00004, 0.0001, 0.00025]) {
  const r = measureVol(makeTicks(vol, 240, 12));
  check(`vol=${vol}, 240s @ 12 ticks/s`, r.vol, vol, 20);
}

console.log("\nwith ±1bp bid/ask bounce — 10× a real BTC spread, so noise dominates:");
const noisy = makeTicks(0.0001, 240, 20, 1.0);
const onGrid = measureVol(noisy);
// Correct behaviour here is to refuse: after noise removal too little variance
// survives for the estimate to be worth quoting odds against.
console.log(`  ${onGrid.vol === null ? "PASS" : "FAIL"} estimator ${onGrid.vol === null ? "refused (game pauses)" : `returned ${onGrid.vol.toExponential(2)}`}`);
if (onGrid.vol !== null) fails++;
// tick-by-tick for comparison — this is what a naive estimator would report
let s = 0;
let n = 0;
for (let i = 1; i < noisy.length; i++) {
  const dt = (noisy[i].t - noisy[i - 1].t) / 1000;
  if (dt <= 0) continue;
  const lr = Math.log(noisy[i].p / noisy[i - 1].p);
  s += (lr * lr) / dt;
  n++;
}
const naive = Math.sqrt(s / n);
console.log(`  (naive tick-by-tick would report ${naive.toExponential(2)} — ${(naive / 0.0001).toFixed(1)}× the truth)`);

console.log("\nwarm-up gate:");
const short = measureVol(makeTicks(0.0001, 20, 12));
console.log(`  ${short.vol === null ? "PASS" : "FAIL"} 20s of ticks → ${short.vol === null ? "null (refuses to quote)" : short.vol}`);
if (short.vol !== null) fails++;

const gappy: Tick[] = [
  { t: 1_000, p: 118_000 },
  { t: 2_000, p: 118_010 },
  { t: 900_000, p: 121_000 }, // 15-minute hole — must not count as a 1s return
];
const g = measureVol(gappy);
console.log(`  ${g.samples <= 1 ? "PASS" : "FAIL"} a 15-minute gap contributes ${g.samples} usable return(s)`);
if (g.samples > 1) fails++;

console.log("\nout-of-range volatility is refused, not clamped:");
{
  // Clamping a genuinely fast market down to the ceiling would under-price the
  // grid's tail cells exactly when doing so costs the most.
  const tooFast = measureVol(makeTicks(VOL_MAX * 2.5, 240, 12));
  console.log(`  ${tooFast.vol === null ? "PASS" : "FAIL"} above the ceiling → ${tooFast.vol === null ? "refused" : tooFast.vol.toExponential(2)}`);
  if (tooFast.vol !== null) fails++;
  const tooSlow = measureVol(makeTicks(VOL_MIN * 0.3, 240, 12));
  console.log(`  ${tooSlow.vol === null ? "PASS" : "FAIL"} below the floor → ${tooSlow.vol === null ? "refused" : tooSlow.vol.toExponential(2)}`);
  if (tooSlow.vol !== null) fails++;
}

console.log("\na market that STOPS must stop the game, not coast on an old reading:");
{
  // The bug this reproduces: ten minutes of real movement followed by a flat
  // stretch. The slow window still reads a healthy volatility; the fast window
  // can't measure a frozen price at all. Treating that null as "no opinion"
  // quoted 5x-50x cells on a line going nowhere — the centre cell won every
  // time, which is a money printer pointed at the house.
  const moving = makeTicks(0.0001, 540, 12);
  const lastP = moving[moving.length - 1].p;
  const lastT = moving[moving.length - 1].t;
  const frozen: Tick[] = [];
  for (let i = 1; i <= 90 * 12; i++) frozen.push({ t: lastT + i * 83, p: lastP });
  const series = [...moving, ...frozen];

  const slow = measureVol(series, 600);
  const priced = measureVolForPricing(series);
  console.log(`  slow window still reads ${slow.vol ? slow.vol.toExponential(2) : "null"} (${slow.vol ? (slow.vol * Math.sqrt(365 * 24 * 3600) * 100).toFixed(0) + "%/yr" : "-"})`);
  const refused = priced.vol === null;
  console.log(`  ${refused ? "PASS" : "FAIL"} pricing ${refused ? `refuses (${priced.reason})` : `quotes ${priced.vol!.toExponential(2)} — MONEY PRINTER`}`);
  if (!refused) fails++;

  // a near-frozen market (moving, but far too slowly) must refuse too.
  // Built by continuing from the same clock, so the two segments form one series.
  const crawl: Tick[] = [];
  let cp = lastP;
  for (let i = 1; i <= 90 * 12; i++) {
    cp *= Math.exp(VOL_MIN * 0.2 * Math.sqrt(0.083) * gauss());
    crawl.push({ t: lastT + i * 83, p: cp });
  }
  const p2 = measureVolForPricing([...moving, ...crawl]);
  console.log(`  ${p2.vol === null ? "PASS" : "FAIL"} a crawling market ${p2.vol === null ? `refuses (${p2.reason})` : "still quotes"}`);
  if (p2.vol !== null) fails++;

  // but a plain gap in the feed is NOT the same thing — the slow window stands
  const warming = makeTicks(0.0001, 300, 12).filter((tk) => tk.t < Date.now() - 200_000);
  const p3 = measureVolForPricing(warming);
  console.log(`  ${p3.vol !== null || p3.reason === "insufficient-data" ? "PASS" : "FAIL"} a gap in the feed is treated as absence, not stillness (${p3.reason})`);
  if (p3.vol === null && p3.reason !== "insufficient-data") fails++;
}

console.log("\npricing volatility follows a spike rather than lagging it:");
{
  // Volatility clusters, and a player picks their moment. A slow window that
  // hasn't caught up yet is a window they can wait for, so the quoted estimate
  // takes the larger of the slow and fast readings.
  const calm = makeTicks(0.00005, 540, 12);
  const spike = makeTicks(0.0003, 90, 12);
  const shifted = spike.map((tk, i) => ({ t: calm[calm.length - 1].t + i * 80, p: tk.p }));
  const series = [...calm, ...shifted];

  const slow = measureVol(series);
  const priced = measureVolForPricing(series);
  const ok2 = priced.vol !== null && slow.vol !== null && priced.vol > slow.vol * 1.2;
  console.log(
    `  ${ok2 ? "PASS" : "FAIL"} quoted ${priced.vol?.toExponential(2)} vs slow-window ${slow.vol?.toExponential(2)}`
  );
  if (!ok2) fails++;
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
