import { defineChain, type Chain } from "viem";
import { bscTestnet, opBNBTestnet } from "viem/chains";

// The chain this deployment targets.
//
// Everything on-chain here is bound to exactly one network at a time: the tKRW
// token, the GameVault, and — load-bearing — the chainId inside the withdrawal
// voucher's EIP-712 domain. Which network that is used to be a constant, so
// pointing the app at a different chain was a code change rather than a
// configuration one. It is `NEXT_PUBLIC_CHAIN` now. Giwa Sepolia stays the
// default because that is where the deployed, source-verified pair recorded in
// contracts/DEPLOYMENTS.md actually lives.
//
// These are NEXT_PUBLIC_*, which Next inlines at build time, so each one has to
// be read as a literal `process.env.NEXT_PUBLIC_…`. A computed lookup —
// process.env[name] — reads as undefined in the browser bundle. That is why the
// registry below is a fixed table and the RPC override is one named variable
// rather than one per chain.

/** Giwa Sepolia. viem has no built-in definition for it; the rest are its own. */
export const giwaSepolia = defineChain({
  id: 91342,
  name: "Giwa Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://sepolia-explorer.giwa.io" },
  },
  testnet: true,
});

/**
 * The chains this app knows how to run on. Deploying to a new one means adding
 * a row here and deploying the contracts — nothing downstream of this file
 * names a network.
 */
export const CHAINS = {
  "giwa-sepolia": giwaSepolia,
  "bsc-testnet": bscTestnet,
  "opbnb-testnet": opBNBTestnet,
} satisfies Record<string, Chain>;

export type ChainKey = keyof typeof CHAINS;

const requested = process.env.NEXT_PUBLIC_CHAIN ?? "";

// A typo is refused, not absorbed. Falling back to the default on an
// unrecognised value would run the app against Giwa while the operator believes
// it is on BSC — and sign every withdrawal voucher with the wrong chainId, so
// the vault rejects it as "bad sig" with nothing on-chain to explain why. Unset
// is a choice; misspelled is a mistake, and only one of them has a safe answer.
if (requested && !(requested in CHAINS)) {
  throw new Error(
    `NEXT_PUBLIC_CHAIN="${requested}" is not a known chain. Use one of: ${Object.keys(CHAINS).join(", ")}`
  );
}

export const CHAIN_KEY: ChainKey = (requested || "giwa-sepolia") as ChainKey;

const base = CHAINS[CHAIN_KEY];

// A private or paid RPC, when the public one is rate-limited. The legacy
// Giwa-specific variable is still honoured so existing deployments keep
// working, but only while Giwa is the target: left set after a switch to BSC it
// would otherwise point the new chain at a Giwa node.
const rpcOverride =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (CHAIN_KEY === "giwa-sepolia" ? process.env.NEXT_PUBLIC_GIWA_RPC_URL : undefined) ||
  undefined;

/** The chain every client, contract read and signature in this app is bound to. */
export const activeChain: Chain = rpcOverride
  ? { ...base, rpcUrls: { ...base.rpcUrls, default: { http: [rpcOverride] } } }
  : base;

/** The RPC the server should dial. Server routes must not re-derive this. */
export const RPC_URL: string = activeChain.rpcUrls.default.http[0];

/** Display name for the UI, e.g. "Giwa Sepolia" or "BNB Smart Chain Testnet". */
export const CHAIN_LABEL: string = activeChain.name;

/** Explorer root, for linking a tx or an address. Null if the chain has none. */
export const EXPLORER_URL: string | null = activeChain.blockExplorers?.default?.url ?? null;
