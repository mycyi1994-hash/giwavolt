"use client";

import { usePlay } from "./PlayProvider";
import { REAL_ENABLED } from "@/lib/realMode";

// Demo (play money) vs Real (on-chain) — both require a connected wallet.
//
// REAL is disabled unless the deployment declares a backend. On a DEMO-only
// deployment the ledger routes have no database, so an enabled button hands the
// visitor a 500 instead of a game.
export default function ModeToggle() {
  const { mode, setMode } = usePlay();
  return (
    <div className="inline-flex items-center gap-0.5 border border-line bg-ink-2 p-0.5 clip font-display text-[12px] font-bold tracking-wide">
      {(["demo", "real"] as const).map((m) => {
        const active = mode === m;
        const locked = m === "real" && !REAL_ENABLED;
        const on = m === "demo" ? "border-cyan bg-cyan/15 text-cyan" : "border-magenta bg-magenta/15 text-magenta";
        return (
          <button
            key={m}
            onClick={() => !locked && setMode(m)}
            disabled={locked}
            title={locked ? "REAL is off in this deployment — testnet demo" : undefined}
            className={`px-3 py-1.5 clip transition ${
              locked ? "cursor-not-allowed text-faint/40" : active ? on : "text-faint hover:text-txt"
            }`}
          >
            {m === "demo" ? "DEMO" : "REAL"}
          </button>
        );
      })}
    </div>
  );
}
