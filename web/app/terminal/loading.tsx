import { Zap } from "lucide-react";

export default function Loading() {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-12 w-12 place-items-center border border-cyan/50 text-cyan clip animate-glow">
          <Zap size={22} className="animate-spin-slow" />
        </div>
        <span className="font-mono text-[11px] tracking-[0.3em] text-faint">LOADING…</span>
      </div>
    </div>
  );
}
