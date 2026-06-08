"use client";

import { useEffect, useRef } from "react";
import { cellMultiplier, multIntensity, VOL_PER_SQRT_SEC } from "@/lib/grid";
import { mult as fmtMult } from "@/lib/format";

// compact USDC amount for canvas labels
function amt(n: number): string {
  return (n >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.00$/, "")) + " USDC";
}

// ---- engine tuning -------------------------------------------------------
const VIEW_PAST_MS = 64_000;
const VIEW_FUTURE_MS = 46_000;
const NOW_X = 0.5; // "now" line position (0..1)
const COL_INTERVAL_MS = 3_400;
const STEP_PCT = 0.00058;
const MIN_ROWS = 16;
const MAX_ROWS = 24;
const TICK_MS = 80; // denser samples → smoother line
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const MIN_BET_HORIZON = 10; // seconds — cannot bet on columns closer than this

export type BetStatus = "live" | "won" | "lost" | "cancel";

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
type Floater = { x: number; y: number; text: string; born: number; kind: "win" | "cancel" };

// cyan → purple → magenta → hot gold as the multiplier climbs
function cellRGB(t: number): [number, number, number] {
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  if (t < 0.4) {
    const k = t / 0.4;
    return [lerp(0, 157, k), lerp(229, 77, k), lerp(255, 255, k)]; // cyan → purple
  }
  if (t < 0.75) {
    const k = (t - 0.4) / 0.35;
    return [lerp(157, 255, k), lerp(77, 43, k), lerp(255, 214, k)]; // purple → magenta
  }
  const k = (t - 0.75) / 0.25;
  return [255, lerp(43, 220, k), lerp(214, 70, k)]; // magenta → hot gold/orange
}

