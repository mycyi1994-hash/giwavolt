"use client";

import GameChart from "@/components/GameChart";

// The live Tap-Trading chart rendered as a non-interactive, blurred backdrop
// (the same visual you see behind the wallet gate). Purely decorative.
export default function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
      <div className="absolute inset-0 opacity-45 blur-[2.5px]">
        <GameChart bidSize={5} zoom={1} onPrice={() => {}} onBalanceDelta={() => {}} onBet={() => {}} getBalance={() => 1000} />
      </div>
      {/* darken + vignette so foreground content stays readable */}
      <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/55 to-bg/80" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 40%, transparent 30%, rgba(6,6,14,0.65) 100%)" }} />
    </div>
  );
}
