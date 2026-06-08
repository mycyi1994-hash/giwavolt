"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { loadMuted, setMuted, sfx } from "@/lib/sound";

export default function SoundToggle() {
  const [muted, setM] = useState(false);
  useEffect(() => setM(loadMuted()), []);
  return (
    <button
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setM(next);
        if (!next) sfx.select();
      }}
      title={muted ? "Unmute" : "Mute"}
      className="grid h-9 w-9 place-items-center border border-line bg-ink-2 text-muted clip transition hover:border-cyan/50 hover:text-cyan"
    >
      {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
    </button>
  );
}
