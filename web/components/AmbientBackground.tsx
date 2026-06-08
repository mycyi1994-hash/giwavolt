"use client";

import GameChart from "@/components/GameChart";

// The live Tap-Trading chart as a non-interactive backdrop — ambient mode hides
// the lock zone, fills the width, and runs a faster, brighter line.
export default function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
      <div className="absolute inset-0 opacity-60 blur-[1px]">
        <GameChart bidSize={5} zoom={1} ambient onPrice={() => {}} onBalanceDelta={() => {}} onBet={() => {}} getBalance={() => 1000} />
      </div>
      {/* darken + vignette so foreground content stays readable */}
      <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/55 to-bg/70" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(130% 90% at 40% 45%, transparent 35%, rgba(6,6,14,0.6) 100%)" }} />
    </div>
  );
}
