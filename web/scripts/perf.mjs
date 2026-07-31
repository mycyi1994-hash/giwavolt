#!/usr/bin/env node
/**
 * VOLT performance harness — reproducible baseline capture.
 *
 * Drives a headless Chromium against a *production* build and measures the
 * steady-state cost of the two animated screens:
 *
 *   tap    /terminal/tap   with the VOLT (synthetic, offline) market selected
 *   death  /terminal/death with a demo round in progress
 *
 * Determinism notes:
 *   - ALL non-loopback network is blocked twice over: at the browser level with
 *     --host-resolver-rules (this is what actually kills the BTC WebSocket, which
 *     request interception cannot see) and at the Playwright level with
 *     route() -> abort() for anything whose hostname is not 127.0.0.1/localhost.
 *   - The VOLT market is generated in-browser from a per-load seed at a fixed
 *     100ms step, so it needs no network and its *statistics* are stable even
 *     though the seed differs run to run.
 *   - A mock EIP-1193 provider is injected so wagmi auto-reconnects on mount.
 *     Without it every screen renders behind ConnectGate's `blur-sm` +
 *     `backdrop-blur` overlay, which is a completely different (and much more
 *     expensive) compositing path than what a real player sees.
 *
 * Measurement notes:
 *   - Frame cadence comes from our own requestAnimationFrame loop injected via
 *     addInitScript. It measures main-thread frame delivery. On a page that does
 *     not animate on its own, our loop is what keeps frames being produced, so
 *     the number reads as "how smooth would an animation here be", i.e. main
 *     thread responsiveness. That is exactly what we want for a comparison.
 *   - CDP Performance.getMetrics is sampled at both ends of the window and
 *     differenced, so ScriptDuration/LayoutDuration/etc. are for the window only.
 *
 * READ THIS BEFORE TRUSTING AN FPS NUMBER
 *   This container has no GPU, so Chromium rasterises in software. Canvas 2D
 *   shadow/glow work and CSS blur therefore cost far more here than on a real
 *   machine, and absolute fps is pessimistic. Two guards make the numbers usable
 *   anyway:
 *     - `blank` and `hub` targets are controls. `blank` shows the ceiling (60fps)
 *       and `hub` shows what the app's CSS alone costs with an idle main thread.
 *       Read every game page against those, not against 60.
 *     - cdp_main_thread_busy_pct / cdp_script_ms / longtasks / TBT are *not*
 *       raster-sensitive. Those are the numbers to optimise against, and the
 *       numbers to compare before and after a fix.
 *
 * Usage:
 *   node scripts/perf.mjs                                  # tap + death, 25s each
 *   node scripts/perf.mjs --pages blank,hub,tap,death      # with both controls
 *   node scripts/perf.mjs --pages tap --probe no-250ms-snapshot   # A/B a suspect
 *   node scripts/perf.mjs --url http://127.0.0.1:3401 --json out.json
 *
 * Flags:
 *   --url <origin>     default http://127.0.0.1:3401
 *   --seconds <n>      measurement window, default 25
 *   --warmup <n>       settle time before the window opens, default 6
 *   --pages <list>     comma list of tap,death,hub,blank   default tap,death
 *   --market <id>      btc|volt for the tap page, default volt
 *   --viewport <WxH>   default 1440x900
 *   --probe <name>     none (default) | no-250ms-snapshot   diagnostic A/B only
 *   --hover            park the pointer over the chart (enables the crosshair path)
 *   --headed           run headed (needs a display; normally leave off)
 *   --json <path>      also write the summary object to this file
 *
 * Prerequisite: a production build served on the target origin.
 *   npm run build && npx next start -p 3401
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? def : argv[i + 1];
};
const flag = (name) => argv.includes(`--${name}`);

const ORIGIN = arg("url", "http://127.0.0.1:3401").replace(/\/$/, "");
const SECONDS = Number(arg("seconds", 25));
const WARMUP = Number(arg("warmup", 6));
const PAGES = String(arg("pages", "tap,death"))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MARKET = String(arg("market", "volt"));
const HOVER = flag("hover");
const HEADED = flag("headed");
const JSON_OUT = arg("json", null);
const [VW, VH] = String(arg("viewport", "1440x900")).split("x").map(Number);
const PROBE = String(arg("probe", "none"));
const PROFILE = flag("profile");

// Playwright's bundled revision may not match the pre-installed browser, so
// prefer an explicit executable when one is present.
const CANDIDATES = [
  process.env.PW_CHROMIUM_PATH,
  "/opt/pw-browsers/chromium",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].filter(Boolean);
const EXECUTABLE = CANDIDATES.find((p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
});

// ---------------------------------------------------------------- init scripts

/** Mock injected wallet so wagmi reconnects on mount and ConnectGate opens. */
const WALLET_INIT = () => {
  const ACCOUNTS = ["0x00000000000000000000000000000000000fea51"];
  const CHAIN_ID = "0x164ce"; // 91342, Giwa Sepolia
  const events = new Map();
  const provider = {
    isMetaMask: true,
    isConnected: () => true,
    async request({ method }) {
      switch (method) {
        case "eth_chainId":
          return CHAIN_ID;
        case "net_version":
          return String(parseInt(CHAIN_ID, 16));
        case "eth_accounts":
        case "eth_requestAccounts":
          return ACCOUNTS;
        case "wallet_getPermissions":
        case "wallet_requestPermissions":
          return [{ parentCapability: "eth_accounts" }];
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        case "eth_getBalance":
          return "0x0";
        case "eth_blockNumber":
          return "0x1";
        case "eth_call":
          return "0x";
        case "eth_estimateGas":
          return "0x5208";
        case "personal_sign":
        case "eth_sign":
          return "0x" + "11".repeat(65);
        default:
          return null;
      }
    },
    on(ev, cb) {
      if (!events.has(ev)) events.set(ev, []);
      events.get(ev).push(cb);
      return provider;
    },
    removeListener(ev, cb) {
      const l = events.get(ev);
      if (l) events.set(ev, l.filter((f) => f !== cb));
      return provider;
    },
    addListener(ev, cb) {
      return provider.on(ev, cb);
    },
    removeAllListeners() {
      events.clear();
      return provider;
    },
  };
  Object.defineProperty(window, "ethereum", { value: provider, writable: true, configurable: true });

  // EIP-6963 discovery, which is how wagmi/rainbowkit find wallets now.
  const detail = Object.freeze({
    info: {
      uuid: "9f1b4d1e-0000-4000-8000-000000000001",
      name: "Perf Harness Wallet",
      rdns: "dev.volt.perfharness",
      icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
    },
    provider,
  });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
};

