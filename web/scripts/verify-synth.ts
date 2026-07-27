// VOLT — our own market. Two claims to check.
//
// 1. The path really has the volatility the schedule declares. If it doesn't,
//    the grid is priced against a process that isn't the one being played.
// 2. Because the volatility is declared rather than estimated, the house edge
//    is EXACT — not 6.5–6.8% like the BTC market, where the estimate carries
//    error that lands straight in the payouts.
import {
  SynthPath,
  replayPrice,
  sigmaAt,
  integratedVariance,
  synthSigma,
  SYNTH_STEP_MS,
  SYNTH_BASE_PRICE,
} from "../lib/synth";
import { cellMultiplierAt, bandProbabilityAt, bandStepAt, HOUSE_EDGE, MAX_MULT } from "../lib/grid";

let fails = 0;
const ok = (cond: boolean, msg: string, extra = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"} ${msg}${extra ? "  — " + extra : ""}`);
  if (!cond) fails++;
};
const annual = (v: number) => v * Math.sqrt(365 * 24 * 3600) * 100;

console.log("1. the declared volatility schedule");
{
  let lo = Infinity;
  let hi = 0;
  for (let t = 0; t < 600_000; t += 500) {
    const s = sigmaAt(t);
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }
  console.log(`  σ ranges ${annual(lo).toFixed(0)}%/yr (calm) … ${annual(hi).toFixed(0)}%/yr (storm), ${(hi / lo).toFixed(1)}× swing`);
  ok(hi / lo > 4, "the market genuinely changes regime", `${(hi / lo).toFixed(1)}× between calm and storm`);
  ok(lo > 0 && hi < 0.01, "and stays in a sane range");
}

console.log("\n2. the path is reproducible from its seed");
{
  const seed = 0xc0ffee;
  const origin = 1_700_000_000_000;
  const a = new SynthPath(seed, origin);
  const t = origin + 137_400;
  const viaWalk = a.priceAt(t);
  const viaReplay = replayPrice(seed, origin, t);
  ok(Math.abs(viaWalk - viaReplay) < 1e-9, "a fresh replay lands on the same price", `${viaWalk.toFixed(6)}`);

  // stepping there in pieces must equal going straight there
  const b = new SynthPath(seed, origin);
  for (let x = origin; x < t; x += 3_100) b.priceAt(x);
  ok(Math.abs(b.priceAt(t) - viaWalk) < 1e-9, "and so does walking there in uneven steps");

  const other = replayPrice(seed + 1, origin, t);
  ok(Math.abs(other - viaWalk) > 1e-6, "a different seed gives a different market");
}

console.log("\n3. the generated path has the variance the schedule promises");
{
  // Realised variance of many independent paths over the same window, compared
  // with what integratedVariance says it should be.
  const origin = 0;
  const t0 = 200_000;
  const HORIZONS = [10_000, 28_000, 46_000];
  for (const h of HORIZONS) {
    const want = integratedVariance(t0, t0 + h);
    let sum = 0;
    const N = 4000;
    for (let k = 0; k < N; k++) {
      const path = new SynthPath(1000 + k, origin);
      const p0 = path.priceAt(t0);
      const p1 = path.priceAt(t0 + h);
      const r = Math.log(p1 / p0);
      sum += r * r;
    }
    const got = sum / N;
    const err = Math.abs(got / want - 1) * 100;
    ok(err < 6, `h=${h / 1000}s realised variance matches the schedule`, `want ${want.toExponential(3)}, got ${got.toExponential(3)} (${err.toFixed(1)}% off, n=${N})`);
  }
}

console.log("\n4. every offered cell pays exactly the edge");
{
  const price = SYNTH_BASE_PRICE;
  let worst = 0;
  let cells = 0;
  for (const t0 of [0, 45_000, 120_000, 260_000]) {
    const step = bandStepAt(synthSigma(price, t0, t0 + 28_000));
    for (const h of [10_000, 20_000, 28_000, 36_000, 46_000]) {
      const sigma = synthSigma(price, t0, t0 + h);
      for (let b = -80; b <= 80; b++) {
        const m = cellMultiplierAt(b * step, (b + 1) * step, sigma);
        if (m <= 0) continue;
        const ev = bandProbabilityAt(b * step, (b + 1) * step, sigma) * m;
        worst = Math.max(worst, Math.abs(ev - (1 - HOUSE_EDGE)));
        cells++;
      }
    }
  }
  ok(worst < 1e-12, `EV is exactly ${(1 - HOUSE_EDGE).toFixed(2)} on all ${cells} offered cells`, `max deviation ${worst.toExponential(2)}`);
  console.log(`       (BTC's realised edge is 6.5–6.8% because its σ is estimated; here σ is declared)`);
}

console.log("\n5. the grid stays playable across the whole volatility cycle");
{
  const price = SYNTH_BASE_PRICE;
  console.log("  t(s)".padEnd(8) + "σ/yr".padStart(9) + "band".padStart(10) + "cells".padStart(7) + "  ladder");
  for (const t0 of [0, 24_000, 48_000, 72_000, 96_000]) {
    const step = bandStepAt(synthSigma(price, t0, t0 + 28_000));
    const sigma = synthSigma(price, t0, t0 + 28_000);
    const mults: number[] = [];
    for (let b = -80; b <= 80; b++) {
      const m = cellMultiplierAt(b * step, (b + 1) * step, sigma);
      if (m > 0) mults.push(m);
    }
    mults.sort((a, b) => a - b);
    ok(mults.length >= 8, `t=${t0 / 1000}s offers a full grid`, `${mults.length} cells`);
    console.log(
      `  ${String(t0 / 1000).padEnd(6)}` +
        `${annual(sigmaAt(t0)).toFixed(0)}%`.padStart(9) +
        `$${step.toFixed(3)}`.padStart(10) +
        String(mults.length).padStart(7) +
        `  ${mults[0].toFixed(1)}× … ${mults[mults.length - 1].toFixed(1)}×`
    );
  }
  console.log(`       (MAX_MULT ${MAX_MULT}; the ladder is scale-invariant, the band height is not)`);
}

console.log("\n6. it never needs the network and never goes quiet");
{
  const path = new SynthPath(7, 0);
  let moved = 0;
  let prev = path.priceAt(0);
  for (let t = SYNTH_STEP_MS; t <= 120_000; t += SYNTH_STEP_MS) {
    const p = path.priceAt(t);
    if (p !== prev) moved++;
    prev = p;
  }
  const steps = 120_000 / SYNTH_STEP_MS;
  ok(moved === steps, "every single tick moves the price", `${moved}/${steps}`);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
