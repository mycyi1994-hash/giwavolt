import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { giwaSepolia } from "./chain";

export const wagmiConfig = getDefaultConfig({
  appName: "GIWA Slide",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "00000000000000000000000000000000",
  chains: [giwaSepolia],
  ssr: true,
});
