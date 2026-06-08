"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Zap, Home, LineChart, Skull, Trophy, User, TrendingUp } from "lucide-react";
import ModeToggle from "@/components/play/ModeToggle";
import SoundToggle from "@/components/play/SoundToggle";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { useFunds } from "@/lib/useFunds";

const TABS = [
  { href: "/terminal", label: "Home", icon: Home },
  { href: "/terminal/tap", label: "Tap Trading", icon: LineChart },
  { href: "/terminal/death", label: "Death Fun", icon: Skull },
  { href: "/terminal/leaderboard", label: "Leaderboard", icon: Trophy },
];

export default function TopNav() {
  const pathname = usePathname();
  const funds = useFunds();

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-ink/70 px-4 backdrop-blur">
      {/* brand */}
      <Link href="/" className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center bg-gradient-to-br from-cyan to-magenta text-[#06060e] clip animate-glow">
          <Zap size={17} strokeWidth={2.6} />
        </div>
        <span className="font-display text-[16px] font-black tracking-[0.18em] text-txt neon-cyan">VOLT</span>
      </Link>

      {/* prominent PREDICT tab */}
      {(() => {
        const active = pathname.startsWith("/terminal/predict");
        return (
          <Link
            href="/terminal/predict"
            className={`relative ml-2 flex items-center gap-1.5 border px-4 py-2 font-display text-[14px] font-black tracking-wider clip transition ${
              active
                ? "border-cyan bg-cyan/20 text-cyan"
                : "border-cyan/60 bg-gradient-to-r from-cyan/15 to-magenta/15 text-txt hover:from-cyan/25 hover:to-magenta/25"
            } animate-glow`}
          >
            <TrendingUp size={16} className="text-cyan" /> PREDICT
            <span className="rounded bg-magenta px-1 text-[8px] font-bold text-[#06060e]">NEW</span>
          </Link>
        );
      })()}

      {/* tabs */}
      <nav className="ml-2 flex items-center gap-1">
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
          <AnimatedNumber
            value={funds.amount}
            format={(n) => (funds.symbol === "ETH" ? `${n.toFixed(4)} ETH` : `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`)}
            className="tabular text-[13px] font-bold text-cyan"
          />
          <span className="tabular text-[10px] text-faint">{funds.fmtSub}</span>
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