/**
 * Diagnostic probes. These do NOT fix anything and they do NOT touch app source
 * — they are measurement instruments that neutralise one suspected cost so its
 * price tag can be read off the difference. Use them only for A/B, never as a
 * baseline.
 *
 *   no-250ms-snapshot  Suppress the one 250ms setInterval in the app
 *                      (lib/markets.ts useMarketSnapshot). The rAF draw loop
 *                      reads the market directly, so the chart keeps running;
 *                      only the React re-render cadence goes away. The delta
 *                      against the baseline is what that re-render costs.
 */
const PROBE_INIT = (probe) => {
  if (probe === "no-250ms-snapshot") {
    const real = window.setInterval.bind(window);
    window.__probeSuppressed = 0;
    window.setInterval = function (fn, ms, ...rest) {
      if (ms === 250) {
        window.__probeSuppressed++;
        return real(() => {}, 3_600_000);
      }
      return real(fn, ms, ...rest);
    };
  }
};

/** Frame-cadence + long-task recorder. Installed before any page script runs. */
const PERF_INIT = () => {
  const S = { frames: [], longtasks: [], running: false, t0: 0, rafTotal: 0 };
  let prev = performance.now();
  const loop = (now) => {
    const d = now - prev;
    prev = now;
    S.rafTotal++;
    if (S.running) S.frames.push(d);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  let poSupported = false;
  try {
    const po = new PerformanceObserver((list) => {
      if (!S.running) return;
      for (const e of list.getEntries()) S.longtasks.push([e.startTime, e.duration]);
    });
    po.observe({ entryTypes: ["longtask"] });
    poSupported = true;
  } catch {
    /* no longtask support */
  }

  const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : null);

  window.__perfStart = () => {
    S.frames.length = 0;
    S.longtasks.length = 0;
    S.t0 = performance.now();
    S.running = true;
    return { t: S.t0, heap: heap(), longtaskSupported: poSupported };
  };
  window.__perfStop = () => {
    S.running = false;
    return {
      t0: S.t0,
      t1: performance.now(),
      frames: S.frames.slice(),
      longtasks: S.longtasks.slice(),
      heap: heap(),
      longtaskSupported: poSupported,
    };
  };
};

