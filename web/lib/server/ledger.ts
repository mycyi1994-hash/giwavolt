// Off-chain play-money ledger (server-side). Maps a wallet address to a tKRW
// game balance. This is the heart of the "no-signature" model: players never
// sign to bet — every game's stake/payout just adjusts this balance through the
// /api/account/* routes. Withdrawals turn this balance back into real on-chain
// tKRW (pushed by the house wallet).
//
// Persistence: a JSON file under .data/. Fine for local dev / a single server.
// On serverless (Vercel) the filesystem is ephemeral — swap this for a real DB
// (Postgres/KV) before relying on it in production.
//
// SECURITY NOTE: settlement is client-reported (the browser tells the server the
// stake/payout deltas), so this is cheatable. It's a testnet demo to prove the
// flow; real money needs server-authoritative outcomes (oracles / server RNG).

import { promises as fs } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), ".data", "ledger.json");

type Store = { balances: Record<string, number>; lastClaim: Record<string, number> };

const norm = (a: string) => a.toLowerCase();
const round2 = (n: number) => Math.max(0, Math.round(n * 100) / 100);

// Serialise read-modify-write so concurrent requests can't clobber each other.
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.then(
    () => undefined,
    () => undefined
  );
  return run as Promise<T>;
}

async function read(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Store;
  } catch {
    return { balances: {}, lastClaim: {} };
  }
}

async function write(s: Store): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(s, null, 2));
}

export async function getBalance(addr: string): Promise<number> {
  const s = await read();
  return s.balances[norm(addr)] ?? 0;
}

// Apply a signed delta (negative = stake, positive = payout/refund). Clamped ≥ 0.
export async function adjustBalance(addr: string, delta: number): Promise<number> {
  return withLock(async () => {
    const s = await read();
    const k = norm(addr);
    const next = round2((s.balances[k] ?? 0) + delta);
    s.balances[k] = next;
    await write(s);
    return next;
  });
}

export async function setBalance(addr: string, value: number): Promise<number> {
  return withLock(async () => {
    const s = await read();
    const next = round2(value);
    s.balances[norm(addr)] = next;
    await write(s);
    return next;
  });
}

// Faucet credit with an optional cooldown. Returns the new balance or an error.
export async function claim(
  addr: string,
  amount: number,
  cooldownMs: number
): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  return withLock(async () => {
    const s = await read();
    const k = norm(addr);
    const now = Date.now();
    const prev = s.lastClaim[k];
    if (prev && cooldownMs > 0 && now - prev < cooldownMs) {
      const sec = Math.ceil((cooldownMs - (now - prev)) / 1000);
      return { ok: false as const, error: `Wait ~${sec}s before claiming again.` };
    }
    s.lastClaim[k] = now;
    s.balances[k] = round2((s.balances[k] ?? 0) + amount);
    await write(s);
    return { ok: true as const, balance: s.balances[k] };
  });
}
