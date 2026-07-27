// Rules of the Tap Trading board, shared by the chart and the server.
//
// The browser draws the columns and the server validates bets against them, so
// if these two ever disagreed a legitimate tap would be rejected — or worse, an
// illegitimate one accepted. One definition, imported by both.

/** Columns sit on a fixed wall-clock grid, so both sides agree on settle times. */
export const COL_INTERVAL_MS = 3_400;

/** No betting inside this many seconds of a column — that's the locked zone. */
export const MIN_BET_HORIZON_SEC = 10;

/** Furthest column the board offers, plus slack for latency between tap and POST. */
export const MAX_BET_HORIZON_SEC = 60;

/**
 * How far a requested band's height may stray from the server's own band size.
 * The client derives its grid from its own volatility measurement, which will
 * differ slightly from the server's, so exact equality would reject honest
 * taps. The window is wide enough for that and far too narrow to let a client
 * invent a band shaped to its advantage.
 */
export const BAND_WIDTH_MIN_RATIO = 0.4;
export const BAND_WIDTH_MAX_RATIO = 2.5;

/** Most unsettled bets one address may hold at once. */
export const MAX_OPEN_BETS = 60;

/**
 * A due bet whose settlement price can't be fetched is voided after this long.
 * Short enough that money isn't held hostage by an exchange outage, long enough
 * to ride out a transient fetch failure.
 */
export const VOID_UNRESOLVED_AFTER_MS = 45_000;

export function isColumnTime(t: number): boolean {
  return Number.isInteger(t) && t > 0 && t % COL_INTERVAL_MS === 0;
}
