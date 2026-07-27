"use client";

// Real BTC/USD tick feed — the single source of truth for Tap Trading.
//
// Hard rule for this module: every number it publishes is an actual traded
// price from an exchange. There is no seeding, no easing, no interpolation and
// no synthetic jitter anywhere in here. If we don't have a real price yet,
// `price` is null and the game refuses to quote odds — a blank chart is honest,
// a made-up one isn't.
//
// Shape of the thing:
//   · Binance and Coinbase trade sockets are opened together and *raced*. The
//     first one to deliver a tick becomes the source and the loser is dropped.
//     Racing (rather than a priority list with timeouts) keeps startup fast in
//     regions where Binance is geo-blocked — notably KR.
//   · We never blend venues. Binance BTCUSDT and Coinbase BTC-USD sit a few
//     dollars apart, so mixing them would inject fake movement. One venue wins
//     and we stay on it until it goes quiet.
//   · Backfill is fetched from the *winning* venue so the historical segment and
//     the live segment are the same price series with no basis step at the join.
//   · Realized volatility is measured from those same real ticks and is what
//     prices the multiplier grid (see lib/grid.ts). Using a hardcoded
//     volatility against a real price series would silently break the house
//     edge, so the two have to move together.

export type Tick = { t: number; p: number };
export type FeedStatus = "connecting" | "live" | "stale" | "down";
export type FeedSource = "binance" | "coinbase" | "coinbase-rest" | "binance-rest" | null;

export type FeedState = {
  status: FeedStatus;
  source: FeedSource;
  /** last real traded price, or null if we have never received one */
  price: number | null;
  lastTickAt: number | null;
  /** realized volatility per √second, measured from real ticks; null until warm */
  vol: number | null;
  volSamples: number;
  /** true once real historical ticks have been merged in */
  historyReady: boolean;
};

const VOL_WINDOW_SEC = 600; // rolling window the vol estimate is measured over
// Must cover the vol window with room to spare, or the estimate silently runs
// on less history than it asks for.
const TICK_KEEP_MS = (VOL_WINDOW_SEC + 60) * 1000;
const STALE_MS = 6_000; // no tick for this long → stop quoting odds
const DOWN_MS = 25_000; // no tick for this long → feed considered dead
const WS_GIVE_UP_MS = 4_000; // no socket tick by now → start REST polling too
const REST_POLL_MS = 2_000;

const VOL_FINE_SEC = 1; // fast sampling grid
const VOL_COARSE_SEC = 5; // slow grid, used to subtract microstructure noise
const VOL_MIN_SAMPLES = 40; // fine-grid returns needed before we'll quote odds
const VOL_MIN_COARSE = 8; // coarse returns needed before applying the correction
// Fraction of the fine-grid variance that must survive noise removal. Below
// this the "measurement" is mostly a subtraction of noise from noise and the
// error explodes — so we report no estimate and the game stops quoting.
const VOL_MIN_SNR = 0.65;

let ticks: Tick[] = [];
let state: FeedState = {
  status: "connecting",
  source: null,
  price: null,
  lastTickAt: null,
  vol: null,
  volSamples: 0,
  historyReady: false,
};

const listeners = new Set<(s: FeedState) => void>();
let refs = 0;
let sockets: WebSocket[] = [];
let restTimer: ReturnType<typeof setInterval> | null = null;
let watchdog: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;
let backfilled = false;

function emit() {
  for (const fn of listeners) fn(state);
}

function setState(patch: Partial<FeedState>) {
  state = { ...state, ...patch };
  emit();
}

// ---- volatility ---------------------------------------------------------

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
export function measureVol(src: Tick[]): { vol: number | null; samples: number } {
  if (src.length < 2) return { vol: null, samples: 0 };
  const cutoff = src[src.length - 1].t - VOL_WINDOW_SEC * 1000;
  const win = src.filter((tk) => tk.t >= cutoff);
  if (win.length < 2) return { vol: null, samples: 0 };

  const fine = realizedVariance(win, VOL_FINE_SEC);
  if (fine.n < VOL_MIN_SAMPLES || fine.v <= 0) return { vol: null, samples: fine.n };

  const coarse = realizedVariance(win, VOL_COARSE_SEC);
  if (coarse.n < VOL_MIN_COARSE) return { vol: null, samples: fine.n };

  // c = 2·noise variance, from V(Δ₁) − V(Δ₂) = c·(1/Δ₁ − 1/Δ₂)
  const c = Math.max(0, (fine.v - coarse.v) / (1 / VOL_FINE_SEC - 1 / VOL_COARSE_SEC));
  const variance = fine.v - c / VOL_FINE_SEC;

  if (!(variance > 0) || variance / fine.v < VOL_MIN_SNR) return { vol: null, samples: fine.n };
  return { vol: Math.sqrt(variance), samples: fine.n };
}

