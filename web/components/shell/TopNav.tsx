"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Zap, Home, LineChart, Skull, Trophy, User } from "lucide-react";
import { usePlay } from "@/components/play/PlayProvider";
import ModeToggle from "@/components/play/ModeToggle";
import SoundToggle from "@/components/play/SoundToggle";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { usdc, krw } from "@/lib/money";

const TABS = [
  { href: "/terminal", label: "Home", icon: Home },
  { href: "/terminal/tap", label: "Tap Trading", icon: LineChart },
  { href: "/terminal/death", label: "Death Fun", icon: Skull },
  { href: "/terminal/leaderboard", label: "Leaderboard", icon: Trophy },
];

export default function TopNav() {
  const pathname = usePathname();
  const { mode, balance } = usePlay();
  const bal = balance[mode];

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-ink/70 px-4 backdrop-blur">
      {/* brand */}
      <Link href="/" className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center bg-gradient-to-br from-cyan to-magenta text-[#06060e] clip animate-glow">
          <Zap size={17} strokeWidth={2.6} />
        </div>
        <span className="font-display text-[16px] font-black tracking-[0.18em] text-txt neon-cyan">VOLT</span>
      </Link>

      {/* tabs */}
      <nav className="ml-3 flex items-center gap-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/terminal" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 font-display text-[13px] font-semibold tracking-wide transition ${
                active ? "text-cyan" : "text-muted hover:text-txt"
              }`}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
              {active && (
                <span className="absolute inset-x-2 -bottom-[15px] h-0.5 bg-cyan shadow-[0_0_10px_#00e5ff]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* right cluster: fund · mode · wallet · profile */}
      <div className="ml-auto flex items-center gap-2.5">
        <div className="hidden flex-col items-end leading-none md:flex">
          <AnimatedNumber value={bal} format={(n) => usdc(n)} className="tabular text-[13px] font-bold text-cyan" />
          <span className="tabular text-[10px] text-faint">{krw(bal)}</span>
        </div>
        <ModeToggle />
        <SoundToggle />
        <ConnectButton accountStatus="address" chainStatus="none" showBalance={false} />
        <Link
          href="/terminal/profile"
          className="grid h-9 w-9 place-items-center border border-line bg-ink-2 text-muted clip transition hover:border-cyan/50 hover:text-cyan"
        >
          <User size={16} />
        </Link>
      </div>
    </header>
  );
}
