// Multiplier model for the tap-trading grid.
//
// The line is a real price. Each cell is `n = d / bandHeight` price-bands away
// from the current price, `h` seconds in the future. Cells near the line pay
// a little (~1.3x), cells that are far away vertically and/or far in the future
// pay progressively more, capped at MAX_MULT — matching the reference UI where
// the corners reach the cap and the band hugging the line is the cheapest.
//
// This is a gamified ladder (not strict Gaussian fair-odds); the on-chain
// contract takes whatever grid the operator commits, so the house edge is
// enforced there. See game/docs/design.md.

export const MAX_MULT = 30;
export const MIN_MULT = 1.3;

const A = 0.16; // steepness
const POW = 1.6; // distance exponent

export function cellMultiplier(d: number, hSeconds: number, bandPrice: number, _price: number): number {
  const n = Math.abs(d) / bandPrice; // distance in bands
  const horizon = 0.6 + 0.12 * Math.max(hSeconds, 0); // farther in time → bigger rewards
  const m = MIN_MULT + A * Math.pow(n, POW) * horizon;
  return Math.max(MIN_MULT, Math.min(MAX_MULT, m));
}

// 0..1 visual intensity for a multiplier (used for cell fill alpha / brightness)
export function multIntensity(m: number): number {
  const t = (m - MIN_MULT) / (MAX_MULT - MIN_MULT);
  return Math.max(0, Math.min(1, Math.pow(t, 0.7)));
}
