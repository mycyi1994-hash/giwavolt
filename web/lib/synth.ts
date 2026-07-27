// VOLT — a synthetic market of our own.
//
// Why this exists alongside the real BTC feed:
//
//   · DEMO has to work with no network. The exchange sockets are geo-blocked in
//     some regions, and a play-money demo that shows "CONNECTING…" forever is
//     worse than no demo. This runs from nothing.
//   · A quiet real market pauses betting, correctly but boringly. VOLT never
//     goes quiet.
//   · The odds here are *exact*. On BTC we have to estimate volatility from
//     ticks and that estimate carries error, which lands straight in the
//     payouts. Here we declare the volatility, so the grid prices against the
//     true process and the house edge is exactly 7% — not approximately.
//
// The thing that makes it interesting rather than just "BTC with bigger
// numbers": the grid is scale-invariant in σ. Doubling a constant volatility
// widens every band by the same factor and leaves the multiplier ladder — and
// the whole feel of the game — completely unchanged. Drama has to come from σ
// *varying*, so the market visibly slips between calm and violent and the grid
// breathes with it.
//
// σ(t) is deterministic and public. That is what keeps the pricing exact: with
// a known volatility schedule the terminal distribution over any horizon is
// still Gaussian, with variance ∫σ²dt — which we can compute exactly rather
// than estimate. The player knows how violent the next 30 seconds will be. They
// still don't know which way.
//
// The path itself is a seeded random walk, so a given seed replays tick for
// tick. DEMO only: the browser generates it, which means the browser could read
// the seed and know the future. That's fine for play money and unacceptable for
// real money, so REAL mode stays on BTC. Promoting VOLT to REAL would need the
// path driven by a server-held hash chain, revealed link by link.

export type Tick = { t: number; p: number };

export const SYNTH_BASE_PRICE = 1_000;

/** Volatility per √second at the calm end of the cycle. */
const SIG_CALM = 0.00022; // ~124%/yr
/** …and at the violent end. */
const SIG_STORM = 0.0016; // ~899%/yr

// Two incommensurable periods so the regime never repeats on a countable beat —
// long swells with shorter squalls riding on top.
const PERIOD_A_MS = 97_000;
const PERIOD_B_MS = 31_000;

/** Path resolution. Fine enough to look like a tick feed, coarse enough to sum. */
export const SYNTH_STEP_MS = 100;

/**
 * The declared volatility at time `t`, per √second.
 *
 * Public and deterministic — a player can compute it as easily as we can, which
 * is the point. Log-space interpolation keeps the ratio between calm and storm
 * constant rather than the difference, so the quiet stretches stay genuinely
 * quiet instead of being dragged up by the average.
 */
export function sigmaAt(t: number): number {
  const a = Math.sin((2 * Math.PI * t) / PERIOD_A_MS);
  const b = Math.sin((2 * Math.PI * t) / PERIOD_B_MS + 1.7);
  // combine to [-1,1], weighted toward the long swell
  const mix = (0.68 * a + 0.32 * b + 1) / 2; // → [0,1]
  return SIG_CALM * Math.pow(SIG_STORM / SIG_CALM, mix);
}

/**
 * Variance of the log-price over [t0, t1], in (per-√s)² · seconds.
 *
 * Summed on the same grid the path is generated on, so this is not an
 * approximation of the process — it is exactly the variance the generated path
 * has. That exactness is the whole reason the edge here is exact.
 */
export function integratedVariance(t0: number, t1: number): number {
  if (t1 <= t0) return 0;
  const start = Math.floor(t0 / SYNTH_STEP_MS);
  const end = Math.ceil(t1 / SYNTH_STEP_MS);
  const dt = SYNTH_STEP_MS / 1000;
  let v = 0;
  for (let i = start; i < end; i++) {
    // clip the first and last cells to the exact requested bounds
    const cellFrom = Math.max(t0, i * SYNTH_STEP_MS);
    const cellTo = Math.min(t1, (i + 1) * SYNTH_STEP_MS);
    if (cellTo <= cellFrom) continue;
    const s = sigmaAt(i * SYNTH_STEP_MS);
    v += s * s * ((cellTo - cellFrom) / 1000);
  }
  return v;
}

/** σ of the price itself (not log) over a horizon, in price units. */
export function synthSigma(price: number, t0: number, t1: number): number {
  return price * Math.sqrt(integratedVariance(t0, t1));
}

// ---- the path -----------------------------------------------------------

// A cheap, well-mixed integer hash. The path has to be reproducible from a seed
// and identical everywhere it's computed, so this is written out rather than
// left to any particular engine's PRNG.
function hash32(x: number): number {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Two independent uniforms for step `i` of seed `seed`. */
function uniforms(seed: number, i: number): [number, number] {
  const a = hash32(Math.imul(seed, 0x9e3779b1) ^ Math.imul(i, 0x85ebca6b));
  const b = hash32(a ^ Math.imul(i + 0x7f4a7c15, 0xc2b2ae35));
  return [(a + 0.5) / 4294967296, (b + 0.5) / 4294967296];
}

/** Standard normal for step `i`, via Box-Muller. */
function gaussAt(seed: number, i: number): number {
  const [u, v] = uniforms(seed, i);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Price at a given step index. Driftless: the log-price is a sum of independent
 * increments whose variance is exactly σ(t)²·dt, so the process the grid prices
 * against and the process the player sees are the same one.
 *
 * Walking from step 0 every time would be O(t); the caller keeps a running
 * value instead (see `SynthPath`).
 */
export function synthStepLogReturn(seed: number, i: number): number {
  const s = sigmaAt(i * SYNTH_STEP_MS);
  return s * Math.sqrt(SYNTH_STEP_MS / 1000) * gaussAt(seed, i);
}

/**
 * A replayable price path. Anchored to an absolute step index so two consumers
 * with the same seed produce the same prices for the same wall-clock instants —
 * which is what lets a bet be settled by recomputing rather than remembering.
 */
export class SynthPath {
  readonly seed: number;
  private readonly originStep: number;
  private cursor: number;
  private logP: number;

  constructor(seed: number, originMs: number) {
    this.seed = seed;
    this.originStep = Math.floor(originMs / SYNTH_STEP_MS);
    this.cursor = this.originStep;
    this.logP = Math.log(SYNTH_BASE_PRICE);
  }

  /** Price at wall-clock `t`. Must be called with non-decreasing `t`. */
  priceAt(t: number): number {
    const target = Math.floor(t / SYNTH_STEP_MS);
    while (this.cursor < target) {
      this.logP += synthStepLogReturn(this.seed, this.cursor);
      this.cursor++;
    }
    return Math.exp(this.logP);
  }

  /** Every tick in [from, to], for filling a chart. */
  ticks(from: number, to: number): Tick[] {
    const out: Tick[] = [];
    const first = Math.floor(from / SYNTH_STEP_MS);
    const last = Math.floor(to / SYNTH_STEP_MS);
    for (let i = first; i <= last; i++) {
      const t = i * SYNTH_STEP_MS;
      out.push({ t, p: this.priceAt(t) });
    }
    return out;
  }
}

/** Recompute a path from scratch — used to verify a replay matches. */
export function replayPrice(seed: number, originMs: number, t: number): number {
  return new SynthPath(seed, originMs).priceAt(t);
}
