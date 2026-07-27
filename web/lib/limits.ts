// Table limits, shared by every money-handling route.
//
// A stake is already bounded by the player's balance — `debit` refuses to go
// negative — so this is not the thing standing between a player and the
// bankroll. It bounds the *arithmetic*: an absurd stake would otherwise flow
// into `stake × multiplier` and into numeric columns, and a single lucky
// maximum-stake round shouldn't be able to drain the house either.
export const MAX_STAKE = 10_000_000; // tKRW
