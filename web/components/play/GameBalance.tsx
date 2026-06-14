"use client";

import { amt } from "@/lib/money";
import ClaimButton from "./ClaimButton";

// Shared balance block for the game panels. REAL = off-chain tKRW (₩) with a
// GET TEST KRW button; DEMO = local play money.
export default function GameBalance({
  real,
  amount,
  demoLabel = "BALANCE",
  demoSub,
}: {
  real: boolean;
  amount: number;
  demoLabel?: string;
  demoSub?: string;
}) {
  if (real)
    return (
      <div>
        <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">GAME BALANCE (tKRW)</div>
        <div className="tabular text-[26px] font-black leading-none text-magenta neon-magenta">{amt(true, amount)}</div>
        <div className="tabular mt-0.5 text-[11px] text-faint">off-chain · no signature</div>
        <ClaimButton className="mt-2 w-full" />
      </div>
    );
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-faint">{demoLabel}</div>
      <div className="tabular text-[26px] font-black leading-none text-cyan neon-cyan">{amt(false, amount)}</div>
      {demoSub && <div className="tabular text-[11px] text-faint">{demoSub}</div>}
    </div>
  );
}
