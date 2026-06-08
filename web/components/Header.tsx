"use client";

import { Search, Download } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const TABS = ["Trade", "Discover", "Predict", "Tap Trading", "Referrals", "More"];

export default function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-panel/70 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-sm font-black text-[#06140c]">
          기
        </div>
        <span className="text-[15px] font-bold tracking-tight">
          GIWA<span className="text-accent">Slide</span>
        </span>
      </div>

      <nav className="hidden items-center gap-1 md:flex">
        {TABS.map((t) => {
          const active = t === "Tap Trading";
          return (
            <button
              key={t}
              className={`relative rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                active ? "text-text" : "text-text-muted hover:text-text"
              }`}
            >
              {t}
              {t === "Predict" && (
                <span className="ml-1 rounded bg-accent/20 px-1 text-[9px] font-bold text-accent">NEW</span>
              )}
              {active && <span className="absolute inset-x-3 -bottom-[15px] h-0.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        <div className="hidden items-center gap-2 rounded-md border border-line bg-panel-2 px-3 py-1.5 text-[13px] text-text-faint lg:flex">
          <Search size={14} />
          <span>Search by token…</span>
          <kbd className="rounded border border-line px-1 text-[10px]">/</kbd>
        </div>
        <button className="hidden items-center gap-1.5 rounded-md border border-line bg-panel-2 px-3 py-1.5 text-[13px] font-medium hover:border-line-strong sm:flex">
          <Download size={14} /> Deposit
        </button>
        <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
      </div>
    </header>
  );
}
