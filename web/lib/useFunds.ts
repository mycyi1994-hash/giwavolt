"use client";

import { usePlay } from "@/components/play/PlayProvider";
import { usdc, won, krw } from "./money";

// Unified funds view for the nav. DEMO = local play money (USDC). REAL = the
// off-chain tKRW game balance (server ledger, no signatures to play).
export function useFunds() {
  const { mode, balance } = usePlay();
  const real = mode === "real";
  const amount = balance[mode];
  return {
    mode,
    real,
    symbol: real ? "tKRW" : "USDC",
    amount,
    fmtMain: real ? won(amount) : usdc(amount),
    fmtSub: real ? "off-chain" : krw(amount),
    label: real ? "GAME BALANCE" : "DEMO",
  };
}
