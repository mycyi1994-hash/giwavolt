// Realized-volatility measurement, shared by the browser feed and the server
// oracle. Both have to price the grid the same way, so the maths lives here and
// neither owns it. Pure functions, no DOM and no Node APIs.

export type Tick = { t: number; p: number };

export const VOL_WINDOW_SEC = 600; // rolling window the estimate is measured over
// A second, much shorter window. Volatility clusters: after a jump, the next
// ten seconds routinely run several times the trailing ten-minute average. A
// player watching the same public feed sees that before we do, and the grid's
// tail cells are exponentially sensitive to an under-estimate — so pricing off
// the slow window alone is an invitation to bet only when it is stale.
export const VOL_SHORT_SEC = 90;

// Realized-volatility guard rails, per √second. BTC typically sits near 1e-4.
// Outside these the estimate is not something to quote against: below, the
// series is too quiet to measure; above, we are almost certainly looking at bad
// data. Both cases REFUSE rather than clamp — a clamped estimate in a genuinely
// fast market is a systematic under-price exactly when it costs the most.
export const VOL_MIN = 0.00002;
export const VOL_MAX = 0.0008;
const VOL_FINE_SEC = 1; // fast sampling grid
const VOL_COARSE_SEC = 5; // slow grid, used to subtract microstructure noise
const VOL_MIN_SAMPLES = 40; // fine-grid returns needed before we'll quote odds
const VOL_MIN_COARSE = 8; // coarse returns needed before applying the correction
// Fraction of the fine-grid variance that must survive noise removal. Below
// this the "measurement" is mostly a subtraction of noise from noise and the
// error explodes — so we report no estimate and the game stops quoting.
const VOL_MIN_SNR = 0.65;

/** Realized variance per second, sampling the tick series on a fixed grid. */
function realizedVariance(src: Tick[], gridSec: number): { v: number; n: number } {
  const slot = gridSec * 1000;
  const buckets: Tick[] = [];
  for (const tk of src) {
    const b = Math.floor(tk.t / slot);
    const last = buckets[buckets.length - 1];
    // last trade in the slot wins, and we keep its real timestamp so the
    // elapsed time in the return is the true one, not the quantised one
    if (last && Math.floor(last.t / slot) === b) {
      last.t = tk.t;
      last.p = tk.p;
    } else {
      buckets.push({ t: tk.t, p: tk.p });
    }
  }

  let sum = 0;
  let n = 0;
  for (let i = 1; i < buckets.length; i++) {
    const dt = (buckets[i].t - buckets[i - 1].t) / 1000;
    // A hole in the feed is not a return — it's a hole. Counting one would
    // read a quiet period as a volatility spike.
    if (dt <= 0 || dt > gridSec * 3) continue;
    const r = Math.log(buckets[i].p / buckets[i - 1].p);
    if (!Number.isFinite(r)) continue;
    sum += (r * r) / dt;
    n++;
  }
  return { v: n ? sum / n : 0, n };
}

/**
 * Volatility per √second, measured from real trades.
 *
 * Trade prints bounce between bid and ask, which adds a fixed-size error to
 * every observed price. That error doesn't shrink as you sample faster, so
 * naive tick-by-tick realized variance is dominated by it — on BTC it reads
 * several times the true volatility, which would blow the grid's odds wide
 * open. Sampling on a 1s grid helps but doesn't remove the bias.
 *
 * So we use the two-scale estimator. For grid spacing Δ the measured variance
 * per second is
 *
 *   V(Δ) = σ² + c/Δ,   c = 2·(noise variance)
 *
 * Measuring at two spacings gives two equations in σ² and c, and the noise
 * drops out.
 *
 * The estimate is then gated. The grid's multipliers are roughly linear in the
 * volatility it's given, so a 10% error in σ moves the house edge by about ten
 * points — an over-estimate hands that to the player. When the market is quiet
 * and the spread is wide, noise dominates the fine grid and what's left after
 * the subtraction is mostly sampling error. Rather than quote odds off that, we
 * return null and the game stops taking bets until the measurement is sound.
 */
/**
 * Why an estimate came back empty. The distinction is load-bearing: "I haven't
 * seen enough yet" and "I looked, and the price has stopped moving" are both a
 * null volatility, but only one of them may be papered over with an older
 * reading.
 */
export type VolReason = "ok" | "insufficient-data" | "noise-dominated" | "too-slow" | "too-fast";
export type VolResult = { vol: number | null; samples: number; reason: VolReason };

export function measureVol(src: Tick[], windowSec = VOL_WINDOW_SEC): VolResult {
  const none = (reason: VolReason, samples = 0): VolResult => ({ vol: null, samples, reason });

  if (src.length < 2) return none("insufficient-data");
  const cutoff = src[src.length - 1].t - windowSec * 1000;
  const win = src.filter((tk) => tk.t >= cutoff);
  if (win.length < 2) return none("insufficient-data");

  const fine = realizedVariance(win, VOL_FINE_SEC);
  if (fine.n < VOL_MIN_SAMPLES) return none("insufficient-data", fine.n);
  // Enough samples and no variance at all means the price never changed — a
  // dead market or a stuck feed. Either way it is measured, not unknown.
  if (fine.v <= 0) return none("too-slow", fine.n);

  const coarse = realizedVariance(win, VOL_COARSE_SEC);
  if (coarse.n < VOL_MIN_COARSE) return none("insufficient-data", fine.n);

  // c = 2·noise variance, from V(Δ₁) − V(Δ₂) = c·(1/Δ₁ − 1/Δ₂)
  const c = Math.max(0, (fine.v - coarse.v) / (1 / VOL_FINE_SEC - 1 / VOL_COARSE_SEC));
  const variance = fine.v - c / VOL_FINE_SEC;

  if (!(variance > 0) || variance / fine.v < VOL_MIN_SNR) return none("noise-dominated", fine.n);

  const vol = Math.sqrt(variance);
  if (vol < VOL_MIN) return none("too-slow", fine.n);
  if (vol > VOL_MAX) return none("too-fast", fine.n);
  return { vol, samples: fine.n, reason: "ok" };
}

/**
 * The volatility to actually quote odds with.
 *
 * Two windows, and the rule between them is asymmetric on purpose, because the
 * player chooses when to bet and the house does not.
 *
 * If the fast window reads HIGHER, it wins. Volatility clusters, so a slow
 * window that hasn't caught up to a spike is a window a player can wait for.
 *
 * If the fast window says the market has STOPPED, we quote nothing. This is the
 * case that used to be silently swallowed: a frozen price makes the short
 * window unmeasurable, and treating that as "no opinion" fell back on a
 * ten-minute-old reading that still had movement in it. The grid then paid
 * 5×–50× on a line that wasn't going anywhere, and the centre cell won every
 * time. A still market is a measurement, not a gap — and it means stop.
 *
 * Only genuine absence of data (warm-up, a hole in the feed) lets the slow
 * window stand alone.
 */
export function measureVolForPricing(src: Tick[]): VolResult {
  const slow = measureVol(src, VOL_WINDOW_SEC);
  if (slow.vol === null) return slow;

  const fast = measureVol(src, VOL_SHORT_SEC);
  if (fast.vol === null) {
    if (fast.reason === "insufficient-data") return slow;
    return { vol: null, samples: fast.samples, reason: fast.reason };
  }

  const vol = Math.max(slow.vol, fast.vol);
  // The blend can exceed the ceiling even when both inputs sat inside it.
  if (vol > VOL_MAX) return { vol: null, samples: slow.samples, reason: "too-fast" };
  return { vol, samples: slow.samples, reason: "ok" };
}