// ---------------------------------------------------------------- stats

const pct = (sorted, p) => {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
};
const r2 = (n) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 100) / 100);
const r1 = (n) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10);

function frameStats(deltas, windowMs) {
  // Drop the first delta: it straddles the start marker.
  const d = deltas.slice(1).filter((x) => x > 0 && Number.isFinite(x));
  const sorted = [...d].sort((a, b) => a - b);
  const sum = d.reduce((a, b) => a + b, 0);
  const mean = d.length ? sum / d.length : null;
  return {
    frames: d.length,
    fps_mean: r2(d.length / (windowMs / 1000)),
    fps_p50: r2(pct(sorted, 50) ? 1000 / pct(sorted, 50) : null),
    fps_p95_worst: r2(pct(sorted, 95) ? 1000 / pct(sorted, 95) : null), // p95 of frame TIME -> slow tail
    fps_worst: r2(sorted.length ? 1000 / sorted[sorted.length - 1] : null),
    frame_ms_mean: r2(mean),
    frame_ms_p50: r2(pct(sorted, 50)),
    frame_ms_p95: r2(pct(sorted, 95)),
    frame_ms_p99: r2(pct(sorted, 99)),
    frame_ms_worst: r2(sorted.length ? sorted[sorted.length - 1] : null),
    frames_over_50ms: d.filter((x) => x > 50).length,
    frames_over_34ms: d.filter((x) => x > 34).length,
    // Frames are handed out on 60Hz vsync slots, so a 50ms delta means three
    // slots went by with nothing painted. This counts the missed slots.
    vsync_slots_missed: d.reduce((a, x) => a + Math.max(0, Math.round(x / 16.667) - 1), 0),
  };
}

function longtaskStats(lt, windowMs) {
  const gaps = [];
  for (let i = 1; i < lt.length; i++) gaps.push(lt[i][0] - lt[i - 1][0]);
  gaps.sort((a, b) => a - b);
  const durs = lt.map((x) => x[1]);
  return {
    longtasks: lt.length,
    longtask_hz: r2(lt.length / (windowMs / 1000)),
    // A tight cluster here means a periodic timer, not random jank. Compare it
    // against the app's known beats (250ms snapshot, 100ms synth step).
    longtask_gap_ms_p50: r1(pct(gaps, 50)),
    longtask_ms_total: r1(durs.reduce((a, b) => a + b, 0)),
    longtask_ms_worst: r1(durs.length ? Math.max(...durs) : 0),
    total_blocking_time_ms: r1(durs.reduce((a, b) => a + Math.max(0, b - 50), 0)),
  };
}

/**
 * Fold a V8 sampling profile into a self-time leaderboard. Answers "which
 * function is the main thread actually sitting in", which is the difference
 * between optimising the draw loop and optimising React.
 */
