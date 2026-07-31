"use client";

import { useEffect, useRef } from "react";
import { cellMultiplierAt, multIntensity, bandStepAt } from "@/lib/grid";
import { MARKETS, type MarketId } from "@/lib/markets";
import { COL_INTERVAL_MS, MIN_BET_HORIZON_SEC } from "@/lib/tap";
import { mult as fmtMult } from "@/lib/format";

// compact amount for canvas labels (unit defaults to USDC; tKRW in REAL mode)
function amt(n: number, unit = "USDC"): string {
  return (n >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.00$/, "")) + " " + unit;
}

// ---- engine tuning -------------------------------------------------------
const VIEW_PAST_MS = 64_000;
const VIEW_FUTURE_MS = 46_000;
const NOW_X = 0.5; // "now" line position (0..1)
const MIN_ROWS = 16;
const MAX_ROWS = 24;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const STALE_SETTLE_MS = 6_000; // no fresh tick by settlement → void, don't guess
const GRID_REBASE_TOLERANCE = 0.15; // re-size bands once vol has moved this much
const PRICE_REPORT_MS = 100; // throttle for the onPrice callback
const MIN_POINT_PX = 0.6; // decimate the tick line to roughly one point per pixel
const H_REF_SEC = 28; // horizon the band height is sized at (matches lib/grid)
const PRICE_MODEL_MS = 120; // how often the multiplier ladder is repriced (not per frame)
const AMBIENT_FRAME_MS = 50; // backdrop charts draw at ~20fps, not the display rate

export type BetStatus = "live" | "won" | "lost" | "cancel";

type Column = { t: number; resolved: boolean; winRow: number; winPrice: number; void: boolean };
type Bet = {
  id: number;
  colT: number;
  band: number;
  stake: number;
  mult: number;
  status: "live" | "won" | "lost";
  bornAt: number;
  /** set once the server has accepted the position; it then owns the outcome */
  serverId?: string;
  /** true while the place request is still in flight */
  pending?: boolean;
};

/** A cell the player wants: a settlement time and an absolute price band. */
export type PlacedBet = { colT: number; lo: number; hi: number; stake: number };
export type PlaceResult = { id: string; mult: number } | null;
export type Settlement = { id: string; status: "won" | "lost" | "void"; payout: number };
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

/**
 * The Tap Trading chart, drawn from real BTC/USD trades.
 *
 * The line is the exchange tick series verbatim — no smoothing of the price
 * itself, no synthetic backfill, no random walk. Two consequences fall out of
 * that and are load-bearing:
 *
 *  · Odds come from *measured* volatility. The band geometry and every
 *    multiplier are derived from the realized vol of the same ticks being
 *    plotted, so the 7% edge holds against the real price process.
 *  · When the feed is not trustworthy the game stops. No quotes while the
 *    price is stale or the vol estimate is cold, and a column that comes due
 *    without a fresh tick voids its bets and refunds them instead of settling
 *    on a price we can't stand behind.
 *
 * In REAL mode the chart stops being the referee. A tap is sent to the server,
 * which prices the cell from its own market read and settles it against the
 * exchange's published price — so what's drawn here is a view of the server's
 * positions, not the source of truth for them. DEMO mode keeps settling
 * locally, since there is no money to protect.
 */
