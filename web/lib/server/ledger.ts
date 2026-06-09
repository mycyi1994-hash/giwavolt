// Server-authoritative off-chain ledger (Postgres / Supabase).
//
// Balances live in the DB; debits are atomic and can't go negative, so the
// browser can't conjure funds. Game *outcomes* are decided server-side too
// (see lib/server/fair.ts + /api/game/*), which is what makes this not cheatable
// — unlike the old client-reported /api/account/adjust.

import { getSql } from "./db";

const norm = (a: string) => a.toLowerCase();
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function ensureAccount(address: string): Promise<void> {
  const db = getSql();
  await db`insert into accounts (address) values (${norm(address)}) on conflict (address) do nothing`;
}

export async function getBalance(address: string): Promise<number> {
  const db = getSql();
  const r = await db`select balance from accounts where address=${norm(address)}`;
  return r.length ? Number(r[0].balance) : 0;
}

// Atomic debit: only succeeds if the balance covers it. Returns the new balance,
// or null if there weren't enough funds.
export async function debit(address: string, amount: number, kind: string, ref?: string): Promise<number | null> {
  const db = getSql();
  const a = norm(address);
  const amt = round2(amount);
  const r = await db`update accounts set balance = balance - ${amt} where address=${a} and balance >= ${amt} returning balance`;
  if (!r.length) return null;
  await db`insert into txns (address, delta, kind, ref) values (${a}, ${-amt}, ${kind}, ${ref ?? null})`;
  return Number(r[0].balance);
}

export async function credit(address: string, amount: number, kind: string, ref?: string): Promise<number> {
  const db = getSql();
  const a = norm(address);
  const amt = round2(amount);
  await ensureAccount(a);
  const r = await db`update accounts set balance = balance + ${amt} where address=${a} returning balance`;
  await db`insert into txns (address, delta, kind, ref) values (${a}, ${amt}, ${kind}, ${ref ?? null})`;
  return Number(r[0].balance);
}

// Generic signed adjust, clamped ≥ 0. Kept only for back-compat with the old
// client-reported flow; server-authoritative games use debit/credit instead.
export async function adjustBalance(address: string, delta: number): Promise<number> {
  const db = getSql();
  const a = norm(address);
  await ensureAccount(a);
  const r = await db`update accounts set balance = greatest(0, balance + ${round2(delta)}) where address=${a} returning balance`;
  await db`insert into txns (address, delta, kind, ref) values (${a}, ${round2(delta)}, 'adjust', null)`;
  return Number(r[0].balance);
}

export async function claim(
  address: string,
  amount: number,
  cooldownMs: number
): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  const db = getSql();
  const a = norm(address);
  await ensureAccount(a);
  if (cooldownMs > 0) {
    const rows = await db`select last_claim from claims where address=${a}`;
    if (rows.length && rows[0].last_claim) {
      const last = new Date(rows[0].last_claim).getTime();
      const wait = cooldownMs - (Date.now() - last);
      if (wait > 0) return { ok: false, error: `Wait ~${Math.ceil(wait / 1000)}s before claiming again.` };
    }
  }
  await db`insert into claims (address, last_claim) values (${a}, now()) on conflict (address) do update set last_claim = now()`;
  const r = await db`update accounts set balance = balance + ${round2(amount)} where address=${a} returning balance`;
  await db`insert into txns (address, delta, kind, ref) values (${a}, ${round2(amount)}, 'claim', null)`;
  return { ok: true, balance: Number(r[0].balance) };
}
