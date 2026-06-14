import { NextResponse } from "next/server";
import { isAddress } from "viem";

// Shared helpers for /api/* routes: consistent JSON shape, body parsing,
// address validation, and a light in-memory rate limiter.

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function readBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function reqAddress(v: unknown): `0x${string}` | null {
  return typeof v === "string" && isAddress(v) ? (v as `0x${string}`) : null;
}

export function reqAmount(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

// Naive per-key sliding-window limiter. On serverless it's per-instance, so it's
// a light abuse guard rather than a hard cap — the DB stays the source of truth.
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  // opportunistic cleanup so the map doesn't grow unbounded
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}
