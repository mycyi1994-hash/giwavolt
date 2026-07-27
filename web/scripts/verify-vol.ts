// Does the realized-vol estimator actually recover the volatility of a price
// series? If it doesn't, the whole grid is mispriced, so this is the load-
// bearing test for the real-price switch.
import { measureVol, type Tick } from "../lib/priceFeed";

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

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
