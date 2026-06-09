import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { getBalance } from "@/lib/server/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "valid address required" }, { status: 400 });
  }
  return NextResponse.json({ balance: await getBalance(address) });
}
