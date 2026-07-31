"use client";

// The two markets Tap Trading can run on, behind one interface.
//
// Everything downstream — the grid, the chart, the bet lifecycle — only ever
// asks a market one question: "what is σ of the price at time T, given it is
// `price` now?" Answering that is the entire difference between them.
//
//   BTC   estimates σ from the tick series, and may answer "I don't know",
//         which stops the game.
//   VOLT  integrates a declared, public volatility schedule, and always knows.
//
// Keeping the question that narrow is what let a synthetic market drop in
// without the pricing model, the grid geometry or the settlement logic learning
// anything new about it.

import { useEffect, useState } from "react";
import { getFeedState, getTicks, isQuotable, subscribeFeed, PAIR_LABEL, venueOf } from "@/lib/priceFeed";
import { SynthPath, SYNTH_STEP_MS, synthSigma, sigmaAt, SYNTH_BASE_PRICE, type Tick } from "@/lib/synth";
import { clampVol } from "@/lib/grid";

export type MarketId = "btc" | "volt";

export type MarketSnapshot = {
  /** Latest price, or null when the market has nothing to show yet. */
  price: number | null;
  /** Ticks covering at least `sinceMs` back from now, oldest first. */
  ticks: readonly Tick[];
  /** True when odds may be quoted right now. */
  quotable: boolean;
  /** True when the price is current enough to settle against. */
  fresh: boolean;
  /** Short label for the pair, e.g. "BTC / USDT". */
  pair: string;
  /** Source description for the badge, or null while connecting. */
  source: string | null;
  /** Present-tense volatility, per √second — for display only. */
  vol: number | null;
  /** Why odds are unavailable, when they are. */
  reason: "ok" | "connecting" | "stale" | "still" | "noisy" | "wild";
};

export type Market = {
  id: MarketId;
  label: string;
  blurb: string;
  /** REAL money is only allowed on markets the server can settle independently. */
  realMoney: boolean;
  /** Keep the market running; returns an unsubscribe. */
  start(): () => void;
  snapshot(): MarketSnapshot;
  /**
   * σ of the price at `to`, seen from `from`, in price units — the one number
   * the pricing model needs. Null means "cannot price", which stops betting.
   */
  sigma(price: number, from: number, to: number): number | null;
};

// ---- BTC: the real exchange feed ---------------------------------------

const btc: Market = {
  id: "btc",
  label: "BTC",
  blurb: "Live exchange trades. Odds priced off measured volatility.",
  realMoney: true,
  start: () => subscribeFeed(() => {}),
  snapshot() {
    const f = getFeedState();
    const venue = venueOf(f.source);
    const reason: MarketSnapshot["reason"] =
      f.status === "stale" || f.status === "down"
        ? "stale"
        : f.vol !== null
          ? "ok"
          : f.volReason === "too-slow"
            ? "still"
            : f.volReason === "noise-dominated"
              ? "noisy"
              : f.volReason === "too-fast"
                ? "wild"
                : "connecting";
    return {
      price: f.price,
      ticks: getTicks(),
      quotable: isQuotable(f),
      fresh: f.lastTickAt !== null && Date.now() - f.lastTickAt <= 6_000,
      pair: venue ? PAIR_LABEL[venue] : "BTC",
      source: venue ? venue.toUpperCase() : null,
      vol: f.vol,
      reason,
    };
  },
  sigma(price, from, to) {
    const f = getFeedState();
    if (f.vol === null) return null;
    const h = Math.max((to - from) / 1000, 0.4);
    return price * clampVol(f.vol) * Math.sqrt(h);
  },
};

// ---- VOLT: our own market ----------------------------------------------

// One path per page load. DEMO only, so a fresh seed each time is fine and
// keeps repeat visits from replaying the same chart.
let path: SynthPath | null = null;
let seed = 0;
let origin = 0;
let cache: Tick[] = [];
const KEEP_MS = 180_000;

function ensurePath() {
  if (path) return path;
  seed = (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
  // Start the path far enough back that the chart opens full rather than
  // growing in from the right.
  origin = Date.now() - KEEP_MS;
  path = new SynthPath(seed, origin);
  cache = path.ticks(origin, Date.now());
  return path;
}

function advance() {
  const p = ensurePath();
  const now = Date.now();
  const last = cache.length ? cache[cache.length - 1].t : origin;
  if (now - last >= SYNTH_STEP_MS) {
    for (let t = last + SYNTH_STEP_MS; t <= now; t += SYNTH_STEP_MS) cache.push({ t, p: p.priceAt(t) });
    // Drop from the front instead of rebuilding. ensurePath() seeds the cache
    // full, so the eviction branch is hot from the very first step: filter()
    // was reallocating and copying all ~1,800 entries about ten times a second
    // to retire a handful off the front. splice touches only what leaves.
    const cutoff = now - KEEP_MS;
    if (cache.length && cache[0].t < cutoff) {
      let drop = 0;
      while (drop < cache.length && cache[drop].t < cutoff) drop++;
      if (drop) cache.splice(0, drop);
    }
  }
  return cache;
}

const volt: Market = {
  id: "volt",
  label: "VOLT",
  blurb: "Our own market. Volatility swings on a published schedule, so the odds are exact.",
  // The browser generates this path, which means the browser can read its seed
  // and know the future. Harmless for play money, disqualifying for real money.
  realMoney: false,
  start() {
    ensurePath();
    const id = setInterval(advance, SYNTH_STEP_MS);
    return () => clearInterval(id);
  },
  snapshot() {
    const ticks = advance();
    const now = Date.now();
    return {
      price: ticks.length ? ticks[ticks.length - 1].p : SYNTH_BASE_PRICE,
      ticks,
      quotable: true, // it never goes quiet and never needs measuring
      fresh: true,
      pair: "VOLT / USD",
      source: "SIMULATED",
      vol: sigmaAt(now),
      reason: "ok",
    };
  },
  sigma(price, from, to) {
    return synthSigma(price, from, to);
  },
};

export const MARKETS: Record<MarketId, Market> = { btc, volt };
export const MARKET_ORDER: MarketId[] = ["btc", "volt"];

/** The seed of the current VOLT path, so a session can be replayed. */
export function voltSeed(): number {
  ensurePath();
  return seed;
}

/**
 * React view of a market. Keeps it running for as long as the component is
 * mounted and re-renders on a slow beat — the render loop reads the market
 * directly for anything that needs to be tick-accurate.
 */
export function useMarketSnapshot(id: MarketId): MarketSnapshot {
  const [snap, setSnap] = useState<MarketSnapshot>(() => MARKETS[id].snapshot());
  useEffect(() => {
    const stop = MARKETS[id].start();
    setSnap(MARKETS[id].snapshot());
    const t = setInterval(() => setSnap(MARKETS[id].snapshot()), 250);
    return () => {
      clearInterval(t);
      stop();
    };
  }, [id]);
  return snap;
}
