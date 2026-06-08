// Deterministic mock leaderboard data for the terminal screen.
// Seeded by category + period so rows are stable across renders.

export type Category = "tap" | "death";
export type Period = "1D" | "7D" | "30D";

export type LeaderRow = {
  rank: number;
  handle: string; // neon handle or shortened wallet
  pnl: number; // realized PnL in USDC (can be negative)
  returnPct: number; // return % over the period
};

// Small fast deterministic hash -> 32-bit unsigned int.
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Mulberry32 PRNG — deterministic stream from a numeric seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX = "0123456789abcdef";

function makeWallet(rand: () => number): string {
  const seg = (n: number) => {
    let s = "";
    for (let i = 0; i < n; i++) s += HEX[Math.floor(rand() * 16)];
    return s;
  };
  return `0x${seg(4)}…${seg(4)}`;
}

const HANDLES = [
  "n3on_whale",
  "v0lt.eth",
  "ghost_tap",
  "deathwish",
  "luna_rkt",
  "0xPhantom",
  "byte_runner",
  "crit_hit",
  "synthwave",
  "redline",
  "pulse_kid",
  "hexer",
  "glitchmob",
  "darkstar",
  "afterburn",
  "voidwalk",
];

const ROW_COUNT = 14;

// Period magnitude multipliers: 30D > 7D > 1D.
const PERIOD_SCALE: Record<Period, number> = {
  "1D": 1,
  "7D": 4.6,
  "30D": 13.5,
};

// Category baseline — Death Fun runs hotter / more volatile.
const CATEGORY_BASE: Record<Category, { top: number; ret: number }> = {
  tap: { top: 1850, ret: 22 },
  death: { top: 2600, ret: 34 },
};

export function getLeaderboard(category: Category, period: Period): LeaderRow[] {
  const rand = mulberry32(hashStr(`${category}:${period}`));
  const scale = PERIOD_SCALE[period];
  const base = CATEGORY_BASE[category];

  const rows: LeaderRow[] = [];
  for (let i = 0; i < ROW_COUNT; i++) {
    // Decay so top ranks are bigger. rankFactor: 1 at rank #1 -> small at the tail.
    const rankFactor = Math.pow(0.82, i);
    const jitter = 0.78 + rand() * 0.44; // 0.78–1.22

    let pnl = base.top * scale * rankFactor * jitter;
    let returnPct = base.ret * (0.55 + rankFactor * 0.45) * (0.8 + rand() * 0.4);

    // A couple of tail players are in the red.
    if (i >= ROW_COUNT - 3 && rand() > 0.45) {
      pnl = -Math.abs(pnl) * 0.3;
      returnPct = -Math.abs(returnPct) * 0.4;
    }

    const useHandle = rand() > 0.5;
    const handle = useHandle ? HANDLES[i % HANDLES.length] : makeWallet(rand);

    rows.push({
      rank: 0, // assigned after sort
      handle,
      pnl: Math.round(pnl * 100) / 100,
      returnPct: Math.round(returnPct * 10) / 10,
    });
  }

  rows.sort((a, b) => b.pnl - a.pnl);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
