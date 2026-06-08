"use client";

import ConnectGate from "@/components/play/ConnectGate";
import CandleGame from "@/components/play/CandleGame";

export default function CandlePage() {
  return (
    <ConnectGate title="NEXT CANDLE">
      <CandleGame />
    </ConnectGate>
  );
}