let lastVolAt = 0;

// Re-measuring sweeps ~10 minutes of ticks, so doing it on every trade would
// burn real CPU at 20 prints/s to refine an estimate that moves on a far slower
// clock. Once a second is plenty.
function recompute(force = false) {
  const now = Date.now();
  if (!force && now - lastVolAt < 1000) return;
  lastVolAt = now;
  const { vol, samples } = measureVol(ticks);
  state = { ...state, vol, volSamples: samples };
}

// ---- tick intake --------------------------------------------------------

function pushTick(p: number, t: number, source: FeedSource) {
  if (!Number.isFinite(p) || p <= 0) return;
  // Ignore a venue that lost the race but is still delivering.
  if (state.source && source !== state.source) return;

  const last = ticks[ticks.length - 1];
  if (last && t < last.t) t = last.t; // keep the series monotonic in time
  ticks.push({ t, p });

  const cutoff = t - TICK_KEEP_MS;
  if (ticks.length > 64 && ticks[0].t < cutoff) {
    let i = 0;
    while (i < ticks.length && ticks[i].t < cutoff) i++;
    ticks = ticks.slice(i);
  }

  recompute();
  setState({ price: p, lastTickAt: t, status: "live", source });
}

/** Merge real historical ticks in front of whatever we've collected live. */
function mergeHistory(hist: Tick[]) {
  if (!hist.length) return;
  const firstLive = ticks.length ? ticks[0].t : Infinity;
  const older = hist.filter((h) => h.t < firstLive && Number.isFinite(h.p) && h.p > 0).sort((a, b) => a.t - b.t);
  if (!older.length) return;
  ticks = [...older, ...ticks];
  const cutoff = Date.now() - TICK_KEEP_MS;
  ticks = ticks.filter((tk) => tk.t >= cutoff);
  recompute(true); // real history just landed — measure it now, don't wait
  setState({ historyReady: true });
}

// ---- sources ------------------------------------------------------------

function openBinanceWs() {
  try {
    const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade");
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data as string);
        const p = parseFloat(d?.p);
        const t = typeof d?.T === "number" ? d.T : Date.now();
        if (p > 0) {
          if (!state.source) win("binance");
          pushTick(p, t, "binance");
        }
      } catch {
        /* malformed frame — skip it */
      }
    };
    sockets.push(ws);
  } catch {
    /* socket unavailable in this environment */
  }
}

function openCoinbaseWs() {
  try {
    const ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker"] }));
      } catch {
        /* closed before we could subscribe */
      }
    };
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data as string);
        if (d?.type !== "ticker") return;
        const p = parseFloat(d?.price);
        const t = d?.time ? Date.parse(d.time) : Date.now();
        if (p > 0) {
          if (!state.source) win("coinbase");
          pushTick(p, Number.isFinite(t) ? t : Date.now(), "coinbase");
        }
      } catch {
        /* malformed frame — skip it */
      }
    };
    sockets.push(ws);
  } catch {
    /* socket unavailable in this environment */
  }
}

/** First venue to deliver a tick takes the feed; the rest are dropped. */
function win(source: FeedSource) {
  state = { ...state, source };
  const keepUrl = source === "binance" ? "binance" : "coinbase";
  sockets = sockets.filter((ws) => {
    const mine = ws.url.includes(keepUrl);
    if (!mine) {
      try {
        ws.close();
      } catch {
        /* already gone */
      }
    }
    return mine;
  });
  if (restTimer) {
    clearInterval(restTimer);
    restTimer = null;
  }
  void backfill(source);
}

// REST fallback — only used when neither socket can reach us (restrictive
// networks, corporate proxies). Still real trade data, just lower resolution.
async function pollRest() {
  try {
    const r = await fetch("https://api.exchange.coinbase.com/products/BTC-USD/ticker");
    const j = await r.json();
    const p = parseFloat(j?.price);
    if (p > 0) {
      if (!state.source) {
        state = { ...state, source: "coinbase-rest" };
        void backfill("coinbase-rest");
      }
      return pushTick(p, Date.now(), state.source);
    }
  } catch {
    /* try the next venue */
  }
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const j = await r.json();
    const p = parseFloat(j?.price);
    if (p > 0) {
      if (!state.source) {
        state = { ...state, source: "binance-rest" };
        void backfill("binance-rest");
      }
      return pushTick(p, Date.now(), state.source);
    }
  } catch {
    /* nothing reachable this round */
  }
}

