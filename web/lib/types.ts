export type Mode = "demo" | "real";

// A Death Fun session is kept in shared state so it survives tab switches
// (the game stays "pending" while you're on another tab).
export type DeathTile = "hidden" | "safe" | "skull";

export type DeathStatus = "idle" | "playing" | "stopped" | "busted";

export type DeathSession = {
  mode: Mode;
  stake: number; // USDC
  bombs: number; // 2..8 skulls on the board (random)
  bombsIdx: number[]; // hidden skull positions
  tiles: DeathTile[]; // length 25 (5x5)
  picks: number; // safe tiles revealed
  multiplier: number; // current leverage on the stake
  status: DeathStatus;
  cashout: number; // USDC locked in when stopped (0 when busted)
};
