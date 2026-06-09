import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { ensureAccount, debit, credit } from "@/lib/server/ledger";
import { nextRoll, setClientSeed } from "@/lib/server/fair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BPS = 10_000;
const EDGE_BPS = 700; // 7% house edge

// Server-authoritative Tap bet. The tapped cell's multiplier sets the win
// chance; the SERVER rolls (provably-fair) and settles. The browser only learns
// the result — it can't fake a win or set its own balance.
export async function POST(req: Request) {
  let body: { address?: string; stake?: number; mult?: number; clientSeed?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { address, stake, mult, clientSeed } = body;
  if (!address || !isAddress(address)) return NextResponse.json({ error: "valid address required" }, { status: 400 });
  if (typeof stake !== "number" || !(stake > 0)) return NextResponse.json({ error: "stake must be positive" }, { status: 400 });
  if (typeof mult !== "number" || !(mult > 1)) return NextResponse.json({ error: "bad multiplier" }, { status: 400 });

  const winChanceBps = Math.round((BPS - EDGE_BPS) / mult);
  if (winChanceBps < 1 || winChanceBps >= BPS) return NextResponse.json({ error: "odds out of range" }, { status: 400 });

  await ensureAccount(address);
  if (clientSeed && typeof clientSeed === "string") await setClientSeed(address, clientSeed);

  // Take the stake first (atomic, can't go negative).
  const afterStake = await debit(address, stake, "bet", "tap");
  if (afterStake === null) return NextResponse.json({ error: "insufficient balance" }, { status: 402 });

  const r = await nextRoll(address, BPS);
  const win = r.roll < winChanceBps;
  const payout = win ? Math.round(stake * mult * 100) / 100 : 0;
  const balance = win ? await credit(address, payout, "payout", "tap") : afterStake;

  return NextResponse.json({
    ok: true,
    win,
    payout,
    balance,
    roll: r.roll,
    winChanceBps,
    nonce: r.nonce,
    serverSeedHash: r.hash,
  });
}
