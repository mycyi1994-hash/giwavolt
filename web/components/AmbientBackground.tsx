"use client";

import GameChart from "@/components/GameChart";

// The live Tap-Trading chart as a non-interactive backdrop — ambient mode hides
// the lock zone, fills the width, and runs a faster, brighter line.
//
// Pinned to VOLT. The landing page is the first thing a visitor sees, and BTC
// needs an exchange socket that is geo-blocked in some regions — where it is,
// the backdrop was simply blank. VOLT is generated here and always draws.
export default function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
      {/* No blur filter here. blur-[1px] put the whole live canvas into a
          filtered render surface that had to be re-filtered every frame, and
          at 1px over a chart already sitting at 60% opacity behind two
          gradient scrims it was not visible anyway. */}
      <div className="absolute inset-0 opacity-60">
        <GameChart market="volt" bidSize={5} zoom={1} ambient onPrice={() => {}} onBalanceDelta={() => {}} onBet={() => {}} getBalance={() => 1000} />
      </div>
      {/* darken + vignette so foreground content stays readable */}
      <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/55 to-bg/70" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(130% 90% at 40% 45%, transparent 35%, rgba(6,6,14,0.6) 100%)" }} />
    </div>
  );
}
