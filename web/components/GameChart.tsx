"use client";

import { useEffect, useRef } from "react";
import { cellMultiplier, multIntensity, VOL_PER_SQRT_SEC } from "@/lib/grid";
import { mult as fmtMult, money } from "@/lib/format";

// ---- engine tuning -------------------------------------------------------
const VIEW_PAST_MS = 64_000; // window of history shown left of "now"
const VIEW_FUTURE_MS = 44_000; // window of future grid shown right of "now"
const NOW_X = 0.56; // horizontal position of the "now" line (0..1)
const COL_INTERVAL_MS = 3_400; // time between grid columns
const STEP_PCT = 0.00058; // band height as a fraction of price
const MIN_ROWS = 16; // minimum vertical bands kept in view
const MAX_ROWS = 24; // maximum vertical bands (keeps cells readable on big moves)
const TICK_MS = 180; // price sim tick
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

type Column = { t: number; resolved: boolean; winRow: number; winPrice: number };
type Bet = {
  id: number;
  colT: number;
  band: number;
  stake: number;
  mult: number;
  status: "live" | "won" | "lost";
  bornAt: number;
};
type Floater = { x: number; y: number; text: string; born: number; good: boolean };

export type EngineHandle = {
  setBid: (n: number) => void;
};

export default function GameChart({
  bidSize,
  onPrice,
  onBalanceDelta,
  onBet,
  getBalance,
}: {
  bidSize: number;
  onPrice: (p: number) => void;
  onBalanceDelta: (d: number) => void;
  onBet: (b: { stake: number; mult: number; status: "live" | "won" | "lost" }) => void;
  getBalance: () => number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // live refs read inside the RAF loop
  const bidRef = useRef(bidSize);
  bidRef.current = bidSize;
  const balanceRef = useRef(getBalance);
  balanceRef.current = getBalance;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;

    // ---- engine state ----
    const anchor = 1673.49; // anchor price defining the fixed band ladder
    const step = anchor * STEP_PCT;
    let price = anchor;
    const history: { t: number; p: number }[] = [{ t: Date.now(), p: price }];
    const columns: Column[] = [];
    const bets: Bet[] = [];
    const floaters: Floater[] = [];
    let nextBetId = 1;
    let range = { min: price - MIN_ROWS * step * 0.5, max: price + MIN_ROWS * step * 0.5 };
    const mouse = { x: -1, y: -1, inside: false };

    // device-pixel sizing
    let W = 0;
    let H = 0;
    function resize() {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ---- band ladder helpers (fixed in price space) ----
    const bandLow = (b: number) => anchor + b * step;
    const bandCenter = (b: number) => anchor + (b + 0.5) * step;
    const bandForPrice = (p: number) => Math.floor((p - anchor) / step);

    // ---- coordinate mapping ----
    const plotTop = PAD_TOP;
    const plotBot = () => H - PAD_BOTTOM;
    function xForTime(t: number, now: number) {
      const nowX = W * NOW_X;
      if (t <= now) return nowX + ((t - now) / VIEW_PAST_MS) * nowX;
      return nowX + ((t - now) / VIEW_FUTURE_MS) * (W - nowX);
    }
    function yForPrice(p: number) {
      const top = plotTop;
      const bot = plotBot();
      return bot - ((p - range.min) / (range.max - range.min)) * (bot - top);
    }

    // ---- price simulation ----
    // Driftless Gaussian random walk with the SAME volatility the multiplier
    // model assumes (VOL_PER_SQRT_SEC), so the realised house edge converges to
    // HOUSE_EDGE. A tiny pull toward the anchor keeps the line on screen over
    // long sessions without materially changing short-horizon volatility.
    let spare: number | null = null;
    function gaussian(): number {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return v;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    }
    const dt = TICK_MS / 1000;
    let lastTick = Date.now();
    function stepPrice(now: number) {
      while (now - lastTick >= TICK_MS) {
        lastTick += TICK_MS;
        price += price * VOL_PER_SQRT_SEC * Math.sqrt(dt) * gaussian() + (anchor - price) * 0.0006;
        history.push({ t: lastTick, p: price });
        onPrice(price);
      }
      // trim history out of view
      const cutoff = now - VIEW_PAST_MS - 2000;
      while (history.length > 2 && history[0].t < cutoff) history.shift();
    }

    // ---- columns lifecycle ----
    function ensureColumns(now: number) {
      // seed first column aligned to interval
      if (columns.length === 0) {
        const first = Math.ceil((now + 4000) / COL_INTERVAL_MS) * COL_INTERVAL_MS;
        columns.push({ t: first, resolved: false, winRow: 0, winPrice: 0 });
      }
      const lastT = columns[columns.length - 1].t;
      const horizon = now + VIEW_FUTURE_MS + COL_INTERVAL_MS;
      for (let t = lastT + COL_INTERVAL_MS; t <= horizon; t += COL_INTERVAL_MS) {
        columns.push({ t, resolved: false, winRow: 0, winPrice: 0 });
      }
      // resolve & retire
      for (const c of columns) {
        if (!c.resolved && now >= c.t) {
          c.resolved = true;
          c.winPrice = price;
          c.winRow = bandForPrice(price);
          settleColumn(c, now);
        }
      }
      // drop columns fully scrolled off the left
      while (columns.length && columns[0].t < now - 8000) columns.shift();
    }

    function settleColumn(c: Column, now: number) {
      for (const b of bets) {
        if (b.status !== "live" || b.colT !== c.t) continue;
        if (b.band === c.winRow) {
          b.status = "won";
          const payout = b.stake * b.mult;
          onBalanceDelta(payout);
          onBet({ stake: b.stake, mult: b.mult, status: "won" });
          floaters.push({
            x: xForTime(c.t, now),
            y: yForPrice(bandCenter(b.band)),
            text: "+" + money(payout),
            born: now,
            good: true,
          });
        } else {
          b.status = "lost";
          onBet({ stake: b.stake, mult: b.mult, status: "lost" });
        }
      }
    }

    // ---- hit testing for taps ----
    function cellAt(px: number, py: number, now: number): { colT: number; band: number } | null {
      const nowX = W * NOW_X;
      if (px < nowX) return null;
      // find column slot containing px
      for (const c of columns) {
        if (c.resolved) continue;
        const x0 = xForTime(c.t, now);
        const x1 = xForTime(c.t + COL_INTERVAL_MS, now);
        if (px >= x0 && px < x1) {
          const p = range.min + ((plotBot() - py) / (plotBot() - plotTop)) * (range.max - range.min);
          return { colT: c.t, band: bandForPrice(p) };
        }
      }
      return null;
    }

    function placeBet(colT: number, band: number) {
      const stake = bidRef.current;
      if (stake <= 0 || balanceRef.current() < stake) return;
      const now = Date.now();
      const h = (colT - now) / 1000;
      if (h <= 0.6) return; // too late
      const lo = bandLow(band) - price;
      const m = cellMultiplier(lo, lo + step, h, price);
      if (m <= 0) return; // cell not offered
      bets.push({ id: nextBetId++, colT, band, stake, mult: m, status: "live", bornAt: now });
      onBalanceDelta(-stake);
      onBet({ stake, mult: m, status: "live" });
    }

    // ---- interaction ----
    function onMove(e: MouseEvent) {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.inside = true;
    }
    function onLeave() {
      mouse.inside = false;
    }
    function onClick(e: MouseEvent) {
      const r = canvas.getBoundingClientRect();
      const cell = cellAt(e.clientX - r.left, e.clientY - r.top, Date.now());
      if (cell) placeBet(cell.colT, cell.band);
    }
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);

    // ---- rendering ----
    function updateRange(now: number) {
      let lo = price;
      let hi = price;
      for (const h of history) {
        if (h.t < now - VIEW_PAST_MS) continue;
        if (h.p < lo) lo = h.p;
        if (h.p > hi) hi = h.p;
      }
      const center = (lo + hi) / 2;
      const half = Math.min(
        Math.max((hi - lo) / 2 + step * 2, (MIN_ROWS * step) / 2),
        (MAX_ROWS * step) / 2
      );
      const tMin = center - half;
      const tMax = center + half;
      // ease toward target
      range.min += (tMin - range.min) * 0.08;
      range.max += (tMax - range.max) * 0.08;
    }

    function draw() {
      const now = Date.now();
      stepPrice(now);
      ensureColumns(now);
      updateRange(now);

      ctx.clearRect(0, 0, W, H);
      const nowX = W * NOW_X;

      // background grid lines (price ladder)
      ctx.lineWidth = 1;
      const firstBand = bandForPrice(range.min) - 1;
      const lastBand = bandForPrice(range.max) + 1;
      ctx.strokeStyle = "rgba(255,255,255,0.035)";
      for (let b = firstBand; b <= lastBand; b++) {
        const y = yForPrice(bandLow(b));
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // hovered cell
      const hover = mouse.inside ? cellAt(mouse.x, mouse.y, now) : null;

      // ---- multiplier grid (future) ----
      ctx.font = "600 11px var(--font-mono, monospace)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const c of columns) {
        if (c.resolved) continue;
        const x0 = xForTime(c.t, now);
        const x1 = xForTime(c.t + COL_INTERVAL_MS, now);
        if (x1 < nowX || x0 > W) continue;
        const cw = x1 - x0;
        const h = (c.t - now) / 1000;
        for (let b = firstBand; b <= lastBand; b++) {
          const yTop = yForPrice(bandLow(b + 1));
          const yBot = yForPrice(bandLow(b));
          const ch = yBot - yTop;
          if (ch < 6) continue;
          const lo = bandLow(b) - price;
          const m = cellMultiplier(lo, lo + step, h, price);
          if (m <= 0) continue; // cell not offered
          const inten = multIntensity(m);
          const isHover = hover && hover.colT === c.t && hover.band === b;
          // cell fill
          const a = 0.04 + inten * 0.5;
          ctx.fillStyle = isHover
            ? "rgba(62,224,127,0.85)"
            : `rgba(62,224,127,${a.toFixed(3)})`;
          roundRect(ctx, x0 + 1.5, yTop + 1.5, cw - 3, ch - 3, 4);
          ctx.fill();
          if (ch > 13 && cw > 26) {
            ctx.fillStyle = isHover ? "#06140c" : `rgba(220,255,235,${(0.45 + inten * 0.5).toFixed(3)})`;
            ctx.fillText(fmtMult(m), (x0 + x1) / 2, (yTop + yBot) / 2);
          }
        }
      }

      // ---- active bet markers ----
      ctx.font = "700 12px var(--font-sans, sans-serif)";
      for (const bt of bets) {
        if (bt.status === "lost") continue;
        const col = columns.find((c) => c.t === bt.colT);
        const live = bt.status === "live" && col && !col.resolved;
        const x0 = xForTime(bt.colT, now);
        const x1 = xForTime(bt.colT + COL_INTERVAL_MS, now);
        if (x1 < 0 || x0 > W) continue;
        const yTop = yForPrice(bandLow(bt.band + 1));
        const yBot = yForPrice(bandLow(bt.band));
        ctx.fillStyle = bt.status === "won" ? "rgba(62,224,127,0.95)" : "rgba(62,224,127,0.22)";
        roundRect(ctx, x0 + 1.5, yTop + 1.5, x1 - x0 - 3, yBot - yTop - 3, 4);
        ctx.fill();
        ctx.strokeStyle = "rgba(62,224,127,0.95)";
        ctx.lineWidth = live ? 1.6 : 1;
        roundRect(ctx, x0 + 1.5, yTop + 1.5, x1 - x0 - 3, yBot - yTop - 3, 4);
        ctx.stroke();
        if (yBot - yTop > 16) {
          ctx.fillStyle = bt.status === "won" ? "#06140c" : "#bfffd9";
          ctx.fillText(money(bt.stake), (x0 + x1) / 2, (yTop + yBot) / 2 - 6);
          ctx.font = "600 10px var(--font-mono, monospace)";
          ctx.fillText(fmtMult(bt.mult), (x0 + x1) / 2, (yTop + yBot) / 2 + 7);
          ctx.font = "700 12px var(--font-sans, sans-serif)";
        }
      }

      // ---- the price line ----
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#3ee07f";
      ctx.shadowColor = "rgba(62,224,127,0.5)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      let started = false;
      for (const pt of history) {
        const x = xForTime(pt.t, now);
        const y = yForPrice(pt.p);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // leading dot
      const lx = xForTime(now, now);
      const ly = yForPrice(price);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(62,224,127,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lx, ly, 7, 0, Math.PI * 2);
      ctx.stroke();

      // now line
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(nowX, plotTop);
      ctx.lineTo(nowX, plotBot());
      ctx.stroke();
      ctx.setLineDash([]);

      // ---- right price axis ----
      ctx.textAlign = "right";
      ctx.font = "500 10px var(--font-mono, monospace)";
      const labelStep = niceStep((range.max - range.min) / 7);
      const startP = Math.ceil(range.min / labelStep) * labelStep;
      ctx.fillStyle = "rgba(140,154,150,0.7)";
      for (let p = startP; p <= range.max; p += labelStep) {
        const y = yForPrice(p);
        ctx.fillText(p.toFixed(2), W - 6, y);
      }
      // current price tag
      const tagY = ly;
      ctx.fillStyle = "#3ee07f";
      roundRect(ctx, W - 70, tagY - 9, 66, 18, 4);
      ctx.fill();
      ctx.fillStyle = "#06140c";
      ctx.font = "700 11px var(--font-mono, monospace)";
      ctx.fillText(price.toFixed(2), W - 8, tagY);

      // ---- floaters ----
      ctx.textAlign = "center";
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        const age = now - f.born;
        if (age > 1500) {
          floaters.splice(i, 1);
          continue;
        }
        const t = age / 1500;
        ctx.globalAlpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
        ctx.fillStyle = f.good ? "#7dffb0" : "#ff5470";
        ctx.font = "800 16px var(--font-sans, sans-serif)";
        ctx.fillText(f.text, f.x, f.y - age * 0.02);
        ctx.globalAlpha = 1;
      }

      // retire fully-faded lost bets
      for (let i = bets.length - 1; i >= 0; i--) {
        if (bets[i].status !== "live" && now - bets[i].bornAt > 6000) bets.splice(i, 1);
      }

      raf = requestAnimationFrame(draw);
    }

    let raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair" />
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return nice * pow;
}
