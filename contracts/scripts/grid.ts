// Shared multiplier model for the on-chain grid — a TypeScript port of
// game/web/lib/grid.ts. Prices are integers ("cents" = price * 100) so the
// contract's band thresholds are exact uint128s.
//
// Each band is priced with the EXACT normal-CDF probability of the price
// landing in it (catch-all top/bottom bands use the true tail mass), then
// shaved by the house edge:
//   prob = Φ(hi/σ) − Φ(lo/σ),   σ = VOL * price * sqrt(h)
//   multiplier = (1 - EDGE) / prob   (clamped)
// As long as the real price has volatility VOL, the expected value of every
// bet is (1 - EDGE), so the house keeps EDGE of all volume on average.

export const HOUSE_EDGE = 0.07; // 7%
export const MAX_MULT = 30;
export const MIN_MULT = 1.1;
export const VOL_PER_SQRT_SEC = 0.00045;
export const STEP_PCT = 0.00058;
export const BPS = 10_000;

function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return s * y;
}
function Phi(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Probability that (price+lo) ≤ terminal < (price+hi); ±Infinity = catch-all tail.
export function bandProbability(lo: number, hi: number, hSeconds: number, price: number): number {
  const sigma = price * VOL_PER_SQRT_SEC * Math.sqrt(Math.max(hSeconds, 0.4));
  const pLo = lo === -Infinity ? 0 : Phi(lo / sigma);
  const pHi = hi === Infinity ? 1 : Phi(hi / sigma);
  return Math.max(pHi - pLo, 1e-12);
}

// Multiplier for a cell, or 0 if the cell is not offered. We never clamp (that
// would distort the edge); a cell is bettable only when its fair price is in
// (1x, MAX_MULT], so every offered cell pays exactly (1 - EDGE)/prob.
export function multFromProb(prob: number): number {
  const m = (1 - HOUSE_EDGE) / prob;
  if (m <= 1.001 || m > MAX_MULT) return 0;
  return m;
}

export type RoundSpec = {
  startPrice: number;
  step: number;
  numColumns: number;
  numRows: number;
  columnInterval: number;
  thresholds: number[];
  mults: number[];
};

// Band ladder centred on startPrice. Row m covers [L(m), L(m+1)),
// L(m) = startPrice + (m - numRows/2) * step. Rows 0 and numRows-1 are the
// catch-all tails (extend to ∓∞).
export function bandLow(startPrice: number, step: number, numRows: number, m: number): number {
  return startPrice + (m - numRows / 2) * step;
}

export function buildRound(
  startPriceCents: number,
  numColumns: number,
  numRows: number,
  columnInterval: number
): RoundSpec {
  const step = Math.max(1, Math.round(startPriceCents * STEP_PCT));
  const thresholds: number[] = [];
  for (let m = 1; m < numRows; m++) {
    thresholds.push(Math.round(bandLow(startPriceCents, step, numRows, m)));
  }
  const mults: number[] = [];
  for (let c = 0; c < numColumns; c++) {
    const h = (c + 1) * columnInterval; // horizon from round open to column sample
    for (let m = 0; m < numRows; m++) {
      const lo = m === 0 ? -Infinity : bandLow(startPriceCents, step, numRows, m) - startPriceCents;
      const hi = m === numRows - 1 ? Infinity : bandLow(startPriceCents, step, numRows, m + 1) - startPriceCents;
      const mult = multFromProb(bandProbability(lo, hi, h, startPriceCents));
      mults.push(mult === 0 ? 0 : Math.round(mult * BPS)); // 0 = cell not offered
    }
  }
  return { startPrice: startPriceCents, step, numColumns, numRows, columnInterval, thresholds, mults };
}

// row index for a price under the same ladder the contract uses
export function rowForPrice(spec: RoundSpec, priceCents: number): number {
  const t = spec.thresholds;
  for (let i = 0; i < t.length; i++) if (priceCents < t[i]) return i;
  return t.length;
}

// Gaussian sample (Box–Muller)
export function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// list of offered (bettable) cells
export function offeredCells(spec: RoundSpec): { c: number; m: number }[] {
  const cells: { c: number; m: number }[] = [];
  for (let c = 0; c < spec.numColumns; c++) {
    for (let m = 0; m < spec.numRows; m++) {
      if (spec.mults[c * spec.numRows + m] > 0) cells.push({ c, m });
    }
  }
  return cells;
}

// Monte-Carlo the realised house edge over *offered* cells: draw a terminal
// price ~ Normal(start, VOL*start*sqrt(h)), pay stake*mult on a hit.
export function simulateEdge(spec: RoundSpec, trials: number): number {
  const cells = offeredCells(spec);
  let wagered = 0;
  let paid = 0;
  for (let i = 0; i < trials; i++) {
    const { c, m } = cells[Math.floor(Math.random() * cells.length)];
    const h = (c + 1) * spec.columnInterval;
    const sigma = VOL_PER_SQRT_SEC * spec.startPrice * Math.sqrt(h);
    const terminal = spec.startPrice + sigma * gaussian();
    const won = rowForPrice(spec, terminal) === m;
    wagered += 1;
    if (won) paid += spec.mults[c * spec.numRows + m] / BPS;
  }
  return 1 - paid / wagered;
}
