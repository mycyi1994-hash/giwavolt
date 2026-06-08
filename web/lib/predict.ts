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
