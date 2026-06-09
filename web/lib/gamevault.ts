// GameVault — on-chain custody for the game balance.
// Deposits: user approves tKRW then calls deposit() (their only signatures).
// Withdrawals: the backend (operator) signs an EIP-712 cumulative voucher and
// relays the tx, so the player needs no gas/signature.

export const GAMEVAULT_ADDRESS = (process.env.NEXT_PUBLIC_GAMEVAULT_ADDRESS ?? "").trim() as `0x${string}` | "";
export const gameVaultEnabled = /^0x[0-9a-fA-F]{40}$/.test(GAMEVAULT_ADDRESS);

export const gameVaultAbi = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "fundBankroll", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "cumulative", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
  { type: "function", name: "withdrawn", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "deposited", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "freeBankroll", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "lifetime", type: "uint256", indexed: false },
    ],
  },
] as const;

// EIP-712 voucher (must match GameVault.sol's domain + Withdraw struct).
export const withdrawVoucherTypes = {
  Withdraw: [
    { name: "user", type: "address" },
    { name: "cumulative", type: "uint256" },
  ],
} as const;

export function voucherDomain(chainId: number, verifyingContract: `0x${string}`) {
  return { name: "GameVault", chainId, verifyingContract } as const;
}