function topSelfTime(profile, n = 12) {
  const total = profile.endTime - profile.startTime; // microseconds
  const hits = profile.nodes.reduce((a, x) => a + (x.hitCount ?? 0), 0);
  if (!hits) return [];
  const perHit = total / hits / 1000; // ms
  return profile.nodes
    .filter((x) => x.hitCount)
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, n)
    .map((x) => {
      const f = x.callFrame;
      const where = f.url ? `${f.url.split("/").pop()}:${f.lineNumber + 1}` : "(native)";
      return {
        fn: f.functionName || "(anonymous)",
        at: where,
        self_ms: r1(x.hitCount * perHit),
        self_pct: r1((x.hitCount / hits) * 100),
      };
    });
}

function metricDiff(a, b) {
  const ma = Object.fromEntries(a.map((m) => [m.name, m.value]));
  const mb = Object.fromEntries(b.map((m) => [m.name, m.value]));
  const d = (k) => (mb[k] ?? 0) - (ma[k] ?? 0);
  return { start: ma, end: mb, d };
}

// ---------------------------------------------------------------- page drivers

async function openGate(page) {
  // Wallet auto-reconnect should dismiss ConnectGate. If it does not, fall back
  // to driving the RainbowKit modal.
  const overlay = page.getByText("Connect a wallet to play", { exact: false });
  try {
    await overlay.waitFor({ state: "detached", timeout: 12_000 });
    return "auto-reconnect";
  } catch {
    /* fall through */
  }
  const connect = page.getByRole("button", { name: /connect wallet/i }).first();
  if (await connect.count()) {
    await connect.click({ timeout: 5_000 }).catch(() => {});
    const wallet = page.getByRole("button", { name: /perf harness wallet|browser wallet|metamask/i }).first();
    await wallet.click({ timeout: 8_000 }).catch(() => {});
    await overlay.waitFor({ state: "detached", timeout: 12_000 });
    return "modal-click";
  }
  throw new Error("could not get past ConnectGate");
}

async function setupTap(page) {
  await page.goto(`${ORIGIN}/terminal/tap`, { waitUntil: "domcontentloaded" });
  const gate = await openGate(page);
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 15_000 });

  if (MARKET === "volt") {
    // The market picker is a plain button row; the label is the market's label.
    const byTitle = page.locator('button[title^="Our own market"]');
    const btn = (await byTitle.count()) ? byTitle.first() : page.locator("main button", { hasText: /^VOLT$/ }).first();
    await btn.click({ timeout: 10_000 });
    // FeedBadge proves the synthetic market is the one running.
    await page.getByText("SIMULATED", { exact: false }).first().waitFor({ timeout: 10_000 });
  }

  if (HOVER) {
    const box = await page.locator("canvas").first().boundingBox();
    if (box) await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  }
  return { gate, market: MARKET, hover: HOVER };
}

async function setupDeath(page) {
  await page.goto(`${ORIGIN}/terminal/death`, { waitUntil: "domcontentloaded" });
  const gate = await openGate(page);
  await page.getByText("SKULLS", { exact: false }).first().waitFor({ timeout: 15_000 });

  // Start a demo round so the board is in its live state (preview multipliers on
  // every tile) rather than idle. Best effort: report which state we measured.
  let state = "idle";
  const bet = page.getByRole("button", { name: /^BET\b/ }).first();
  const stop = page.getByRole("button", { name: /STOP . CASH OUT/i }).first();
  if (await bet.count()) {
    await bet.click({ timeout: 5_000 }).catch(() => {});
    await stop
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => (state = "playing"))
      .catch(() => (state = "idle"));
  }
  return { gate, state };
}

