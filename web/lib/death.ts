import type { DeathSession, DeathTile, Mode, Difficulty } from "./types";
import { generateShapeMask } from "./deathShapes";

// Death Fun — a mines-style game. The board is a random SHAPE (disc, heart,
// diamond, star, …) carved out of a dim×dim grid; skulls are placed RANDOMLY
// among the in-shape tiles. Reveal safe tiles to raise your leverage; hit a
// skull and you bust. STOP cashes out. Payout is fair odds minus the house
// edge, so surviving climbs the multiplier.

export const DEATH_EDGE = 0.07; // baked into payouts (not shown in UI)

// difficulty → board dimension and skull density. Density is tuned so the
// average single-tap safe chance is ≈ 45 / 38 / 28 / 16 %.
export const DIFFICULTIES: Record<Difficulty, { label: string; dim: number; density: number; safePct: number }> = {
  low: { label: "NORMAL", dim: 3, density: 0.55, safePct: 45 },
  medium: { label: "MEDIUM", dim: 6, density: 0.62, safePct: 38 },
  high: { label: "HARD", dim: 13, density: 0.72, safePct: 28 },
  ultra: { label: "ULTRA", dim: 20, density: 0.84, safePct: 16 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["low", "medium", "high", "ultra"];

// fair multiplier after `picks` safe reveals on a `total`-tile board with `bombs` skulls
export function multiplierAfter(picks: number, bombs: number, total: number): number {
  if (picks <= 0) return 1;
  const safe = total - bombs;
  let pSurvive = 1;
  for (let i = 0; i < picks; i++) pSurvive *= (safe - i) / (total - i);
  if (pSurvive <= 0) return 0;
  return (1 - DEATH_EDGE) / pSurvive;
}

export function firstPickWinPct(bombs: number, total: number): number {
  return total > 0 ? ((total - bombs) / total) * 100 : 0;
}

function sample(pool: number[], n: number, rng: () => number): number[] {
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/**
 * Deal a board.
 *
 * `rng` defaults to Math.random for DEMO play. REAL rounds pass the round's
 * committed seed stream instead, so the board is fixed before the first tap and
 * can be re-derived from the published seed afterwards. The result carries
 * `bombsIdx`, which is exactly the thing a REAL-mode client must never see —
 * the server strips it before sending the board to the browser.
 */
export function newBoard(mode: Mode, difficulty: Difficulty = "medium", rng: () => number = Math.random): DeathSession {
  const cfg = DIFFICULTIES[difficulty];
  const dim = cfg.dim;
  const mask = generateShapeMask(dim, rng);
  const inPlay: number[] = [];
  mask.forEach((on, i) => on && inPlay.push(i));
  const total = inPlay.length;
  const bombs = Math.max(1, Math.min(total - 1, Math.round(cfg.density * total)));
  const bombsIdx = sample(inPlay, bombs, rng);

  const tiles: DeathTile[] = mask.map((on) => (on ? "hidden" : "void"));
  return { mode, difficulty, dim, stake: 0, bombs, bombsIdx, tiles, picks: 0, multiplier: 1, status: "idle", cashout: 0 };
}

export function totalTiles(s: DeathSession): number {
  return s.tiles.reduce((n, t) => (t === "void" ? n : n + 1), 0);
}

export function revealAll(s: DeathSession): DeathTile[] {
  return s.tiles.map((t, i) => (t === "void" ? "void" : s.bombsIdx.includes(i) ? "skull" : t === "hidden" ? "safe" : t));
}
