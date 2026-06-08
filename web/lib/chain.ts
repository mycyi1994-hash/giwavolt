import { defineChain } from "viem";

export const giwaSepolia = defineChain({
  id: 91342,
  name: "Giwa Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io"],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://sepolia-explorer.giwa.io" },
  },
  testnet: true,
});
