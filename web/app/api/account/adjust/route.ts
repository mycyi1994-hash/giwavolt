import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { adjustBalance } from "@/lib/server/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every game stake (negative delta) and payout/refund (positive delta) flows
// through here. No signature — this is the off-chain settlement primitive.
// NOTE: client-reported, therefore cheatable; demo only (see lib/server/ledger).
export async function POST(req: Request) {
  let body: { address?: string; delta?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.address || !isAddress(body.address)) {
    return NextResponse.json({ error: "valid address required" }, { status: 400 });
  }
  if (typeof body.delta !== "number" || !Number.isFinite(body.delta)) {
    return NextResponse.json({ error: "delta must be a number" }, { status: 400 });
  }
  const balance = await adjustBalance(body.address, body.delta);
  return NextResponse.json({ ok: true, balance });
}
