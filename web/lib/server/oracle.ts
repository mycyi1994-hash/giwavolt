import { measureVolForPricing, VOL_WINDOW_SEC, type Tick } from "@/lib/vol";
import { getSql } from "./db";

// Server-side BTC/USD price oracle.
//
// The browser must not be trusted with either half of a bet: not the price it
// was quoted at, and not the price it settled against. This module is where the
// server gets both, independently.
//
// Two properties are load-bearing and easy to lose:
//
//  · The quote price must be FRESH. The player is watching a sub-100ms trade
//    socket; if we price a band around a price a couple of seconds old, they
//    can centre their bet on the live price and collect the difference. So the
//    volatility series may be cached — it moves slowly — but the spot price
//    used to centre a band is fetched per quote and rejected if it is stale.
//
//  · The settlement price must be DURABLE. It resolves against an exchange's
//    published 1-second bar, which a player can re-query and check. But bars we
//    have already seen are also written to `price_bars`, because otherwise the
//    only copy lives at an endpoint the player can push into rate-limiting —
//    and an unfetchable settlement price is worth money to them (see the void
//    path in the settle route).

const BINANCE_BASE = process.env.BINANCE_API_BASE ?? "https://api.binance.com";
const COINBASE_BASE = process.env.COINBASE_API_BASE ?? "https://api.exchange.coinbase.com";

const BINANCE_KLINES = `${BINANCE_BASE}/api/v3/klines?symbol=BTCUSDT&interval=1s`;
const BINANCE_SPOT = `${BINANCE_BASE}/api/v3/ticker/price?symbol=BTCUSDT`;
const COINBASE_TRADES = `${COINBASE_BASE}/products/BTC-USD/trades?limit=1000`;
const COINBASE_TICKER = `${COINBASE_BASE}/products/BTC-USD/ticker`;

export type Quote = { price: number; vol: number; source: string; at: number; ageMs: number };

const SERIES_TTL_MS = 2_000; // the vol series is slow-moving; caching it is fine
const SPOT_TTL_MS = 300; // the quote centre is not — this is a de-dupe, not a cache
const MAX_QUOTE_AGE_MS = 2_000; // older than this and we refuse to quote at all
const SETTLE_TOLERANCE_MS = 2_000; // how far from the target a fill may sit

let series: { at: number; ticks: Tick[]; source: string } | null = null;
let seriesInflight: Promise<{ ticks: Tick[]; source: string } | null> | null = null;
let spot: { at: number; price: number; source: string } | null = null;
let spotInflight: Promise<{ price: number; source: string; at: number } | null> | null = null;

async function getJson(url: string, timeoutMs = 6_000): Promise<unknown | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseBinanceKlines(j: unknown): Tick[] {
  if (!Array.isArray(j)) return [];
  return j
    .map((k) => (Array.isArray(k) ? { t: Number(k[6]), p: parseFloat(String(k[4])) } : { t: NaN, p: NaN }))
    .filter((tk) => Number.isFinite(tk.t) && Number.isFinite(tk.p) && tk.p > 0);
}

function parseCoinbaseTrades(j: unknown): Tick[] {
  if (!Array.isArray(j)) return [];
  return j
    .map((x) => {
      const row = x as { time?: string; price?: string };
      return { t: Date.parse(row?.time ?? ""), p: parseFloat(row?.price ?? "") };
    })
    .filter((tk) => Number.isFinite(tk.t) && Number.isFinite(tk.p) && tk.p > 0)
    .sort((a, b) => a.t - b.t);
}

// ---- durable bars -------------------------------------------------------

/**
 * Remember bars we've seen. Settlement reads these first, so the outcome of a
 * bet stops depending on an exchange still being reachable at the moment the
 * player chooses to ask for it.
 */
async function rememberBars(ticks: Tick[], source: string): Promise<void> {
  if (!ticks.length) return;
  try {
    const db = getSql();
    const rows = ticks.slice(-1200).map((tk) => ({ ts: Math.floor(tk.t), price: tk.p, source }));
    await db`insert into price_bars ${db(rows, "ts", "price", "source")} on conflict (ts) do nothing`;
  } catch {
    // The oracle still works without the cache; losing a write must not fail a bet.
  }
}

async function barFromStore(ts: number, venue: string): Promise<{ price: number; source: string; at: number } | null> {
  try {
    const db = getSql();
    const rows = await db`
      select ts, price, source from price_bars
       where ts <= ${ts} and ts >= ${ts - SETTLE_TOLERANCE_MS} and source = ${venue}
       order by ts desc limit 1`;
    if (!rows.length) return null;
    return { price: Number(rows[0].price), source: String(rows[0].source), at: Number(rows[0].ts) };
  } catch {
    return null;
  }
}

// ---- market data --------------------------------------------------------

