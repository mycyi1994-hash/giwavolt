"use client";

import { useEffect, useState } from "react";
import { usePlay } from "@/components/play/PlayProvider";
import { DEMO_STAKES, REAL_STAKES, defaultStake } from "./money";

// Shared stake state for the game panels: tracks DEMO (USDC) vs REAL (tKRW),
// the preset list, and resets the stake to a sensible default on mode switch.
export function useGameStake() {
  const { mode } = usePlay();
  const real = mode === "real";
  const [stake, setStake] = useState(defaultStake(false));
  useEffect(() => setStake(defaultStake(mode === "real")), [mode]);
  return { mode, real, stake, setStake, presets: real ? REAL_STAKES : DEMO_STAKES };
}
