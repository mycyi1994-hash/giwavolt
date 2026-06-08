import type { DeathSession, DeathTile, Mode, Difficulty } from "./types";
import { generateBombMask } from "./deathPatterns";

// Death Fun — a mines-style game with a 7% house edge. Reveal safe tiles to
// raise your leverage; hit a skull and you bust. Cash out any time with STOP.
// Payout is fair odds minus the edge, so surviving climbs the multiplier and
// denser boards (higher difficulty) climb faster.

export const DEATH_EDGE = 0.07; // 7% house edge

// difficulty → board dimension (N×N) and skull density
export const DIFFICULTIES: Record<Difficulty, { label: string; dim: number; density: number }> = {
  low: { label: "LOW", dim: 3, density: 0.18 },
  medium: { label: "MEDIUM", dim: 6, density: 0.22 },
  high: { label: "HIGH", dim: 13, density: 0.27 },
  ultra: { label: "ULTRA", dim: 25, density: 0.32 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["low", "medium", "high", "ultra"];

// fair multiplier after `picks` safe reveals on a `total`-tile board with `bombs` skulls
export function multiplierAfter(picks: number, bombs: number, total: number): number {
  if (picks <= 0) return 1;
  const safe = total - bombs;
  let pSurvive = 1;
  for (let i = 0; i < picks; i++) pSurvive *= (safe - i) / (total - i);
  return (1 - DEATH_EDGE) / pSurvive;
}

// per-pick survival chance at the start of a board (first reveal)
export function firstPickWinPct(bombs: number, total: number): number {
  return ((total - bombs) / total) * 100;
}

export function newBoard(mode: Mode, difficulty: Difficulty = "medium"): DeathSession {
  const cfg = DIFFICULTIES[difficulty];
  const dim = cfg.dim;
  const total = dim * dim;
  const bombs = Math.max(1, Math.min(total - 1, Math.round(cfg.density * total)));
  return {
    mode,
    difficulty,
    dim,
    stake: 0,
    bombs,
    bombsIdx: generateBombMask(dim, bombs),
    tiles: Array<DeathTile>(total).fill("hidden"),
    picks: 0,
    multiplier: 1,
    status: "idle",
    cashout: 0,
  };
}

export function revealAll(s: DeathSession): DeathTile[] {
  return s.tiles.map((t, i) => (s.bombsIdx.includes(i) ? "skull" : t === "hidden" ? "safe" : t));
}
