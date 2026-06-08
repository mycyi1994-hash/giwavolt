import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createStorage, noopStorage } from "wagmi";
import { giwaSepolia } from "./chain";

// Persist the connection to localStorage so a refresh auto-reconnects the
// wallet instead of prompting again.
export const wagmiConfig = getDefaultConfig({
  appName: "VOLT",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "00000000000000000000000000000000",
  chains: [giwaSepolia],
  ssr: true,
  storage: createStorage({ storage: typeof window !== "undefined" ? window.localStorage : noopStorage }),
});
