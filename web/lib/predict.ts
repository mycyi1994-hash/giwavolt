// Mock prediction-market data (Kalshi-style YES/NO contracts priced in cents,
// where price ≈ implied probability). Demo only — no on-chain settlement yet.

export type Market = {
  id: string;
  category: "Crypto" | "Economy" | "Tech" | "Sports" | "Culture";
  question: string;
  yes: number; // cents 1..99 (YES price = implied %)
  change: number; // 24h move in points
  volume: number; // USDC
  ends: string; // human label
  spark: number[]; // recent YES price history for a sparkline
  resolved?: "yes" | "no"; // set by admin when the event settles
};

export const CATEGORIES = ["All", "Crypto", "Economy", "Tech", "Sports", "Culture"] as const;
export const MARKET_CATEGORIES = ["Crypto", "Economy", "Tech", "Sports", "Culture"] as const;

export function makeSpark(seed: number, end: number): number[] {
  const out: number[] = [];
  let v = end - (Math.abs(seed) % 17) - 4;
  for (let i = 0; i < 16; i++) {
    v += Math.sin(seed * 0.7 + i) * 3 + ((Math.abs(seed) * (i + 3)) % 5) - 2;
    out.push(Math.max(3, Math.min(97, Math.round(v))));
  }
  out[out.length - 1] = end;
  return out;
}

const RAW: Omit<Market, "spark">[] = [
  { id: "btc-100k", category: "Crypto", question: "Will BTC close above $100,000 this month?", yes: 63, change: 4, volume: 1284000, ends: "12d" },
  { id: "eth-5k", category: "Crypto", question: "Will ETH trade above $5,000 by quarter end?", yes: 41, change: -3, volume: 902300, ends: "47d" },
  { id: "giwa-main", category: "Crypto", question: "Will GIWA mainnet go live this year?", yes: 78, change: 6, volume: 540100, ends: "5mo" },
  { id: "sol-ath", category: "Crypto", question: "Will SOL set a new all-time high in Q3?", yes: 34, change: 2, volume: 318700, ends: "61d" },
  { id: "rate-cut", category: "Economy", question: "Will the central bank cut rates next meeting?", yes: 56, change: -5, volume: 1750200, ends: "23d" },
  { id: "cpi-soft", category: "Economy", question: "Will next CPI come in under forecast?", yes: 48, change: 1, volume: 642000, ends: "9d" },
  { id: "krw-1300", category: "Economy", question: "Will USD/KRW stay under ₩1,300 this month?", yes: 29, change: -7, volume: 211400, ends: "18d" },
  { id: "ai-model", category: "Tech", question: "Will a new frontier AI model ship this quarter?", yes: 71, change: 3, volume: 488900, ends: "40d" },
  { id: "chip-export", category: "Tech", question: "Will new chip export rules pass before year end?", yes: 52, change: 0, volume: 372600, ends: "3mo" },
  { id: "wc-host", category: "Sports", question: "Will the home team reach the semifinal?", yes: 38, change: 9, volume: 845300, ends: "27d" },
  { id: "marathon", category: "Sports", question: "Will the world record fall at the next major?", yes: 22, change: -2, volume: 132800, ends: "33d" },
  { id: "box-office", category: "Culture", question: "Will the summer blockbuster top $1B worldwide?", yes: 60, change: 5, volume: 401200, ends: "52d" },
];

export const MARKETS: Market[] = RAW.map((m, i) => ({ ...m, spark: makeSpark(i * 31 + m.yes, m.yes) }));

export function fmtVolume(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ---- order book + price history (deterministic mock) -------------------

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type Level = { price: number; size: number };
export type Book = { asks: Level[]; bids: Level[] };

// YES order book: asks (sell YES) just above the mid, bids (buy YES) just below.
export function genBook(m: Market): Book {
  const rnd = mulberry32(seedOf(m.id) ^ m.yes);
  const asks: Level[] = [];
  const bids: Level[] = [];
  let p = m.yes;
  for (let i = 0; i < 9 && p < 99; i++) {
    p = Math.min(99, p + 1 + Math.floor(rnd() * 2));
    asks.push({ price: p, size: Math.round(40 + rnd() * 1200) });
  }
  p = m.yes;
  for (let i = 0; i < 9 && p > 1; i++) {
    p = Math.max(1, p - 1 - Math.floor(rnd() * 2));
    bids.push({ price: p, size: Math.round(40 + rnd() * 1200) });
  }
  return { asks, bids };
}

// longer YES-price history for the detail chart
export function genHistory(m: Market, n = 48): number[] {
  const rnd = mulberry32(seedOf(m.id));
  const out: number[] = [];
  let v = Math.max(8, Math.min(92, m.yes - m.change * 2 - 6));
  for (let i = 0; i < n - 1; i++) {
    v += (rnd() - 0.5) * 6 + (m.yes - v) * 0.04;
    out.push(Math.max(2, Math.min(98, v)));
  }
  out.push(m.yes);
  return out;
}

// Walk the ask side for a market BUY of `shares`; returns avg price & slippage.
export function marketBuy(book: Book, shares: number): { avg: number; filled: number; slippagePct: number } {
  let remaining = shares;
  let cost = 0;
  let filled = 0;
  const best = book.asks[0]?.price ?? 0;
  for (const lvl of book.asks) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lvl.size);
    cost += take * lvl.price;
    filled += take;
    remaining -= take;
  }
  const avg = filled > 0 ? cost / filled : best;
  const slippagePct = best > 0 ? ((avg - best) / best) * 100 : 0;
  return { avg, filled, slippagePct };
}
