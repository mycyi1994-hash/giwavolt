// VoltTap — instant on-chain bet (REAL mode). Fixed 0.0001 ETH stake, 7% edge.
// Set NEXT_PUBLIC_VOLTTAP_ADDRESS after deploying game/contracts VoltTap.

export const VOLTTAP_ADDRESS = (process.env.NEXT_PUBLIC_VOLTTAP_ADDRESS || "") as `0x${string}` | "";

export const STAKE_ETH = 0.0001;
export const STAKE_WEI = 100_000_000_000_000n; // 1e14 wei
export const EDGE_BPS = 700;
export const BPS = 10_000;

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
  { type: "function", name: "freeBankroll", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "fund", stateMutability: "payable", inputs: [], outputs: [] },
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

// cell multiplier m → win-chance in bps, consistent with the contract:
// contract multiplier = (BPS - EDGE_BPS) / winChanceBps  ⇒  winChanceBps = (BPS-EDGE)/m
export function winChanceBpsForMult(m: number): number {
  return Math.max(1, Math.min(BPS - 1, Math.round((BPS - EDGE_BPS) / m)));
}

export const isVoltTapConfigured = () => !!VOLTTAP_ADDRESS;
