export type Mode = "demo" | "real";

export type Difficulty = "low" | "medium" | "high" | "ultra";

// A Death Fun session is kept in shared state so it survives tab switches
// (the game stays "pending" while you're on another tab).
export type DeathTile = "hidden" | "safe" | "skull";

export type DeathStatus = "idle" | "playing" | "stopped" | "busted";

export type DeathSession = {
  mode: Mode;
  difficulty: Difficulty;
  dim: number; // board is dim × dim
  stake: number; // USDC
  bombs: number; // hidden skulls
  bombsIdx: number[]; // hidden skull positions (pattern)
  tiles: DeathTile[]; // length dim*dim
  picks: number; // safe tiles revealed
  multiplier: number; // current leverage on the stake
  status: DeathStatus;
  cashout: number; // USDC locked in when stopped (0 when busted)
};
