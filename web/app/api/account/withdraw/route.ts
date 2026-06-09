import { NextResponse } from "next/server";
import { createWalletClient, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { giwaSepolia } from "@/lib/chain";
import { TESTKRW_ADDRESS, erc20Abi } from "@/lib/testkrw";
import { adjustBalance, getBalance } from "@/lib/server/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Turns the off-chain game balance back into real on-chain tKRW: the house
// wallet pushes the tokens to the player's address (no user signature). Debits
// the ledger first, refunds it if the on-chain send fails.
export async function POST(req: Request) {
  const key = process.env.FAUCET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key || !TESTKRW_ADDRESS) {
    return NextResponse.json({ error: "Withdrawals not configured (FAUCET_PRIVATE_KEY / token)." }, { status: 503 });
  }

  let body: { address?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { address, amount } = body;
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "valid address required" }, { status: 400 });
  }
  if (typeof amount !== "number" || !(amount > 0)) {
    return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  }

  const have = await getBalance(address);
  if (have < amount) {
    return NextResponse.json({ error: "insufficient game balance" }, { status: 400 });
  }

  // Debit first to avoid double-withdraws, then send on-chain.
  const balance = await adjustBalance(address, -amount);
  try {
    const account = privateKeyToAccount(key);
    const transport = http(process.env.NEXT_PUBLIC_GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io");
    const wallet = createWalletClient({ account, chain: giwaSepolia, transport });
    const tx = await wallet.writeContract({
      address: TESTKRW_ADDRESS as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [address as `0x${string}`, parseEther(String(Math.floor(amount)))],
    });
    return NextResponse.json({ ok: true, balance, tx });
  } catch (e: any) {
    await adjustBalance(address, amount); // refund the debit
    const msg = typeof e?.shortMessage === "string" ? e.shortMessage : "withdraw transfer failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
