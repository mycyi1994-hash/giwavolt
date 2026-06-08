"use client";

import { useEffect, useState } from "react";
import { Quote } from "lucide-react";
import { randomQuote, randomColor } from "@/lib/quotes";

const GLOW: Record<string, string> = {
  "text-cyan": "0 0 8px rgba(0,229,255,.6)",
  "text-magenta": "0 0 8px rgba(255,43,214,.6)",
  "text-lime": "0 0 8px rgba(57,255,20,.6)",
  "text-gold": "0 0 8px rgba(255,210,63,.6)",
  "text-purple": "0 0 8px rgba(157,77,255,.6)",
};

// Rotates a random house aphorism with a shifting neon colour.
export default function QuoteTicker() {
  const [q, setQ] = useState({ text: "", color: "text-cyan" });
  useEffect(() => {
    const roll = () => setQ({ text: randomQuote(), color: randomColor() });
    roll();
    const id = setInterval(roll, 6500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="border-t border-line pt-3">
      <Quote size={13} className="mb-1 text-faint" />
      <p
        key={q.text}
        className={`animate-rise font-display text-[14px] font-bold italic leading-snug ${q.color}`}
        style={{ textShadow: GLOW[q.color] }}
      >
        {q.text}
      </p>
    </div>
  );
}
