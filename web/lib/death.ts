import type { DeathSession, DeathTile, Mode } from "./types";

// Death Fun — a mines-style game. A 5×5 board hides 2–8 skulls (random). Reveal
// safe tiles to raise your leverage; hit a skull and you bust. Cash out any time
// with STOP. Payout is fair odds minus a 7% house edge, so the more you've
// survived the higher the multiplier (and more skulls ⇒ it climbs faster).

export const DEATH_EDGE = 0.07;
export const TILES = 25;
export const MIN_BOMBS = 2;
export const MAX_BOMBS = 8;

export function randomBombs(): number {
  return MIN_BOMBS + Math.floor(Math.random() * (MAX_BOMBS - MIN_BOMBS + 1));
}

function pickBombs(bombs: number): number[] {
  const idx = new Set<number>();
  while (idx.size < bombs) idx.add(Math.floor(Math.random() * TILES));
  return [...idx];
}

// fair multiplier after `picks` safe reveals on a board with `bombs` skulls
export function multiplierAfter(picks: number, bombs: number): number {
  if (picks <= 0) return 1;
  const safe = TILES - bombs;
  let pSurvive = 1;
  for (let i = 0; i < picks; i++) pSurvive *= (safe - i) / (TILES - i);
  return (1 - DEATH_EDGE) / pSurvive;
}

// a fresh, unbet board (status "idle")
export function newBoard(mode: Mode): DeathSession {
  const bombs = randomBombs();
  return {
    mode,
    stake: 0,
    bombs,
    bombsIdx: pickBombs(bombs),
    tiles: Array<DeathTile>(TILES).fill("hidden"),
    picks: 0,
    multiplier: 1,
    status: "idle",
    cashout: 0,
  };
}

export function revealAll(s: DeathSession): DeathTile[] {
  return s.tiles.map((t, i) => (s.bombsIdx.includes(i) ? "skull" : t === "hidden" ? "safe" : t));
}
