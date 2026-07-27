import { measureVol, VOL_WINDOW_SEC, type Tick } from "@/lib/vol";

// Server-side BTC/USD price oracle.
//
// The browser must not be trusted with either half of a bet: not the price it
// was quoted at, and not the price it settled against. This module is where the
// server gets both, independently.
//
// Settlement resolves against an exchange's *published* 1-second bar rather
// than anything this server remembers. That matters for a reason beyond
// anti-cheat: a player can re-query the same public endpoint for the same
// second and check the settlement themselves. A price we only held in memory
// would be unauditable, and a serverless function has no memory to hold it in
// anyway — instances come and go between the bet and its settlement.
//
// Venue order is Binance then Coinbase, and it is deliberately the reverse of
// what the browser may have picked. The two disagree by a few dollars, so the
// server's own quote and the server's own settlement always come from the same
// venue as each other, which is the pair that has to be consistent.

// Hosts are overridable so the server can be pointed at a mirror in regions
// that block an exchange, and so tests can drive it from a known price series.
const BINANCE_BASE = process.env.BINANCE_API_BASE ?? "https://api.binance.com";
const COINBASE_BASE = process.env.COINBASE_API_BASE ?? "https://api.exchange.coinbase.com";

const BINANCE = `${BINANCE_BASE}/api/v3/klines?symbol=BTCUSDT&interval=1s`;
const COINBASE_TRADES = `${COINBASE_BASE}/products/BTC-USD/trades?limit=1000`;

export type Quote = { price: number; vol: number; source: string; at: number };

const RECENT_TTL_MS = 2_000; // reuse a quote across a burst of requests
const SETTLE_TOLERANCE_MS = 2_000; // how far from the target a fill may sit

let recent: { at: number; ticks: Tick[]; source: string } | null = null;
let inflight: Promise<{ ticks: Tick[]; source: string } | null> | null = null;

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

/** Recent real trades, cached briefly and de-duplicated across concurrent calls. */
async function recentTicks(): Promise<{ ticks: Tick[]; source: string } | null> {
  if (recent && Date.now() - recent.at < RECENT_TTL_MS) return { ticks: recent.ticks, source: recent.source };
  if (inflight) return inflight;

  inflight = (async () => {
    const limit = Math.min(1000, VOL_WINDOW_SEC + 20);
    const bin = parseBinanceKlines(await getJson(`${BINANCE}&limit=${limit}`));
    if (bin.length > 60) {
      recent = { at: Date.now(), ticks: bin, source: "binance" };
      return { ticks: bin, source: "binance" };
    }
    const cb = parseCoinbaseTrades(await getJson(COINBASE_TRADES));
    if (cb.length > 60) {
      recent = { at: Date.now(), ticks: cb, source: "coinbase" };
      return { ticks: cb, source: "coinbase" };
    }
    return null;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/**
 * Current price and measured volatility, from the server's own read of the
 * market. Returns null when the market data is missing or too noisy to measure
 * — the caller must then refuse to quote rather than fall back to a guess.
 */
export async function quote(): Promise<Quote | null> {
  const got = await recentTicks();
  if (!got) return null;
  const last = got.ticks[got.ticks.length - 1];
  if (!last || Date.now() - last.t > 30_000) return null; // data too stale to price on
  const { vol } = measureVol(got.ticks);
  if (vol === null) return null;
  return { price: last.p, vol, source: got.source, at: last.t };
}

export type Settlement = { price: number; source: string; at: number };

/**
 * The traded price at `ts`, for settling a bet.
 *
 * Asks the exchange for the one-second bar covering that instant, so the answer
 * is a published number a player can verify rather than this server's word.
 * Returns null when no fill sits close enough to the target — the caller voids
 * the bet instead of settling it against a price from the wrong moment.
 */
export async function priceAt(ts: number): Promise<Settlement | null> {
  const bin = parseBinanceKlines(
    await getJson(`${BINANCE}&startTime=${ts - 4_000}&endTime=${ts + 2_000}&limit=10`)
  );
  const binFill = pickAt(bin, ts);
  if (binFill) return { price: binFill.p, source: "binance", at: binFill.t };

  // Coinbase only exposes recent trades, so this works for prompt settlement
  // and correctly fails for a bet nobody settled for a long time.
  const cb = parseCoinbaseTrades(await getJson(COINBASE_TRADES));
  const cbFill = pickAt(cb, ts);
  if (cbFill) return { price: cbFill.p, source: "coinbase", at: cbFill.t };

  return null;
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
