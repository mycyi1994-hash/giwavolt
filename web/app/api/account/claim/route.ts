import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { claim } from "@/lib/server/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Off-chain faucet: credits the player's game balance with play-money tKRW.
// No on-chain transfer, no signature, no gas.
const CLAIM_TKRW = Number(process.env.FAUCET_DRIP_TKRW ?? 1_000_000);
const CLAIM_COOLDOWN_MS = Number(process.env.FAUCET_COOLDOWN_MS ?? 0); // 0 = no cooldown (demo)

export async function POST(req: Request) {
  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.address || !isAddress(body.address)) {
    return NextResponse.json({ error: "valid address required" }, { status: 400 });
  }
  const res = await claim(body.address, CLAIM_TKRW, CLAIM_COOLDOWN_MS);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 429 });
  return NextResponse.json({ ok: true, balance: res.balance, claimed: CLAIM_TKRW });
}