// Control surface: same app shell, providers, fonts and nav, but no canvas and
// no market subscription. Anything this page costs is framework baseline.
async function setupHub(page) {
  await page.goto(`${ORIGIN}/terminal`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  return { gate: "n/a (hub is not gated)" };
}

// Pure control: a blank document under the exact same launch flags/viewport.
async function setupBlank(page) {
  await page.goto("data:text/html,<body style=background:%23070710></body>");
  return { gate: "n/a" };
}

// ---------------------------------------------------------------- capture

async function capture(browser, name, setup) {
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
  });

  // Requirement: abort anything that is not loopback. (The launch-level
  // host-resolver rule is the belt; this is the braces, and it also logs.)
  const blocked = new Set();
  await context.route("**/*", (route) => {
    let host = "";
    try {
      host = new URL(route.request().url()).hostname;
    } catch {
      /* data:, blob: */
    }
    if (!host || host === "127.0.0.1" || host === "localhost" || host === "::1") return route.continue();
    blocked.add(host);
    return route.abort();
  });

  await context.addInitScript(WALLET_INIT);
  if (PROBE !== "none") await context.addInitScript(PROBE_INIT, PROBE);
  await context.addInitScript(PERF_INIT);

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e).slice(0, 200)));

  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable", { timeDomain: "timeTicks" });
  await cdp.send("HeapProfiler.enable").catch(() => {});
  const usedHeap = async () => {
    const m = (await cdp.send("Performance.getMetrics")).metrics;
    return Object.fromEntries(m.map((x) => [x.name, x.value])).JSHeapUsedSize ?? null;
  };

  const info = await setup(page);

  // Let JIT warm, layout settle and the tick buffers fill.
  await page.waitForTimeout(WARMUP * 1000);

  // Collect first so heap_start is a floor, not a random point in a GC cycle.
  // This happens BEFORE the window opens, so it cannot perturb the measurement.
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const retained0 = await usedHeap();

  if (PROFILE) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
  }

  const m0 = (await cdp.send("Performance.getMetrics")).metrics;
  const s0 = await page.evaluate(() => window.__perfStart());

  await page.waitForTimeout(SECONDS * 1000);

  const s1 = await page.evaluate(() => window.__perfStop());
  const m1 = (await cdp.send("Performance.getMetrics")).metrics;
  const hot = PROFILE ? topSelfTime((await cdp.send("Profiler.stop")).profile) : null;

  // Window is closed; forcing a collection now is free and tells us how much of
  // the growth is retained (a leak) versus churn the collector reclaims.
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const retained1 = await usedHeap();

  const windowMs = s1.t1 - s1.t0;
  const { start, end, d } = metricDiff(m0, m1);

  const heapStart = s0.heap ?? start.JSHeapUsedSize ?? null;
  const heapEnd = s1.heap ?? end.JSHeapUsedSize ?? null;
  const mb = (n) => (n === null || n === undefined ? null : n / 1048576);

  const summary = {
    page: name,
    probe: PROBE,
    probe_suppressed: await page.evaluate(() => window.__probeSuppressed ?? null).catch(() => null),
    ...info,
    window_s: r2(windowMs / 1000),
    ...frameStats(s1.frames, windowMs),
    longtask_supported: s1.longtaskSupported,
    ...longtaskStats(s1.longtasks, windowMs),
    // CDP Performance deltas over the window, in ms
    cdp_task_ms: r1(d("TaskDuration") * 1000),
    cdp_script_ms: r1(d("ScriptDuration") * 1000),
    cdp_layout_ms: r1(d("LayoutDuration") * 1000),
    cdp_recalc_style_ms: r1(d("RecalcStyleDuration") * 1000),
    cdp_task_other_ms: r1(d("TaskOtherDuration") * 1000),
    cdp_main_thread_busy_pct: r1(((d("TaskDuration") * 1000) / windowMs) * 100),
    cdp_layout_count: d("LayoutCount"),
    cdp_recalc_style_count: d("RecalcStyleCount"),
    dom_nodes_start: start.Nodes ?? null,
    dom_nodes_end: end.Nodes ?? null,
    js_listeners_end: end.JSEventListeners ?? null,
    heap_start_mb: r2(mb(heapStart)),
    heap_end_mb: r2(mb(heapEnd)),
    heap_growth_mb: r2(heapStart === null || heapEnd === null ? null : mb(heapEnd - heapStart)),
    heap_growth_mb_per_min: r2(
      heapStart === null || heapEnd === null ? null : mb(heapEnd - heapStart) * (60_000 / windowMs)
    ),
    // Post-GC on both ends: this is the number that means "leak", not "churn".
    retained_start_mb: r2(mb(retained0)),
    retained_end_mb: r2(mb(retained1)),
    retained_growth_mb: r2(retained0 === null || retained1 === null ? null : mb(retained1 - retained0)),
    retained_growth_mb_per_min: r2(
      retained0 === null || retained1 === null ? null : mb(retained1 - retained0) * (60_000 / windowMs)
    ),
    blocked_hosts: [...blocked].sort(),
    page_errors: pageErrors.slice(0, 5),
    // Only present with --profile. The sampler perturbs the run, so treat the
    // other numbers from a --profile run as indicative, not as a baseline.
    ...(hot ? { hot_self_time: hot } : {}),
  };

  if (hot) {
    console.error(`\n[--profile] ${name}: top self time (V8 sampler, JS only — Skia/raster is not sampled)`);
    for (const h of hot) console.error(`  ${String(h.self_pct).padStart(5)}%  ${String(h.self_ms).padStart(7)}ms  ${h.fn}  @${h.at}`);
  }

  await context.close();
  return summary;
}