export default function GameChart({
  bidSize,
  zoom = 1,
  market = "btc",
  realMode = false,
  ambient = false,
  unit = "USDC",
  onPrice,
  onBalanceDelta,
  onBet,
  onZoom,
  onGrid,
  placeServerBet,
  drainSettlements,
  getBalance,
}: {
  bidSize: number;
  zoom?: number;
  /** Which market to draw and price against. */
  market?: MarketId;
  realMode?: boolean;
  ambient?: boolean;
  unit?: string;
  onPrice: (p: number) => void;
  onBalanceDelta: (d: number) => void;
  onBet: (b: { stake: number; mult: number; status: BetStatus }) => void;
  onZoom?: (factor: number) => void;
  /** Reports the live band height so the UI can show what a cell is worth. */
  onGrid?: (g: { step: number }) => void;
  /** REAL mode: open a position server-side. Resolves null if it was rejected. */
  placeServerBet?: (b: PlacedBet) => Promise<PlaceResult>;
  /** REAL mode: collect outcomes the server has decided since the last call. */
  drainSettlements?: () => Settlement[];
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
  const onGridRef = useRef(onGrid);
  onGridRef.current = onGrid;
  const marketRef = useRef(market);
  marketRef.current = market;
  const realModeRef = useRef(realMode);
  realModeRef.current = realMode;
  const ambientRef = useRef(ambient);
  ambientRef.current = ambient;
  const placeServerBetRef = useRef(placeServerBet);
  placeServerBetRef.current = placeServerBet;
  const drainSettlementsRef = useRef(drainSettlements);
  drainSettlementsRef.current = drainSettlements;
  const unitRef = useRef(unit);
  unitRef.current = unit;
  const balanceRef = useRef(getBalance);
  balanceRef.current = getBalance;
  const onPriceRef = useRef(onPrice);
  onPriceRef.current = onPrice;
  const onBetRef = useRef(onBet);
  onBetRef.current = onBet;
  const onBalanceDeltaRef = useRef(onBalanceDelta);
  onBalanceDeltaRef.current = onBalanceDelta;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;

    // Keep the active market running. The render loop reads it directly rather
    // than through React, so ticks never cost a re-render.
    let stopMarket = MARKETS[marketRef.current].start();
    let runningMarket = marketRef.current;

    // Grid geometry. Bands are absolute price levels: a cell you are looking at
    // is a real price range, and it stays put while a bet on it is live.
    let anchor = 0;
    let step = 0;
    const columns: Column[] = [];
    const bets: Bet[] = [];
    const floaters: Floater[] = [];
    const effects: { x: number; y: number; kind: "win" | "lose"; born: number }[] = [];
    let nextBetId = 1;
    let range: { min: number; max: number } | null = null;
    let lastReport = 0;
    const mouse = { x: -1, y: -1, inside: false };
    // Per-column sigma and per-band multipliers, recomputed on PRICE_MODEL_MS
    // rather than per frame. Cleared whenever it goes stale or the band height
    // changes; nothing here alters what a cell pays, only how often the same
    // number is derived.
    const gridModel = new Map<number, { sigma: number | null; m: Map<number, number> }>();
    let gridModelAt = 0;
    let gridModelStep = 0;
    let lastAmbientFrame = 0;

    // Canvas cannot resolve CSS custom properties in ctx.font — "11px
    // var(--font-mono)" is an invalid font string, so every one of those
    // assignments was silently discarded and the canvas kept whatever font it
    // had. Resolve the real families once, from the element the variables are
    // actually defined on.
    const cs = getComputedStyle(document.documentElement);
    const FONT_MONO = (cs.getPropertyValue("--font-mono").trim() || "monospace") + ", monospace";
    const FONT_DISPLAY = (cs.getPropertyValue("--font-display").trim() || "sans-serif") + ", sans-serif";

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
    // show a shorter window so the movement reads at a glance.
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
      const r = range!;
      return bot - ((p - r.min) / (r.max - r.min)) * (bot - plotTop);
    }

    // Size the bands to current realized volatility. Only ever re-sized while
    // no bet is live, so a resting position never has the ground moved under it.
    function ensureGrid(price: number, sigmaRef: number) {
      const target = bandStepAt(sigmaRef);
      if (!step) {
        step = target;
        anchor = Math.round(price / step) * step;
        return;
      }
      if (bets.some((b) => b.status === "live")) return;
      if (Math.abs(target / step - 1) < GRID_REBASE_TOLERANCE) return;
      step = target;
      anchor = Math.round(price / step) * step;
    }

    function ensureColumns(now: number, price: number, fresh: boolean) {
      if (columns.length === 0) {
        const first = Math.ceil((now + 4000) / COL_INTERVAL_MS) * COL_INTERVAL_MS;
        columns.push({ t: first, resolved: false, winRow: 0, winPrice: 0, void: false });
      }
      const lastT = columns[columns.length - 1].t;
      const horizon = now + VF() + COL_INTERVAL_MS;
      for (let t = lastT + COL_INTERVAL_MS; t <= horizon; t += COL_INTERVAL_MS) {
        columns.push({ t, resolved: false, winRow: 0, winPrice: 0, void: false });
      }
      for (const c of columns) {
        if (!c.resolved && now >= c.t) {
          c.resolved = true;
          // Settling needs a price we can defend. Without a fresh tick the
          // honest move is to hand the stake back, not to invent an outcome.
          if (!fresh) {
            c.void = true;
            voidColumn(c, now);
            continue;
          }
          c.winPrice = price;
          c.winRow = bandForPrice(price);
          settleColumn(c, now);
        }
      }
      while (columns.length && columns[0].t < now - 8000) columns.shift();
    }

    /** Server-owned positions are settled by the server, never by this loop. */
    const localOnly = (b: Bet) => !b.serverId && !b.pending;

    function voidColumn(c: Column, now: number) {
      for (const b of bets) {
        if (b.status !== "live" || b.colT !== c.t || !localOnly(b)) continue;
        b.status = "lost"; // marks it inactive; the refund is issued below
        b.bornAt = -1;
        onBalanceDeltaRef.current(b.stake);
        onBetRef.current({ stake: b.stake, mult: b.mult, status: "cancel" });
        floaters.push({
          x: xForTime(c.t, now),
          y: range ? yForPrice(bandCenter(b.band)) : H / 2,
          text: "VOID · REFUND",
          born: now,
          kind: "cancel",
        });
      }
    }

    function settleColumn(c: Column, now: number) {
      for (const b of bets) {
        if (b.status !== "live" || b.colT !== c.t || !localOnly(b)) continue;
        const ex = xForTime(c.t, now);
        const ey = yForPrice(bandCenter(b.band));
        if (b.band === c.winRow) {
          b.status = "won";
          const payout = b.stake * b.mult;
          onBalanceDeltaRef.current(payout);
          onBetRef.current({ stake: b.stake, mult: b.mult, status: "won" });
          floaters.push({ x: ex, y: ey, text: "+" + amt(payout, unitRef.current), born: now, kind: "win" });
          effects.push({ x: ex, y: ey, kind: "win", born: now });
        } else {
          b.status = "lost";
          onBetRef.current({ stake: b.stake, mult: b.mult, status: "lost" });
          effects.push({ x: ex, y: ey, kind: "lose", born: now });
        }
      }
    }

    function cellAt(px: number, py: number, now: number): { colT: number; band: number } | null {
      if (!step || !range) return null;
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
      const mk = MARKETS[marketRef.current];
      const snap = mk.snapshot();
      // No quotes unless the market can price itself — an uncertain price is
      // not something to take money against.
      if (!snap.quotable || snap.price === null || ambientRef.current) return;
      const price = snap.price;
      const now = Date.now();
      const cell = cellAt(px, py, now);
      if (!cell) return;

      // REAL mode: the server prices and owns the position. We draw a pending
      // marker straight away so the tap feels instant, then either promote it
      // on acceptance or drop it — the quote shown is whatever the server
      // actually gave us, never the one we guessed locally.
      if (realModeRef.current) {
        const place = placeServerBetRef.current;
        if (!place) return;
        const h = (cell.colT - now) / 1000;
        if (h < MIN_BET_HORIZON_SEC) return;
        const loAbs = bandLow(cell.band);
        const hiAbs = loAbs + step;
        const sig = mk.sigma(price, now, cell.colT);
        if (sig === null) return;
        const m = cellMultiplierAt(loAbs - price, hiAbs - price, sig);
        if (m <= 0) return;
        const stake = bidRef.current;
        if (stake <= 0 || balanceRef.current() < stake) return;
        if (bets.some((b) => b.status === "live" && b.colT === cell.colT && b.band === cell.band)) return;

        const bet: Bet = { id: nextBetId++, colT: cell.colT, band: cell.band, stake, mult: m, status: "live", bornAt: now, pending: true };
        bets.push(bet);
        place({ colT: cell.colT, lo: loAbs, hi: hiAbs, stake })
          .then((res) => {
            const i = bets.indexOf(bet);
            if (!res) {
              if (i >= 0) bets.splice(i, 1);
              return;
            }
            bet.pending = false;
            bet.serverId = res.id;
            bet.mult = res.mult; // the server's quote wins, not ours
            onBetRef.current({ stake: bet.stake, mult: res.mult, status: "live" });
          })
          .catch(() => {
            const i = bets.indexOf(bet);
            if (i >= 0) bets.splice(i, 1);
          });
        return;
      }

      // A placed bet stands. Re-tapping a cell used to refund it in full, with
      // no restriction on when — so you could rest a bet 46s out, watch 36s of
      // price, and take the stake back whenever it was heading the wrong way.
      // Keeping the winners and cancelling the losers is a free option worth
      // more than the house edge. REAL mode has no cancel either (there is no
      // such endpoint), so this also stops DEMO teaching a mechanic the real
      // game doesn't have.
      if (bets.some((b) => b.status === "live" && b.colT === cell.colT && b.band === cell.band)) return;

      // place a new bet — only ≥ MIN_BET_HORIZON_SEC seconds out, on an offered cell
      const h = (cell.colT - now) / 1000;
      if (h < MIN_BET_HORIZON_SEC) return;
      const sigma = mk.sigma(price, now, cell.colT);
      if (sigma === null) return;
      const lo = bandLow(cell.band) - price;
      const m = cellMultiplierAt(lo, lo + step, sigma);
      if (m <= 0) return;
      const stake = bidRef.current;
      if (stake <= 0 || balanceRef.current() < stake) return;
      bets.push({ id: nextBetId++, colT: cell.colT, band: cell.band, stake, mult: m, status: "live", bornAt: now });
      onBalanceDeltaRef.current(-stake);
      onBetRef.current({ stake, mult: m, status: "live" });
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

    // Viewport only: the vertical window eases, the price never does. The axis
    // labels move with it, so nothing about the price is misrepresented.
    function updateRange(view: { t: number; p: number }[], price: number) {
      let lo = price;
      let hi = price;
      for (const h of view) {
        if (h.p < lo) lo = h.p;
        if (h.p > hi) hi = h.p;
      }
      const z = zoomRef.current;
      const half = Math.min(Math.max((hi - lo) / 2 + step * 2, (MIN_ROWS * step) / 2), (MAX_ROWS * step) / 2) / z;
      if (!range) {
        range = { min: price - half, max: price + half };
        return;
      }
      range.min += (price - half - range.min) * 0.1;
      range.max += (price + half - range.max) * 0.1;
    }

    // REAL mode: fold in the outcomes the server has decided. The chart only
    // renders them — it has no say in what they are.
    function applyServerSettlements(now: number) {
      const results = drainSettlementsRef.current?.();
      if (!results?.length || !range) return;
      for (const r of results) {
        const b = bets.find((x) => x.serverId === r.id && x.status === "live");
        if (!b) continue;
        const ex = xForTime(b.colT, now);
        const ey = yForPrice(bandCenter(b.band));
        if (r.status === "void") {
          b.status = "lost";
          b.bornAt = -1;
          onBetRef.current({ stake: b.stake, mult: b.mult, status: "cancel" });
          floaters.push({ x: ex, y: ey, text: "VOID · REFUND", born: now, kind: "cancel" });
          continue;
        }
        const won = r.status === "won";
        b.status = won ? "won" : "lost";
        onBetRef.current({ stake: b.stake, mult: b.mult, status: won ? "won" : "lost" });
        effects.push({ x: ex, y: ey, kind: won ? "win" : "lose", born: now });
        if (won) floaters.push({ x: ex, y: ey, text: "+" + amt(r.payout, unitRef.current), born: now, kind: "win" });
      }
    }

    function drawNotice(text: string, sub: string) {
      ctx.clearRect(0, 0, W, H);
      if (ambientRef.current) return;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(139,147,184,0.85)";
      ctx.font = `600 13px ${FONT_MONO}`;
      ctx.fillText(text, W / 2, H / 2 - 10);
      ctx.fillStyle = "rgba(139,147,184,0.5)";
      ctx.font = `500 11px ${FONT_MONO}`;
      ctx.fillText(sub, W / 2, H / 2 + 12);
    }

    function draw() {
      raf = requestAnimationFrame(draw);
      const now = Date.now();
      // Decoration does not need every vsync. Interactive charts still draw at
      // the display's rate; the hub backdrop settles for a third of it.
      if (ambientRef.current) {
        if (now - lastAmbientFrame < AMBIENT_FRAME_MS) return;
        lastAmbientFrame = now;
      }
      // Swap markets without remounting: stop the old one, start the new, and
      // drop the grid so it re-sizes to the new price scale.
      if (runningMarket !== marketRef.current) {
        stopMarket();
        runningMarket = marketRef.current;
        stopMarket = MARKETS[runningMarket].start();
        step = 0;
        anchor = 0;
        range = null;
        columns.length = 0;
        bets.length = 0;
      }
      const mk = MARKETS[runningMarket];
      const snap = mk.snapshot();
      const price = snap.price;

      if (price === null) {
        drawNotice(
          snap.reason === "stale" ? "FEED UNREACHABLE" : "CONNECTING TO THE MARKET…",
          snap.reason === "stale" ? "no exchange reachable from this network" : "waiting for the first real trade"
        );
        return;
      }

      const fresh = snap.fresh;
      const quotable = snap.quotable;
      // σ at the reference horizon sets the band height. Before a market can
      // price itself we still need *some* geometry to draw on, so fall back to
      // the last known step and simply refuse to quote.
      const sigmaRef = mk.sigma(price, now, now + H_REF_SEC * 1000);
      if (sigmaRef !== null) ensureGrid(price, sigmaRef);
      if (!step) {
        drawNotice("MEASURING THE MARKET…", "no volatility estimate yet");
        return;
      }

      const src = snap.ticks;
      const from = now - VP() - 2000;
      const view: { t: number; p: number }[] = [];
      for (let i = src.length - 1; i >= 0; i--) {
        if (src[i].t < from) break;
        view.push(src[i]);
      }
      view.reverse();
      if (!view.length) view.push({ t: now, p: price });

      updateRange(view, price);
      ensureColumns(now, price, fresh);
      applyServerSettlements(now);

      if (now - lastReport > PRICE_REPORT_MS) {
        lastReport = now;
        onPriceRef.current(price);
        onGridRef.current?.({ step });
      }

      ctx.clearRect(0, 0, W, H);
      const nowX = W * NW();
      const firstBand = bandForPrice(range!.min) - 1;
      const lastBand = bandForPrice(range!.max) + 1;

      const hover = mouse.inside && quotable ? cellAt(mouse.x, mouse.y, now) : null;

      // ---- multiplier grid ----
      // Only drawn when we can actually honour it. A grid of numbers we would
      // refuse to take a bet on is worse than no grid.
      // Ambient is a backdrop behind two scrims at 60% opacity — the ladder is
      // unreadable there, and it is the single most expensive thing on the
      // canvas. The hub was paying for a board nobody could see.
      if (quotable && !ambientRef.current) {
        ctx.font = `600 11px ${FONT_MONO}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // The ladder is repriced on PRICE_MODEL_MS, not per frame. Drawing still
        // happens every frame so the board scrolls smoothly, but sigma and the
        // multipliers only move on human timescales — recomputing them 60x/s was
        // ~15,000 erf evaluations and, on VOLT, ~195,000 schedule-integration
        // steps per second. Same numbers, sampled at a rate a player can see.
        const modelStale = now - gridModelAt >= PRICE_MODEL_MS || gridModelStep !== step;
        if (modelStale) {
          gridModelAt = now;
          gridModelStep = step;
          gridModel.clear();
        }
        for (const c of columns) {
          if (c.resolved) continue;
          const h = (c.t - now) / 1000;
          if (h < MIN_BET_HORIZON_SEC) continue; // locked zone drawn separately
          const x0 = xForTime(c.t, now);
          const x1 = xForTime(c.t + COL_INTERVAL_MS, now);
          if (x1 < nowX || x0 > W) continue;
          const cw = x1 - x0;
          let col = gridModel.get(c.t);
          if (!col) {
            // sigma is per-column: on VOLT it integrates a volatility schedule
            // that changes across the board, so it cannot be hoisted out.
            const colSigma = mk.sigma(price, now, c.t);
            col = { sigma: colSigma, m: new Map<number, number>() };
            gridModel.set(c.t, col);
          }
          for (let b = firstBand; b <= lastBand; b++) {
            const yTop = yForPrice(bandLow(b + 1));
            const yBot = yForPrice(bandLow(b));
            const ch = yBot - yTop;
            if (ch < 6) continue;
            let m = col.m.get(b);
            if (m === undefined) {
              const lo = bandLow(b) - price;
              m = col.sigma === null ? 0 : cellMultiplierAt(lo, lo + step, col.sigma);
              col.m.set(b, m);
            }
            if (m <= 0) continue;
            const inten = multIntensity(m);
            const [r, g, bl] = cellRGB(inten);
            const isHover = hover && hover.colT === c.t && hover.band === b;
            const a = 0.06 + inten * 0.6;
            const hot = inten > 0.7;
            // No shadowBlur on grid cells. Canvas shadows are a real Gaussian
            // blur per shape, and ~144 of the ~190 visible cells crossed the old
            // glow threshold — about twice the canvas area blurred every frame,
            // which is what pinned the main thread. "Hotter = bigger payout"
            // still reads, through colour intensity and a heavier border.
            ctx.fillStyle = isHover ? `rgba(${r},${g},${bl},0.95)` : `rgba(${r},${g},${bl},${a.toFixed(3)})`;
            roundRect(ctx, x0 + 1.5, yTop + 1.5, cw - 3, ch - 3, 3);
            ctx.fill();
            ctx.strokeStyle = isHover ? "#ffffff" : `rgba(${r},${g},${bl},${(0.3 + inten * 0.65).toFixed(3)})`;
            ctx.lineWidth = hot ? 2.2 : inten > 0.55 ? 1.6 : 1;
            ctx.stroke();
            // multiplier label — scales with the cell, big payouts get loud
            if (ch > 10 && cw > 16) {
              // Size to the label that is actually drawn. The old cw * 0.58 was
              // never exercised: ctx.font carried a CSS variable, so the string
              // was invalid and the size never took. With the font fixed, that
              // factor overflows narrow columns, so width comes from the glyph
              // count and the face's advance instead.
              const label = fmtMult(m);
              const adv = hot ? 0.78 : 0.62; // Orbitron is wider than the mono face
              const fitW = (cw - 6) / (label.length * adv);
              const fs = Math.max(10, Math.min(ch * 0.66, fitW, 46));
              const mx = (x0 + x1) / 2;
              const my = (yTop + yBot) / 2;
              ctx.font = `${hot ? 900 : inten > 0.4 ? 700 : 600} ${fs.toFixed(0)}px ${hot ? FONT_DISPLAY : FONT_MONO}`;
              if (hot && !isHover) {
                // dark outline so the bright number pops
                ctx.lineWidth = Math.max(2, fs * 0.14);
                ctx.strokeStyle = "rgba(6,6,14,0.85)";
                ctx.strokeText(label, mx, my);
              }
              ctx.fillStyle = isHover ? "#06060e" : hot ? `rgb(255,${Math.round(245 - inten * 30)},${Math.round(210 - inten * 120)})` : `rgba(233,243,255,${(0.5 + inten * 0.5).toFixed(3)})`;
              ctx.fillText(label, mx, my);
              ctx.font = `600 11px ${FONT_MONO}`;
            }
          }
        }
      }

      // ---- active bet markers ----
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 12px ${FONT_DISPLAY}`;
      for (const bt of bets) {
        if (bt.status === "lost") continue;
        const x0 = xForTime(bt.colT, now);
        const x1 = xForTime(bt.colT + COL_INTERVAL_MS, now);
        if (x1 < 0 || x0 > W) continue;
        const yTop = yForPrice(bandLow(bt.band + 1));
        const yBot = yForPrice(bandLow(bt.band));
        const won = bt.status === "won";
        // a bet the server hasn't confirmed yet reads as provisional
        ctx.globalAlpha = bt.pending ? 0.45 : 1;
        ctx.fillStyle = won ? "rgba(57,255,20,0.92)" : "rgba(255,210,63,0.18)";
        roundRect(ctx, x0 + 1.5, yTop + 1.5, x1 - x0 - 3, yBot - yTop - 3, 3);
        ctx.fill();
        ctx.strokeStyle = won ? "#39ff14" : "#ffd23f";
        ctx.shadowColor = won ? "rgba(57,255,20,0.8)" : "rgba(255,210,63,0.7)";
        ctx.shadowBlur = 10;
        ctx.lineWidth = 1.8;
        if (bt.pending) ctx.setLineDash([4, 3]);
        roundRect(ctx, x0 + 1.5, yTop + 1.5, x1 - x0 - 3, yBot - yTop - 3, 3);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);
        if (yBot - yTop > 16) {
          ctx.fillStyle = won ? "#06060e" : "#ffe27a";
          ctx.fillText(amt(bt.stake, unitRef.current), (x0 + x1) / 2, (yTop + yBot) / 2 - 6);
          ctx.font = `600 10px ${FONT_MONO}`;
          ctx.fillText(bt.pending ? "…" : fmtMult(bt.mult), (x0 + x1) / 2, (yTop + yBot) / 2 + 7);
          ctx.font = `700 12px ${FONT_DISPLAY}`;
        }
        ctx.globalAlpha = 1;
      }

      // ---- price line: the real tick series, decimated to ~one point per pixel ----
      const pts: { x: number; y: number }[] = [];
      for (const tk of view) {
        const x = xForTime(tk.t, now);
        const y = yForPrice(tk.p);
        const prev = pts[pts.length - 1];
        if (prev && x - prev.x < MIN_POINT_PX) {
          prev.x = x; // keep the latest sample in this pixel column
          prev.y = y;
          continue;
        }
        pts.push({ x, y });
      }
      const lx = xForTime(now, now);
      const ly = yForPrice(price);
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
          ctx.strokeStyle = fresh ? "#39ff14" : "#8b93b8";
          ctx.shadowColor = fresh ? "rgba(57,255,20,0.7)" : "rgba(139,147,184,0.5)";
          ctx.shadowBlur = 12;
          ctx.lineWidth = 2.2;
          tracePath();
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
      const headCol = fresh ? "#39ff14" : "#8b93b8";
      const pulse = 6 + 3 * Math.sin(now / 220);
      ctx.strokeStyle = fresh ? "rgba(57,255,20,0.5)" : "rgba(139,147,184,0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(lx, ly, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#eafff0";
      ctx.shadowColor = fresh ? "rgba(57,255,20,0.9)" : "rgba(139,147,184,0.6)";
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
      ctx.font = `500 10px ${FONT_MONO}`;
      const labelStep = niceStep((range!.max - range!.min) / 7);
      ctx.fillStyle = "rgba(139,147,184,0.7)";
      for (let p = Math.ceil(range!.min / labelStep) * labelStep; p <= range!.max; p += labelStep) {
        ctx.fillText(p.toFixed(2), W - 6, yForPrice(p));
      }
      // current price tag
      ctx.fillStyle = headCol;
      ctx.shadowColor = fresh ? "rgba(57,255,20,0.6)" : "rgba(139,147,184,0.4)";
      ctx.shadowBlur = 10;
      roundRect(ctx, W - 78, ly - 9, 74, 18, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#06060e";
      ctx.font = `700 11px ${FONT_MONO}`;
      ctx.fillText(price.toFixed(2), W - 8, ly);

      // ---- feed banner: say plainly when the game is not taking bets ----
      if (!quotable && !amb) {
        // Say which of these it is. "Measuring…" while the market is simply
        // standing still reads as a loading state that never finishes, when in
        // fact the game has made a decision and is waiting on the market.
        const msg =
          snap.reason === "stale"
            ? "FEED STALE — BETTING PAUSED"
            : snap.reason === "still"
              ? "MARKET TOO STILL TO PRICE — BETTING PAUSED"
              : snap.reason === "noisy"
                ? "SPREAD TOO WIDE TO PRICE — BETTING PAUSED"
                : snap.reason === "wild"
                  ? "MARKET TOO VOLATILE — BETTING PAUSED"
                  : "MEASURING LIVE VOLATILITY…";
        ctx.textAlign = "center";
        ctx.font = `700 11px ${FONT_MONO}`;
        const wBox = ctx.measureText(msg).width + 24;
        ctx.fillStyle = "rgba(6,6,14,0.85)";
        roundRect(ctx, W / 2 - wBox / 2, plotTop + 6, wBox, 24, 3);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,43,214,0.6)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#ff2bd6";
        ctx.fillText(msg, W / 2, plotTop + 18);
      }

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
        ctx.font = `800 16px ${FONT_DISPLAY}`;
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
    }

    let raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stopMarket();
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
    };
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
