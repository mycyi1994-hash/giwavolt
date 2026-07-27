// Multiplier model for the tap-trading grid — exact fair odds minus a house edge.
//
// The price is modelled as a driftless Gaussian random walk: from the current
// price, the price `h` seconds later is Normal(price, sigma) with
// `sigma = price * vol * sqrt(h)`. A band spanning [lo, hi] (offsets from the
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
// expected value of every tap is (1 - HOUSE_EDGE) — but only if `vol` is the
// volatility the price actually has. The chart plots real BTC/USD, so `vol` is
// passed in from the live realized-volatility estimate in lib/priceFeed.ts
// rather than being a constant here. A hardcoded volatility against a real
// price series would misprice every cell: too high and the near cells pay far
// more than their true odds (a negative edge for the house), too low and
// nothing but the centre band is ever offered.

export const HOUSE_EDGE = 0.07; // 7%
export const MAX_MULT = 100; // bigger payouts — far cells reach up to 100×
export const MIN_MULT = 1.1;

// Realized-volatility guard rails, per √second. BTC typically sits near 1e-4;
// the bounds exist so a thin-liquidity burst or a stalled feed can't produce a
// nonsense grid — they are not a tuning knob for the odds.
export const VOL_MIN = 0.00002;
export const VOL_MAX = 0.0008;

// Band height is expressed as a fraction of one standard deviation at a
// reference horizon, so the grid keeps a constant *shape* (how many rows are
// offered, how fast the multipliers climb) as real volatility moves. The
// constants reproduce the density the grid had back when it was drawn against a
// simulated walk, so the game feels the same — it is just priced off real data
// now.
const H_REF_SEC = 28; // midpoint of the bettable horizon
const BAND_SIGMA_FRACTION = 0.2436;

export function clampVol(vol: number): number {
  return Math.min(VOL_MAX, Math.max(VOL_MIN, vol));
}

/** Height of one grid band in price units, sized to current realized vol. */
export function bandStep(price: number, vol: number): number {
  return price * clampVol(vol) * Math.sqrt(H_REF_SEC) * BAND_SIGMA_FRACTION;
}

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
export function bandProbability(lo: number, hi: number, hSeconds: number, price: number, vol: number): number {
  const sigma = price * clampVol(vol) * Math.sqrt(Math.max(hSeconds, 0.4));
  const pLo = lo === -Infinity ? 0 : Phi(lo / sigma);
  const pHi = hi === Infinity ? 1 : Phi(hi / sigma);
  return Math.max(pHi - pLo, 1e-12);
}

// Returns the cell's multiplier, or 0 if the cell is not offered. We never
// *clamp* a multiplier (that would distort the edge); instead a cell is
// bettable only when its fair price sits in (1x, MAX_MULT]. Too-likely cells
// (≤1x) and too-unlikely cells (>MAX_MULT) are simply not offered, so every
// offered cell pays exactly (1 - HOUSE_EDGE)/prob and the edge is exactly 7%.
export function cellMultiplier(lo: number, hi: number, hSeconds: number, price: number, vol: number): number {
  const prob = bandProbability(lo, hi, hSeconds, price, vol);
  const m = (1 - HOUSE_EDGE) / prob;
  if (m <= 1.001 || m > MAX_MULT) return 0;
  return m;
}

// 0..1 visual intensity for a multiplier — log-scaled so 10× already glows and
// the big payouts (toward MAX_MULT) read as "hot".
export function multIntensity(m: number): number {
  const t = Math.log(Math.max(m, 1)) / Math.log(MAX_MULT);
  return Math.max(0, Math.min(1, t));
}