// ---- historical backfill ------------------------------------------------

async function fetchBinanceHistory(): Promise<Tick[]> {
  const r = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1s&limit=600");
  const j = await r.json();
  if (!Array.isArray(j)) return [];
  return j
    .map((k: unknown[]) => ({ t: Number(k[6]), p: parseFloat(String(k[4])) })) // closeTime, close
    .filter((tk: Tick) => Number.isFinite(tk.t) && Number.isFinite(tk.p) && tk.p > 0);
}

async function fetchCoinbaseHistory(): Promise<Tick[]> {
  const r = await fetch("https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=1000");
  const j = await r.json();
  if (!Array.isArray(j)) return [];
  return j
    .map((x: { time?: string; price?: string }) => ({ t: Date.parse(x?.time ?? ""), p: parseFloat(x?.price ?? "") }))
    .filter((tk: Tick) => Number.isFinite(tk.t) && Number.isFinite(tk.p) && tk.p > 0)
    .sort((a: Tick, b: Tick) => a.t - b.t);
}

/**
 * Pull real recent trades from the venue that won the race, so the chart opens
 * with genuine history instead of an empty pane. If it fails the chart simply
 * grows from the right — we never fabricate the missing segment.
 */
async function backfill(source: FeedSource) {
  if (backfilled) return;
  backfilled = true;
  const binanceFirst = source === "binance" || source === "binance-rest";
  const order = binanceFirst ? [fetchBinanceHistory, fetchCoinbaseHistory] : [fetchCoinbaseHistory, fetchBinanceHistory];
  for (const fn of order) {
    try {
      const hist = await fn();
      if (hist.length > 1) {
        mergeHistory(hist);
        return;
      }
    } catch {
      /* try the other venue */
    }
  }
}

// ---- lifecycle ----------------------------------------------------------

function tickWatchdog() {
  const now = Date.now();
  const last = state.lastTickAt;
  if (last === null) {
    if (now - startedAt > WS_GIVE_UP_MS && !restTimer && !state.source) {
      void pollRest();
      restTimer = setInterval(() => void pollRest(), REST_POLL_MS);
    }
    if (now - startedAt > DOWN_MS && state.status !== "down") setState({ status: "down" });
    return;
  }
  const age = now - last;
  const next: FeedStatus = age > DOWN_MS ? "down" : age > STALE_MS ? "stale" : "live";
  if (next !== state.status) setState({ status: next });
  // A quiet socket means the venue dropped us — fall back to polling rather
  // than letting the chart sit on a stale price.
  if (age > STALE_MS && !restTimer) {
    restTimer = setInterval(() => void pollRest(), REST_POLL_MS);
  }
}

function start() {
  if (typeof window === "undefined") return;
  startedAt = Date.now();
  backfilled = false;
  state = { ...state, status: "connecting" };
  openBinanceWs();
  openCoinbaseWs();
  watchdog = setInterval(tickWatchdog, 500);
}

function stop() {
  for (const ws of sockets) {
    try {
      ws.close();
    } catch {
      /* already gone */
    }
  }
  sockets = [];
  if (restTimer) clearInterval(restTimer);
  if (watchdog) clearInterval(watchdog);
  restTimer = null;
  watchdog = null;
  // Ticks and the vol estimate are deliberately kept: navigating between pages
  // shouldn't throw away real history we already paid for.
  state = { ...state, status: "connecting", source: null };
}

/** Subscribe to feed state. Returns an unsubscribe function. */
export function subscribeFeed(fn: (s: FeedState) => void): () => void {
  listeners.add(fn);
  if (++refs === 1) start();
  fn(state);
  return () => {
    listeners.delete(fn);
    if (--refs === 0) stop();
  };
}

export function getFeedState(): FeedState {
  return state;
}

/** Real ticks, oldest first. Never contains a synthesised point. */
export function getTicks(): readonly Tick[] {
  return ticks;
}

/** True when the feed is fresh enough and well-measured enough to quote odds. */
export function isQuotable(s: FeedState = state): boolean {
  return s.status === "live" && s.price !== null && s.vol !== null;
}