export default function GameChart({
  bidSize,
  zoom = 1,
  realMode = false,
  ambient = false,
  onPrice,
  onBalanceDelta,
  onBet,
  onZoom,
  onRealTap,
  getBalance,
}: {
  bidSize: number;
  zoom?: number;
  realMode?: boolean;
  ambient?: boolean;
  onPrice: (p: number) => void;
  onBalanceDelta: (d: number) => void;
  onBet: (b: { stake: number; mult: number; status: BetStatus }) => void;
  onZoom?: (factor: number) => void;
  onRealTap?: (mult: number, sx: number, sy: number) => void;
  getBalance: () => number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bidRef = useRef(bidSize);
  bidRef.current = bidSize;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const realModeRef = useRef(realMode);
  realModeRef.current = realMode;
  const ambientRef = useRef(ambient);
  ambientRef.current = ambient;
  const onRealTapRef = useRef(onRealTap);
  onRealTapRef.current = onRealTap;
  const balanceRef = useRef(getBalance);
  balanceRef.current = getBalance;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;

    const anchor = 1673.49;
    const step = anchor * STEP_PCT;
    let price = anchor;
    let renderPrice = anchor; // eased toward `price` every frame for a smooth head
    const history: { t: number; p: number }[] = [{ t: Date.now(), p: price }];
    const columns: Column[] = [];
    const bets: Bet[] = [];
    const floaters: Floater[] = [];
    const effects: { x: number; y: number; kind: "win" | "lose"; born: number }[] = [];
    let nextBetId = 1;
    let range = { min: price - MIN_ROWS * step * 0.5, max: price + MIN_ROWS * step * 0.5 };
    const mouse = { x: -1, y: -1, inside: false };

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

    const bandLow = (b: number) => anchor + b * step;
    const bandCenter = (b: number) => anchor + (b + 0.5) * step;
    const bandForPrice = (p: number) => Math.floor((p - anchor) / step);

    const plotTop = PAD_TOP;
    const plotBot = () => H - PAD_BOTTOM;
    // ambient (home backdrop): push "now" right so the line fills the left, and
    // scroll faster.
    const NW = () => (ambientRef.current ? 0.84 : NOW_X);
    const VP = () => (ambientRef.current ? VIEW_PAST_MS * 0.5 : VIEW_PAST_MS);
    const VF = () => (ambientRef.current ? VIEW_FUTURE_MS * 0.5 : VIEW_FUTURE_MS);
    function xForTime(t: number, now: number) {
      const nowX = W * NW();
      const z = zoomRef.current;
      if (t <= now) return nowX + ((t - now) / (VP() / z)) * nowX;
      return nowX + ((t - now) / (VF() / z)) * (W - nowX);
    }
    function yForPrice(p: number) {
      const bot = plotBot();
      return bot - ((p - range.min) / (range.max - range.min)) * (bot - plotTop);
    }

    // ---- gaussian price walk (same VOL as the multiplier model) ----
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

    // backfill history so the chart is already full of line on first paint —
    // same volatility as the live walk (no flat baseline), and fit the initial
    // range to the backfilled prices so nothing clips off-screen.
    (() => {
      const n0 = Date.now();
      const steps = Math.floor(VIEW_PAST_MS / TICK_MS);
      const back: { t: number; p: number }[] = [];
      let p = anchor;
      let mn = anchor;
      let mx = anchor;
      for (let i = steps; i >= 0; i--) {
        back.push({ t: n0 - i * TICK_MS, p }); // chronological: oldest → newest
        p += p * VOL_PER_SQRT_SEC * Math.sqrt(dt) * gaussian() + (anchor - p) * 0.004;
        mn = Math.min(mn, p);
        mx = Math.max(mx, p);
      }
      history.length = 0;
      for (const b of back) history.push(b);
      price = back[back.length - 1].p;
      renderPrice = price;
      const half = Math.min(Math.max(price - mn, mx - price, (MIN_ROWS * step) / 2) + step * 2, (MAX_ROWS * step) / 2);
      range = { min: price - half, max: price + half };
    })();

    let lastTick = Date.now();
    function stepPrice(now: number) {
      while (now - lastTick >= TICK_MS) {
        lastTick += TICK_MS;
        const vol = VOL_PER_SQRT_SEC * (ambientRef.current ? 2.4 : 1);
        price += price * vol * Math.sqrt(dt) * gaussian() + (anchor - price) * 0.0006;
        history.push({ t: lastTick, p: price });
        onPrice(price);
      }
      const cutoff = now - VP() - 2000;
      while (history.length > 2 && history[0].t < cutoff) history.shift();
    }

    function ensureColumns(now: number) {
      if (columns.length === 0) {
        const first = Math.ceil((now + 4000) / COL_INTERVAL_MS) * COL_INTERVAL_MS;
        columns.push({ t: first, resolved: false, winRow: 0, winPrice: 0 });
      }
      const lastT = columns[columns.length - 1].t;
      const horizon = now + VF() + COL_INTERVAL_MS;
      for (let t = lastT + COL_INTERVAL_MS; t <= horizon; t += COL_INTERVAL_MS) {
        columns.push({ t, resolved: false, winRow: 0, winPrice: 0 });
      }
      for (const c of columns) {
        if (!c.resolved && now >= c.t) {
          c.resolved = true;
          c.winPrice = price;
          c.winRow = bandForPrice(price);
          settleColumn(c, now);
        }
      }
      while (columns.length && columns[0].t < now - 8000) columns.shift();
    }

    function settleColumn(c: Column, now: number) {
      for (const b of bets) {
        if (b.status !== "live" || b.colT !== c.t) continue;
        const ex = xForTime(c.t, now);
        const ey = yForPrice(bandCenter(b.band));
        if (b.band === c.winRow) {
          b.status = "won";
          const payout = b.stake * b.mult;
          onBalanceDelta(payout);
          onBet({ stake: b.stake, mult: b.mult, status: "won" });
          floaters.push({ x: ex, y: ey, text: "+" + amt(payout), born: now, kind: "win" });
          effects.push({ x: ex, y: ey, kind: "win", born: now });
        } else {
          b.status = "lost";
          onBet({ stake: b.stake, mult: b.mult, status: "lost" });
          effects.push({ x: ex, y: ey, kind: "lose", born: now });
        }
      }
    }

    function cellAt(px: number, py: number, now: number): { colT: number; band: number } | null {
      const nowX = W * NW();
      if (px < nowX) return null;
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

    function handleClick(px: number, py: number) {
      const now = Date.now();
      const cell = cellAt(px, py, now);
      if (!cell) return;

      // REAL mode: instant on-chain bet on the tapped cell's multiplier
      if (realModeRef.current) {
        const h = (cell.colT - now) / 1000;
        if (h < MIN_BET_HORIZON) return;
        const lo = bandLow(cell.band) - price;
        const m = cellMultiplier(lo, lo + step, h, price);
        if (m <= 0) return;
        onRealTapRef.current?.(m, px, py);
        return;
      }

      // toggle-cancel an existing live bet on this cell
      const existing = bets.find((b) => b.status === "live" && b.colT === cell.colT && b.band === cell.band);
      if (existing) {
        existing.status = "lost"; // mark inactive; will be culled
        existing.bornAt = -1; // cull immediately
        bets.splice(bets.indexOf(existing), 1);
        onBalanceDelta(existing.stake);
        onBet({ stake: existing.stake, mult: existing.mult, status: "cancel" });
        floaters.push({ x: xForTime(cell.colT, now), y: yForPrice(bandCenter(cell.band)), text: "CANCEL", born: now, kind: "cancel" });
        return;
      }

      // place a new bet — only ≥ MIN_BET_HORIZON seconds out, on an offered cell
      const h = (cell.colT - now) / 1000;
      if (h < MIN_BET_HORIZON) return;
      const lo = bandLow(cell.band) - price;
      const m = cellMultiplier(lo, lo + step, h, price);
      if (m <= 0) return;
      const stake = bidRef.current;
      if (stake <= 0 || balanceRef.current() < stake) return;
      bets.push({ id: nextBetId++, colT: cell.colT, band: cell.band, stake, mult: m, status: "live", bornAt: now });
      onBalanceDelta(-stake);
      onBet({ stake, mult: m, status: "live" });
    }

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
      handleClick(e.clientX - r.left, e.clientY - r.top);
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      onZoomRef.current?.(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    function updateRange(now: number) {
      let lo = price;
      let hi = price;
      for (const h of history) {
        if (h.t < now - VP()) continue;
        if (h.p < lo) lo = h.p;
        if (h.p > hi) hi = h.p;
      }
      // keep the CURRENT price pinned to the vertical centre (don't drift with
      // trend); half-height tracks recent volatility, clamped + zoomed.
      const center = renderPrice;
      const z = zoomRef.current;
      const half = Math.min(Math.max((hi - lo) / 2 + step * 2, (MIN_ROWS * step) / 2), (MAX_ROWS * step) / 2) / z;
      range.min += (center - half - range.min) * 0.1;
      range.max += (center + half - range.max) * 0.1;
    }

    function draw() {
      const now = Date.now();
      stepPrice(now);
      ensureColumns(now);
      updateRange(now);
      renderPrice += (price - renderPrice) * 0.16; // smooth the leading edge

      ctx.clearRect(0, 0, W, H);
      const nowX = W * NW();
      const lockX = xForTime(now + MIN_BET_HORIZON * 1000, now);
      const firstBand = bandForPrice(range.min) - 1;
      const lastBand = bandForPrice(range.max) + 1;

      const hover = mouse.inside ? cellAt(mouse.x, mouse.y, now) : null;

      // ---- multiplier grid ----
      ctx.font = "600 11px var(--font-mono, monospace)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const c of columns) {
        if (c.resolved) continue;
        const h = (c.t - now) / 1000;
        if (h < MIN_BET_HORIZON) continue; // locked zone drawn separately
        const x0 = xForTime(c.t, now);
        const x1 = xForTime(c.t + COL_INTERVAL_MS, now);
        if (x1 < nowX || x0 > W) continue;
        const cw = x1 - x0;
        for (let b = firstBand; b <= lastBand; b++) {
          const yTop = yForPrice(bandLow(b + 1));
          const yBot = yForPrice(bandLow(b));
          const ch = yBot - yTop;
          if (ch < 6) continue;
          const lo = bandLow(b) - price;
          const m = cellMultiplier(lo, lo + step, h, price);
          if (m <= 0) continue;
          const inten = multIntensity(m);
          const [r, g, bl] = cellRGB(inten);
          const isHover = hover && hover.colT === c.t && hover.band === b;
          const a = 0.06 + inten * 0.6;
          // high-multiplier cells glow + faintly pulse — the bigger the hotter
          const glow = inten > 0.55;
          if (glow) {
            ctx.shadowColor = `rgba(${r},${g},${bl},0.9)`;
            ctx.shadowBlur = (4 + inten * 14) * (0.85 + 0.15 * Math.sin(now / 240 + b));
          }
          ctx.fillStyle = isHover ? `rgba(${r},${g},${bl},0.95)` : `rgba(${r},${g},${bl},${a.toFixed(3)})`;
          roundRect(ctx, x0 + 1.5, yTop + 1.5, cw - 3, ch - 3, 3);
          ctx.fill();
          ctx.shadowBlur = 0;
          const hot = inten > 0.7;
          ctx.strokeStyle = isHover ? "#ffffff" : `rgba(${r},${g},${bl},${(0.3 + inten * 0.65).toFixed(3)})`;
          ctx.lineWidth = hot ? 2 : glow ? 1.4 : 1;
          ctx.stroke();
          // multiplier label — scales with the cell, big payouts get loud
          if (ch > 11 && cw > 20) {
            const fs = Math.max(9, Math.min(ch * 0.5, cw * 0.42, 30));
            const mx = (x0 + x1) / 2;
            const my = (yTop + yBot) / 2;
            ctx.font = `${hot ? 900 : inten > 0.4 ? 700 : 600} ${fs.toFixed(0)}px ${hot ? "var(--font-display, sans-serif)" : "var(--font-mono, monospace)"}`;
            if (hot && !isHover) {
              // dark outline so the bright number pops, + glow
              ctx.lineWidth = Math.max(2, fs * 0.14);
              ctx.strokeStyle = "rgba(6,6,14,0.85)";
              ctx.strokeText(fmtMult(m), mx, my);
              ctx.shadowColor = `rgba(${r},${g},${bl},0.95)`;
              ctx.shadowBlur = 8 + inten * 10;
            }
            ctx.fillStyle = isHover ? "#06060e" : hot ? `rgb(255,${Math.round(245 - inten * 30)},${Math.round(210 - inten * 120)})` : `rgba(233,243,255,${(0.5 + inten * 0.5).toFixed(3)})`;
            ctx.fillText(fmtMult(m), mx, my);
            ctx.shadowBlur = 0;
            ctx.font = "600 11px var(--font-mono, monospace)";
          }
        }
      }

      // ---- locked zone (< MIN_BET_HORIZON s) — full neon spectacle ----
      if (lockX > nowX && !ambientRef.current) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 280);
        const ph = (now / 16) % 16;
        const top = plotTop;
        const bot = plotBot();
        const m = 7;
        const zx0 = nowX + m;
        const zx1 = lockX - m;
        const cx = (nowX + lockX) / 2;
        const PAL = [[0, 229, 255], [255, 43, 214], [57, 255, 20], [255, 210, 63], [157, 77, 255]];
        const colAt = (k: number) => PAL[((Math.floor(k) % PAL.length) + PAL.length) % PAL.length];
        const rgb = (c: number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

        ctx.save();
        ctx.beginPath();
        ctx.rect(zx0, top, zx1 - zx0, bot - top);
        ctx.clip();
        // shifting cyan↔magenta gradient fill
        const a = 0.5 + 0.5 * Math.sin(now / 600);
        const grad = ctx.createLinearGradient(zx0, top, zx1, bot);
        grad.addColorStop(0, `rgba(0,229,255,${(0.06 + 0.07 * a).toFixed(3)})`);
        grad.addColorStop(0.5, "rgba(14,6,22,0.6)");
        grad.addColorStop(1, `rgba(255,43,214,${(0.06 + 0.07 * (1 - a)).toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(zx0, top, zx1 - zx0, bot - top);
        // fast multi-colour diagonal sheen stripes
        ctx.lineWidth = 3;
        for (let x = zx0 - 90 + ph; x < zx1 + 90; x += 16) {
          ctx.strokeStyle = rgb(colAt(x / 16), 0.07 + pulse * 0.1);
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x + 90, bot);
          ctx.stroke();
        }
        // vertical sweeping highlight
        const sweepY = top + ((now / 11) % (bot - top));
        const sg = ctx.createLinearGradient(0, sweepY - 44, 0, sweepY + 44);
        sg.addColorStop(0, "rgba(255,255,255,0)");
        sg.addColorStop(0.5, "rgba(255,255,255,0.12)");
        sg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(zx0, sweepY - 44, zx1 - zx0, 88);
        ctx.restore();

        // double pulsing colour-cycling frame
        for (const [w, blur, al] of [[3, 18, 0.5], [1.5, 8, 0.9]]) {
          const fc = colAt(now / 300);
          ctx.strokeStyle = rgb(fc, al * (0.6 + pulse * 0.4));
          ctx.shadowColor = rgb(fc, 0.9);
          ctx.shadowBlur = blur + pulse * 12;
          ctx.lineWidth = w;
          roundRect(ctx, zx0, top + m, zx1 - zx0, bot - top - 2 * m, 8);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // big vertical "LOCKED" — letters cycle through neon colours
        const letters = "LOCKED".split("");
        const lh = Math.min(60, (bot - top - 3 * m) / (letters.length + 1));
        const startY = (top + bot) / 2 - (letters.length * lh) / 2;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `900 ${Math.round(lh * 0.92)}px var(--font-display, sans-serif)`;
        letters.forEach((ch, i) => {
          const c = colAt(i + now / 280);
          ctx.shadowColor = rgb(c, 1);
          ctx.shadowBlur = 18 + pulse * 18;
          ctx.lineWidth = Math.max(2, lh * 0.06);
          ctx.strokeStyle = "rgba(6,6,14,0.6)";
          ctx.strokeText(ch, cx, startY + i * lh);
          ctx.fillStyle = rgb(c);
          ctx.fillText(ch, cx, startY + i * lh);
        });
        ctx.shadowBlur = 0;
        ctx.font = `800 ${Math.round(lh * 0.34)}px var(--font-display, sans-serif)`;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText("TOO LATE", cx, startY + letters.length * lh + lh * 0.15);
      }

      // ---- active bet markers ----
      ctx.font = "700 12px var(--font-display, sans-serif)";
      for (const bt of bets) {
        if (bt.status === "lost") continue;
        const x0 = xForTime(bt.colT, now);
        const x1 = xForTime(bt.colT + COL_INTERVAL_MS, now);
        if (x1 < 0 || x0 > W) continue;
        const yTop = yForPrice(bandLow(bt.band + 1));
        const yBot = yForPrice(bandLow(bt.band));
        const won = bt.status === "won";
        ctx.fillStyle = won ? "rgba(57,255,20,0.92)" : "rgba(255,210,63,0.18)";
        roundRect(ctx, x0 + 1.5, yTop + 1.5, x1 - x0 - 3, yBot - yTop - 3, 3);
        ctx.fill();
        ctx.strokeStyle = won ? "#39ff14" : "#ffd23f";
        ctx.shadowColor = won ? "rgba(57,255,20,0.8)" : "rgba(255,210,63,0.7)";
        ctx.shadowBlur = 10;
        ctx.lineWidth = 1.8;
        roundRect(ctx, x0 + 1.5, yTop + 1.5, x1 - x0 - 3, yBot - yTop - 3, 3);
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (yBot - yTop > 16) {
          ctx.fillStyle = won ? "#06060e" : "#ffe27a";
          ctx.fillText(amt(bt.stake), (x0 + x1) / 2, (yTop + yBot) / 2 - 6);
          ctx.font = "600 10px var(--font-mono, monospace)";
          ctx.fillText(fmtMult(bt.mult), (x0 + x1) / 2, (yTop + yBot) / 2 + 7);
          ctx.font = "700 12px var(--font-display, sans-serif)";
        }
      }

      // ---- price line (neon green, Catmull-Rom-ish smoothing) ----
      const lx = xForTime(now, now);
      const ly = yForPrice(renderPrice);
      const pts: { x: number; y: number }[] = [];
      for (const pt of history) pts.push({ x: xForTime(pt.t, now), y: yForPrice(pt.p) });
      pts.push({ x: lx, y: ly }); // smoothed leading edge
      const amb = ambientRef.current;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const tracePath = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      };
      if (pts.length >= 2) {
        if (amb) {
          // bloom pass (wide, soft) then a bright animated core
          ctx.strokeStyle = "rgba(57,255,20,0.16)";
          ctx.lineWidth = 9;
          ctx.shadowColor = "rgba(57,255,20,0.9)";
          ctx.shadowBlur = 26;
          tracePath();
          ctx.stroke();
          ctx.strokeStyle = `rgba(160,255,120,${(0.9 + 0.1 * Math.sin(now / 120)).toFixed(2)})`;
          ctx.lineWidth = 3;
          ctx.shadowBlur = 18;
          tracePath();
          ctx.stroke();
        } else {
          ctx.strokeStyle = "#39ff14";
          ctx.shadowColor = "rgba(57,255,20,0.7)";
          ctx.shadowBlur = 12;
          ctx.lineWidth = 2.2;
          tracePath();
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
      const pulse = 6 + 3 * Math.sin(now / 220);
      ctx.strokeStyle = "rgba(57,255,20,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(lx, ly, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#eafff0";
      ctx.shadowColor = "rgba(57,255,20,0.9)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // now line
      ctx.strokeStyle = "rgba(0,229,255,0.18)";
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(nowX, plotTop);
      ctx.lineTo(nowX, plotBot());
      ctx.stroke();
      ctx.setLineDash([]);

      // ---- right price axis ----
      ctx.textAlign = "right";
      ctx.font = "500 10px var(--font-mono, monospace)";
      const labelStep = niceStep((range.max - range.min) / 7);
      ctx.fillStyle = "rgba(139,147,184,0.7)";
      for (let p = Math.ceil(range.min / labelStep) * labelStep; p <= range.max; p += labelStep) {
        ctx.fillText(p.toFixed(2), W - 6, yForPrice(p));
      }
      // current price tag
      ctx.fillStyle = "#39ff14";
      ctx.shadowColor = "rgba(57,255,20,0.6)";
      ctx.shadowBlur = 10;
      roundRect(ctx, W - 72, ly - 9, 68, 18, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#06060e";
      ctx.font = "700 11px var(--font-mono, monospace)";
      ctx.fillText(price.toFixed(2), W - 8, ly);

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
        ctx.fillStyle = f.kind === "win" ? "#7dffb0" : "#9aa3c8";
        ctx.shadowColor = f.kind === "win" ? "rgba(57,255,20,0.8)" : "transparent";
        ctx.shadowBlur = f.kind === "win" ? 14 : 0;
        ctx.font = "800 16px var(--font-display, sans-serif)";
        ctx.fillText(f.text, f.x, f.y - age * 0.02);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      // ---- win ○ / lose ✕ neon effects — small but flashy ----
      for (let i = effects.length - 1; i >= 0; i--) {
        const ef = effects[i];
        const age = now - ef.born;
        if (age > 900) {
          effects.splice(i, 1);
          continue;
        }
        const t = age / 900;
        const grow = t < 0.22 ? t / 0.22 : 1; // snappy pop
        const ease = 1 - Math.pow(1 - grow, 3);
        const s = 13 * ease; // small core
        const col = ef.kind === "win" ? "#39ff14" : "#ff2bd6";
        ctx.save();
        ctx.translate(ef.x, ef.y);
        ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;

        // radiating spark rays (the "flash")
        const rays = 8;
        const rayLen = 10 + ease * 16 + t * 8;
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 1.6;
        for (let k = 0; k < rays; k++) {
          const a = (k / rays) * Math.PI * 2 + t * 1.2;
          const r0 = s + 3;
          ctx.globalAlpha = (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4) * 0.8;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a) * (r0 + rayLen), Math.sin(a) * (r0 + rayLen));
          ctx.stroke();
        }
        // expanding shock ring
        ctx.globalAlpha = (1 - t) * 0.6;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, s + 4 + t * 22, 0, Math.PI * 2);
        ctx.stroke();

        // core mark
        ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        ctx.lineWidth = 2.6;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        if (ef.kind === "win") {
          ctx.arc(0, 0, s, 0, Math.PI * 2);
        } else {
          ctx.moveTo(-s * 0.7, -s * 0.7);
          ctx.lineTo(s * 0.7, s * 0.7);
          ctx.moveTo(s * 0.7, -s * 0.7);
          ctx.lineTo(-s * 0.7, s * 0.7);
        }
        ctx.stroke();
        ctx.restore();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

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
      canvas.removeEventListener("wheel", onWheel);
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
