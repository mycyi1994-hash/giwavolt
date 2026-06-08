"use client";

import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

// Any interaction that needs a wallet should route through requireWallet():
// if not connected it pops the RainbowKit connect modal, otherwise it runs the
// action. Used by the landing CTAs and every game's play actions.
export function useWalletGate() {
  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();

  function requireWallet(action?: () => void) {
    if (!isConnected) {
      openConnectModal?.();
      return false;
    }
    action?.();
    return true;
  }

  return { isConnected, address, requireWallet, openConnectModal };
}
