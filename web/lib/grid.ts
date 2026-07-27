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

import { VOL_MIN, VOL_MAX } from "./vol";

export const HOUSE_EDGE = 0.07; // 7%
// Ceiling on the payout of any single cell.
//
// A cell's multiplier is the reciprocal of its probability, so the biggest
// payouts live furthest into the tail — and tail probabilities are
// *exponentially* sensitive to the volatility used to compute them. At 100× the
// cell sits around 3σ out, where a 25% volatility error swings its true odds by
// several times. That is the whole model risk of the game concentrated in the
// cells a player would naturally hunt for, so the ceiling is set where a
// plausible mis-estimate can still only dent the edge rather than invert it.
export const MAX_MULT = 50;
export const MIN_MULT = 1.1;

export { VOL_MIN, VOL_MAX };

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
  return bandStepAt(price * clampVol(vol) * Math.sqrt(H_REF_SEC));
}

/**
 * The grid's bands are absolute price levels on a lattice anchored to the
 * current price. Everything that prices or settles a bet goes through here, so
 * a cell is always one of the server's own bands — never a shape a caller
 * described. A caller who could name an arbitrary band could solve for the one
 * the model prices worst; naming a *lattice index* leaves nothing to solve.
 */
export function gridAnchor(price: number, step: number): number {
  return Math.round(price / step) * step;
}

/** Snap an arbitrary price to the band of the lattice that contains it. */
export function snapToBand(target: number, price: number, step: number): { lo: number; hi: number; index: number } {
  const anchor = gridAnchor(price, step);
  const index = Math.floor((target - anchor) / step);
  const lo = anchor + index * step;
  return { lo, hi: lo + step, index };
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

// The model only ever needs one number: σ of the terminal price, in price
// units. How that σ was arrived at is the market's business — estimated from
// ticks for BTC, integrated from a declared schedule for VOLT — and keeping the
// two apart is what lets a synthetic market be priced exactly while a real one
// is priced from a measurement.

/** Probability that (price+lo) ≤ terminal < (price+hi), given σ in price units. */
export function bandProbabilityAt(lo: number, hi: number, sigma: number): number {
  if (!(sigma > 0)) return 1e-12;
  const pLo = lo === -Infinity ? 0 : Phi(lo / sigma);
  const pHi = hi === Infinity ? 1 : Phi(hi / sigma);
  return Math.max(pHi - pLo, 1e-12);
}

/** Cell multiplier from σ directly; 0 when the cell isn't offered. */
export function cellMultiplierAt(lo: number, hi: number, sigma: number): number {
  const m = (1 - HOUSE_EDGE) / bandProbabilityAt(lo, hi, sigma);
  if (m <= 1.001 || m > MAX_MULT) return 0;
  return m;
}

/** Band height from σ at the reference horizon. */
export function bandStepAt(sigmaRef: number): number {
  return sigmaRef * BAND_SIGMA_FRACTION;
}

// Probability that (price+lo) ≤ terminal < (price+hi); lo=-Infinity / hi=Infinity
// select the catch-all tails.
export function bandProbability(lo: number, hi: number, hSeconds: number, price: number, vol: number): number {
  return bandProbabilityAt(lo, hi, price * clampVol(vol) * Math.sqrt(Math.max(hSeconds, 0.4)));
}

// Returns the cell's multiplier, or 0 if the cell is not offered. We never
// *clamp* a multiplier (that would distort the edge); instead a cell is
// bettable only when its fair price sits in (1x, MAX_MULT]. Too-likely cells
// (≤1x) and too-unlikely cells (>MAX_MULT) are simply not offered, so every
// offered cell pays exactly (1 - HOUSE_EDGE)/prob and the edge is exactly 7%.
export function cellMultiplier(lo: number, hi: number, hSeconds: number, price: number, vol: number): number {
  return cellMultiplierAt(lo, hi, price * clampVol(vol) * Math.sqrt(Math.max(hSeconds, 0.4)));
}

// 0..1 visual intensity for a multiplier — log-scaled so 10× already glows and
// the big payouts (toward MAX_MULT) read as "hot".
export function multIntensity(m: number): number {
  const t = Math.log(Math.max(m, 1)) / Math.log(MAX_MULT);
  return Math.max(0, Math.min(1, t));
}
