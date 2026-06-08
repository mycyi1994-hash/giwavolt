"use client";

import { usePlay } from "./PlayProvider";

// Demo (play money) vs Real (on-chain) — both require a connected wallet.
export default function ModeToggle() {
  const { mode, setMode } = usePlay();
  return (
    <div className="inline-flex items-center gap-0.5 border border-line bg-ink-2 p-0.5 clip font-display text-[12px] font-bold tracking-wide">
      {(["demo", "real"] as const).map((m) => {
        const active = mode === m;
        const on = m === "demo" ? "border-cyan bg-cyan/15 text-cyan" : "border-magenta bg-magenta/15 text-magenta";
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 clip transition ${active ? on : "text-faint hover:text-txt"}`}
          >
            {m === "demo" ? "DEMO" : "REAL"}
          </button>
        );
      })}
    </div>
  );
}
