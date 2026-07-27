// The decisive test. Pricing off a *measured* volatility only preserves the
// house edge if the measurement is good, so: simulate a real price process,
// measure vol the way the app does, build the grid from that measurement, then
// score every offered cell against the TRUE process. Reports the realised edge.
import { measureVol, type Tick } from "../lib/vol";
import { bandStep, bandProbability, cellMultiplier, HOUSE_EDGE } from "../lib/grid";

let seed = 7;
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

function makeTicks(vol: number, seconds: number, ticksPerSec: number, bounceBp: number): Tick[] {
  const out: Tick[] = [];
  let p = 118_000;
  let t = 0;
  const end = seconds * 1000;
  while (t < end) {
    const dtMs = (1000 / ticksPerSec) * (0.4 + 1.2 * rand());
    p *= Math.exp(vol * Math.sqrt(dtMs / 1000) * gauss());
    t += dtMs;
    const noise = bounceBp ? (rand() < 0.5 ? -1 : 1) * p * bounceBp * 1e-4 : 0;
    out.push({ t: Math.round(t), p: p + noise });
  }
  return out;
}

const HORIZONS = [10, 16, 22, 28, 34, 40, 46];

/** True EV of every cell the grid would offer, given the measured vol. */
function scoreGrid(measured: number, trueVol: number, price: number) {
  const step = bandStep(price, measured);
  let worstPlayer = 0; // largest EV handed to the player
  let evWeighted = 0; // EV weighted by how likely each cell is to be tapped
  let weight = 0;
  let cells = 0;
  for (const h of HORIZONS) {
    for (let b = -60; b <= 60; b++) {
      const lo = b * step;
      const m = cellMultiplier(lo, lo + step, h, price, measured);
      if (m <= 0) continue;
      const pTrue = bandProbability(lo, lo + step, h, price, trueVol);
      const ev = pTrue * m;
      cells++;
      worstPlayer = Math.max(worstPlayer, ev);
      // weight by true probability: the cells players land on most often
      evWeighted += ev * pTrue;
      weight += pTrue;
    }
  }
  return { evAvg: evWeighted / weight, worstPlayer, cells };
}

function trial(trueVol: number, windowSec: number, bounceBp: number) {
  const ticks = makeTicks(trueVol, windowSec, 14, bounceBp);
  const m = measureVol(ticks);
  if (m.vol === null) return null;
  return { measured: m.vol, ...scoreGrid(m.vol, trueVol, 118_000) };
}

function summary(label: string, trueVol: number, windowSec: number, bounceBp: number, trials: number) {
  const evs: number[] = [];
  const volErrs: number[] = [];
  let worst = 0;
  let blocked = 0;
  for (let i = 0; i < trials; i++) {
    const r = trial(trueVol, windowSec, bounceBp);
    if (!r) {
      blocked++; // estimator refused — the game would not be quoting here
      continue;
    }
    evs.push(r.evAvg);
    volErrs.push(r.measured / trueVol - 1);
    worst = Math.max(worst, r.worstPlayer);
  }
  if (!evs.length) {
    console.log(`${label.padEnd(34)} NO QUOTES — estimator refused all ${trials} trials (game paused)`);
    return { mean: NaN, p95: NaN };
  }
  evs.sort((a, b) => a - b);
  const mean = evs.reduce((a, b) => a + b, 0) / evs.length;
  const p05 = evs[Math.floor(evs.length * 0.05)];
  const p95 = evs[Math.floor(evs.length * 0.95)];
  const volErrAbs = volErrs.map(Math.abs).sort((a, b) => a - b);
  const medErr = volErrAbs[Math.floor(volErrAbs.length / 2)];
  const p95Err = volErrAbs[Math.floor(volErrAbs.length * 0.95)];
  const edge = (1 - mean) * 100;
  console.log(
    `${label.padEnd(34)} vol err med ${(medErr * 100).toFixed(1)}% p95 ${(p95Err * 100).toFixed(1)}%` +
      `  |  edge ${edge >= 0 ? " " : ""}${edge.toFixed(2)}%` +
      `  (EV p05 ${p05.toFixed(3)} · p95 ${p95.toFixed(3)})` +
      `  worst cell ${worst.toFixed(2)}` +
      `  paused ${((blocked / trials) * 100).toFixed(0)}%`
  );
  return { mean, p95 };
}

console.log(`target edge ${(HOUSE_EDGE * 100).toFixed(0)}%  (EV 0.93 — above 1.00 means the player profits)\n`);

console.log("clean feed, no bid/ask bounce:");
for (const w of [120, 300, 600]) summary(`  window ${w}s, vol 1e-4`, 0.0001, w, 0, 120);

console.log("\nwith ±1bp bid/ask bounce on every print (realistic BTC):");
for (const w of [120, 300, 600]) summary(`  window ${w}s, vol 1e-4`, 0.0001, w, 1.0, 120);

console.log("\nacross volatility regimes (600s window, ±1bp bounce):");
for (const v of [0.00004, 0.0001, 0.00025]) summary(`  vol ${v}`, v, 600, 1.0, 120);

console.log("\nrealistic BTC spread (0.1bp — Coinbase BTC-USD sits near $1-2 on $118k):");
for (const v of [0.00004, 0.0001, 0.00025]) summary(`  vol ${v}`, v, 600, 0.1, 120);

console.log("\nstress: wide spread (1bp) — the gate should refuse rather than misquote:");
for (const v of [0.00004, 0.0001]) summary(`  vol ${v}`, v, 600, 1.0, 120);
