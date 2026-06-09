// TestKRW (tKRW) — faucet-funded play-money token on Giwa Sepolia.
// No real value; lets people try the games without real testnet USDC/ETH.

export const TESTKRW_ADDRESS = (process.env.NEXT_PUBLIC_TESTKRW_ADDRESS ?? "").trim() as
  | `0x${string}`
  | "";

export const testKrwEnabled = /^0x[0-9a-fA-F]{40}$/.test(TESTKRW_ADDRESS);

export const TKRW_DECIMALS = 18;

// Minimal ERC-20 surface we touch from the app.
export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "faucet", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

// Compact KRW-style display from an 18-dp on-chain amount (₩1,000,000).
export function fmtKrw(raw: bigint | undefined): string {
  if (raw == null) return "—";
  const whole = raw / 10n ** BigInt(TKRW_DECIMALS);
  return "₩" + whole.toLocaleString("en-US");
}
