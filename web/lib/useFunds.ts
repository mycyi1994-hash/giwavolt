"use client";

import { usePlay } from "@/components/play/PlayProvider";
import { usdc, krw } from "./money";

// Unified funds view. DEMO = play money. REAL = the deposited game balance
// (Polymarket-style: fund a deposit address once, then play instantly with no
// per-bet signatures). Both are denominated in USDC.
export function useFunds() {
  const { mode, balance } = usePlay();
  const amount = balance[mode];
  return {
    mode,
    symbol: "USDC",
    amount,
    fmtMain: usdc(amount),
    fmtSub: krw(amount),
    label: mode === "real" ? "DEPOSITED" : "DEMO",
  };
}