/** Recent real trades for the volatility estimate. Cached; the estimate is slow. */
async function recentTicks(): Promise<{ ticks: Tick[]; source: string } | null> {
  if (series && Date.now() - series.at < SERIES_TTL_MS) return { ticks: series.ticks, source: series.source };
  if (seriesInflight) return seriesInflight;

  seriesInflight = (async () => {
    const limit = Math.min(1000, VOL_WINDOW_SEC + 20);
    const bin = parseBinanceKlines(await getJson(`${BINANCE_KLINES}&limit=${limit}`));
    if (bin.length > 60) {
      series = { at: Date.now(), ticks: bin, source: "binance" };
      void rememberBars(bin, "binance");
      return { ticks: bin, source: "binance" };
    }
    const cb = parseCoinbaseTrades(await getJson(COINBASE_TRADES));
    if (cb.length > 60) {
      series = { at: Date.now(), ticks: cb, source: "coinbase" };
      void rememberBars(cb, "coinbase");
      return { ticks: cb, source: "coinbase" };
    }
    return null;
  })().finally(() => {
    seriesInflight = null;
  });

  return seriesInflight;
}

/** The current price, fetched per quote rather than reused from the series. */
async function currentSpot(): Promise<{ price: number; source: string; at: number } | null> {
  if (spot && Date.now() - spot.at < SPOT_TTL_MS) return spot;
  if (spotInflight) return spotInflight;

  spotInflight = (async () => {
    const bin = await getJson(BINANCE_SPOT, 3_000);
    const bp = parseFloat(String((bin as { price?: string })?.price ?? ""));
    if (Number.isFinite(bp) && bp > 0) {
      spot = { at: Date.now(), price: bp, source: "binance" };
      return spot;
    }
    const cb = await getJson(COINBASE_TICKER, 3_000);
    const cp = parseFloat(String((cb as { price?: string })?.price ?? ""));
    if (Number.isFinite(cp) && cp > 0) {
      spot = { at: Date.now(), price: cp, source: "coinbase" };
      return spot;
    }
    return null;
  })().finally(() => {
    spotInflight = null;
  });

  return spotInflight;
}

/**
 * Price and measured volatility for quoting a bet. Returns null when the data
 * is missing, stale or too noisy to measure — the caller must then refuse to
 * quote rather than fall back to a guess.
 */
export async function quote(): Promise<Quote | null> {
  const [got, now] = await Promise.all([recentTicks(), currentSpot()]);
  if (!got || !now) return null;

  const ageMs = Date.now() - now.at;
  if (ageMs > MAX_QUOTE_AGE_MS) return null;

  const { vol } = measureVolForPricing(got.ticks);
  if (vol === null) return null;

  return { price: now.price, vol, source: now.source, at: now.at, ageMs };
}

export type Settlement = { price: number; source: string; at: number };

/**
 * The traded price at `ts`, for settling a bet quoted on `venue`.
 *
 * The venue is not a preference, it is part of the bet. A band is a few tens of
 * dollars wide and Binance's BTCUSDT sits a few dollars from Coinbase's BTC-USD,
 * so settling on the other exchange would judge the bet against a market it was
 * never priced on — enough to flip an outcome near a band edge. If our venue
 * has no price for that instant we return null and the bet stays open, rather
 * than resolving it on the wrong number.
 *
 * Our own record of the bar comes first; the exchange is the fallback and also
 * how that record gets filled. Either way the answer is a published number the
 * player can verify against the same public endpoint.
 */
export async function priceAt(ts: number, venue = "binance"): Promise<Settlement | null> {
  const stored = await barFromStore(ts, venue);
  if (stored) return stored;

  if (venue === "binance") {
    const bin = parseBinanceKlines(
      await getJson(`${BINANCE_KLINES}&startTime=${ts - 4_000}&endTime=${ts + 2_000}&limit=10`)
    );
    if (bin.length) void rememberBars(bin, "binance");
    const fill = pickAt(bin, ts);
    return fill ? { price: fill.p, source: "binance", at: fill.t } : null;
  }

  // Coinbase only exposes recent trades, so this works for prompt settlement
  // and correctly fails for a bet nobody settled for a long time.
  const cb = parseCoinbaseTrades(await getJson(COINBASE_TRADES));
  if (cb.length) void rememberBars(cb, "coinbase");
  const fill = pickAt(cb, ts);
  return fill ? { price: fill.p, source: "coinbase", at: fill.t } : null;
}

/** Last trade at or before `ts`, provided it isn't further back than tolerance. */
function pickAt(ticks: Tick[], ts: number): Tick | null {
  let best: Tick | null = null;
  for (const tk of ticks) {
    if (tk.t <= ts && (!best || tk.t > best.t)) best = tk;
  }
  if (!best || ts - best.t > SETTLE_TOLERANCE_MS) return null;
  return best;
}
