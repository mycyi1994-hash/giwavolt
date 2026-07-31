import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, createStorage, http, noopStorage } from "wagmi";
import { giwaSepolia } from "./chain";

// A WalletConnect project id is a 32-character hex string. Anything else — and
// in particular the placeholder this file used to fall back to — produces a
// connector that cannot initialise, and wagmi's reconnect-on-mount walks every
// connector, so one that throws takes the session down with it. That is why the
// wallet kept dropping on refresh in a deployment with no id configured.
const rawProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";
const hasWalletConnect = /^[0-9a-f]{32}$/i.test(rawProjectId);

// Injected is always offered and needs nothing configured: it covers MetaMask,
// Rabby, Brave and anything else announcing itself through EIP-6963. The
// WalletConnect-backed options only appear once there is a real id to give them.
const connectors = connectorsForWallets(
  [
    { groupName: "Wallets", wallets: [injectedWallet] },
    ...(hasWalletConnect
      ? [{ groupName: "More", wallets: [metaMaskWallet, rainbowWallet, walletConnectWallet] }]
      : []),
  ],
  { appName: "VOLT", projectId: rawProjectId }
);

export const wagmiConfig = createConfig({
  chains: [giwaSepolia],
  connectors,
  // Persist to localStorage so a refresh reconnects instead of prompting again.
  storage: createStorage({ storage: typeof window !== "undefined" ? window.localStorage : noopStorage }),
  ssr: true,
  transports: { [giwaSepolia.id]: http() },
});

/** Whether the WalletConnect options are available in this build. */
export const walletConnectEnabled = hasWalletConnect;
