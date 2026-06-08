// Multiplier model for the tap-trading grid — exact fair odds minus a house edge.
//
// The line is modelled as a driftless Gaussian random walk: from the current
// price, the price `h` seconds later is Normal(price, sigma) with
// `sigma = price * VOL * sqrt(h)`. A band spanning [lo, hi] (offsets from the
// current price) is hit with probability
//
//   prob = Φ(hi/sigma) − Φ(lo/sigma)
//
// (the catch-all top/bottom bands use ±∞), and the payout is fair odds shaved
// by the house edge:
//
//   multiplier = (1 - HOUSE_EDGE) / prob   (clamped)
//
// Because this is the *exact* probability of the band the price lands in, the
// expected value of every tap is (1 - HOUSE_EDGE) as long as the price has
// volatility VOL — so the house keeps HOUSE_EDGE of all volume on average. The
// same model feeds the on-chain grid (game/contracts/scripts/grid.ts).

export const HOUSE_EDGE = 0.07; // 7%
export const MAX_MULT = 30;
export const MIN_MULT = 1.1;
export const VOL_PER_SQRT_SEC = 0.00045; // "game" volatility, tuned for a lively line

// erf via Abramowitz & Stegun 7.1.26
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

// Probability that (price+lo) ≤ terminal < (price+hi); lo=-Infinity / hi=Infinity
// select the catch-all tails.
export function bandProbability(lo: number, hi: number, hSeconds: number, price: number): number {
  const sigma = price * VOL_PER_SQRT_SEC * Math.sqrt(Math.max(hSeconds, 0.4));
  const pLo = lo === -Infinity ? 0 : Phi(lo / sigma);
  const pHi = hi === Infinity ? 1 : Phi(hi / sigma);
  return Math.max(pHi - pLo, 1e-12);
}

// Returns the cell's multiplier, or 0 if the cell is not offered. We never
// *clamp* a multiplier (that would distort the edge); instead a cell is
// bettable only when its fair price sits in (1x, MAX_MULT]. Too-likely cells
// (≤1x) and too-unlikely cells (>MAX_MULT) are simply not offered, so every
// offered cell pays exactly (1 - HOUSE_EDGE)/prob and the edge is exactly 7%.
export function cellMultiplier(lo: number, hi: number, hSeconds: number, price: number): number {
  const prob = bandProbability(lo, hi, hSeconds, price);
  const m = (1 - HOUSE_EDGE) / prob;
  if (m <= 1.001 || m > MAX_MULT) return 0;
  return m;
}

// 0..1 visual intensity for a multiplier (cell fill alpha / brightness)
export function multIntensity(m: number): number {
  const t = (m - MIN_MULT) / (MAX_MULT - MIN_MULT);
  return Math.max(0, Math.min(1, Math.pow(t, 0.7)));
}
