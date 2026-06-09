// VoltTap — instant on-chain "tap trading" settlement on Giwa Sepolia.
//
// REAL mode taps go straight to the chain: a fixed 0.0001 ETH stake, with the
// win-chance derived from the multiplier of the tapped cell. The contract rolls
// a provably-fair number and pays out STAKE * multiplier on a win. There is NO
// off-chain balance here — every tap is its own signed transaction. (The
// Polymarket-style deposit balance is a separate, later phase that needs a
// custody backend; see game/docs.)

export const VOLTTAP_ADDRESS = (process.env.NEXT_PUBLIC_VOLTTAP_ADDRESS ?? "").trim() as
  | `0x${string}`
  | "";

export const voltTapEnabled = /^0x[0-9a-fA-F]{40}$/.test(VOLTTAP_ADDRESS);

// Must mirror the constants in contracts/src/VoltTap.sol.
export const STAKE_WEI = 100_000_000_000_000n; // 1e14 = 0.0001 ETH
export const STAKE_ETH = 0.0001;
export const BPS = 10_000;
export const EDGE_BPS = 700; // 7% house edge

// multiplier = (BPS - EDGE_BPS) / winChanceBps  ⇒  winChanceBps = (BPS - EDGE_BPS) / mult.
// Returns null when the multiplier is too low to be representable (implied
// win-chance ≥ 100%).
export function winChanceBpsFromMult(mult: number): number | null {
  if (!(mult > 0)) return null;
  const bps = Math.round((BPS - EDGE_BPS) / mult);
  if (bps < 1 || bps >= BPS) return null;
  return bps;
}

// The exact payout the contract will pay for a given win-chance (in wei),
// including the returned stake. Mirrors VoltTap.tap()'s integer math.
export function payoutWeiFor(winChanceBps: number): bigint {
  return (STAKE_WEI * BigInt(BPS - EDGE_BPS)) / BigInt(winChanceBps);
}

export const voltTapAbi = [
  {
    type: "function",
    name: "tap",
    stateMutability: "payable",
    inputs: [{ name: "winChanceBps", type: "uint16" }],
    outputs: [
      { name: "win", type: "bool" },
      { name: "payout", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "freeBankroll",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "STAKE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Tapped",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "winChanceBps", type: "uint16", indexed: false },
      { name: "multiplierBps", type: "uint256", indexed: false },
      { name: "payout", type: "uint256", indexed: false },
      { name: "win", type: "bool", indexed: false },
      { name: "roll", type: "uint256", indexed: false },
    ],
  },
] as const;