// ---------------------------------------------------------------- report

function table(rows) {
  const keys = [
    "page",
    "window_s",
    "fps_mean",
    "fps_p50",
    "fps_p95_worst",
    "frame_ms_p50",
    "frame_ms_p95",
    "frame_ms_worst",
    "frames_over_50ms",
    "vsync_slots_missed",
    "longtasks",
    "longtask_hz",
    "longtask_gap_ms_p50",
    "longtask_ms_worst",
    "total_blocking_time_ms",
    "cdp_main_thread_busy_pct",
    "cdp_task_ms",
    "cdp_script_ms",
    "cdp_layout_ms",
    "cdp_recalc_style_ms",
    "cdp_task_other_ms",
    "cdp_recalc_style_count",
    "heap_growth_mb",
    "retained_growth_mb_per_min",
  ];
  const w = Math.max(...keys.map((k) => k.length));
  const lines = [];
  lines.push("metric".padEnd(w) + rows.map((r) => String(r.page).padStart(14)).join(""));
  for (const k of keys.slice(1)) {
    lines.push(k.padEnd(w) + rows.map((r) => String(r[k] ?? "-").padStart(14)).join(""));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- main

const t = Date.now();
const browser = await chromium.launch({
  headless: !HEADED,
  ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}),
  chromiumSandbox: false,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    // Hard offline: nothing but loopback resolves. This is the only thing that
    // reliably stops the BTC WebSocket, which request routing cannot intercept.
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",
    "--enable-precise-memory-info",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--hide-scrollbars",
    "--mute-audio",
  ],
});

const results = [];
try {
  for (const p of PAGES) {
    if (p === "tap") results.push(await capture(browser, "tap", setupTap));
    else if (p === "death") results.push(await capture(browser, "death", setupDeath));
    else if (p === "hub") results.push(await capture(browser, "hub", setupHub));
    else if (p === "blank") results.push(await capture(browser, "blank", setupBlank));
    else throw new Error(`unknown page "${p}" (expected tap|death|hub|blank)`);
  }
} finally {
  await browser.close();
}

const out = {
  harness: "volt-perf/1",
  ts: new Date().toISOString(),
  origin: ORIGIN,
  window_s: SECONDS,
  warmup_s: WARMUP,
  chromium: EXECUTABLE ?? "playwright-bundled",
  headless: !HEADED,
  viewport: `${VW}x${VH}@1x`,
  elapsed_s: r1((Date.now() - t) / 1000),
  results,
};

console.log("");
console.log(table(results));
console.log("");
console.log("===VOLT-PERF-SUMMARY-BEGIN===");
console.log(JSON.stringify(out));
console.log("===VOLT-PERF-SUMMARY-END===");

if (JSON_OUT) {
  fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify(out, null, 2));
  console.error(`wrote ${path.resolve(JSON_OUT)}`);
}
