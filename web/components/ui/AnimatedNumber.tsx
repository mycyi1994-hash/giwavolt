"use client";

import { useEffect, useRef, useState } from "react";

// Tweens to a new value and flashes color on change (lime up / magenta down).
export default function AnimatedNumber({
  value,
  format,
  className = "",
  flash = true,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  flash?: boolean;
}) {
  const [display, setDisplay] = useState(value);
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const fromRef = useRef(value);
  const rafRef = useRef<number>();

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    let flashTimer: ReturnType<typeof setTimeout> | undefined;
    if (flash) {
      setDir(to > from ? 1 : -1);
      flashTimer = setTimeout(() => setDir(0), 450);
    }
    const start = performance.now();
    const dur = 380;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(from + (to - from) * eased);
      if (k < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (flashTimer) clearTimeout(flashTimer);
    };
  }, [value, flash]);

  const flashCls = dir === 1 ? "text-lime" : dir === -1 ? "text-magenta" : "";
  return <span className={`${className} ${flash ? "transition-colors duration-300" : ""} ${flashCls}`}>{format(display)}</span>;
}
