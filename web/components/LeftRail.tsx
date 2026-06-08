"use client";

import { Users, MessageSquare, BarChart3, Flame, Lightbulb, Plus, Settings, PanelLeftClose } from "lucide-react";

const ICONS = [Users, MessageSquare, BarChart3, Flame, Lightbulb];

export default function LeftRail() {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel/60 py-3">
      {ICONS.map((Icon, i) => (
        <button
          key={i}
          className={`flex h-9 w-9 items-center justify-center rounded-md transition ${
            i === 2 ? "bg-panel-3 text-accent" : "text-text-faint hover:bg-panel-2 hover:text-text"
          }`}
        >
          <Icon size={18} />
        </button>
      ))}
      <div className="my-1 h-px w-5 bg-line" />
      <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f7931a] text-[11px] font-black text-black">
        ₿
      </button>
      <button className="flex h-9 w-9 items-center justify-center rounded-md text-text-faint hover:bg-panel-2 hover:text-text">
        <Plus size={18} />
      </button>
      <div className="mt-auto flex flex-col items-center gap-1">
        <button className="flex h-9 w-9 items-center justify-center rounded-md text-text-faint hover:bg-panel-2 hover:text-text">
          <Settings size={18} />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-md text-text-faint hover:bg-panel-2 hover:text-text">
          <PanelLeftClose size={18} />
        </button>
      </div>
    </div>
  );
}
