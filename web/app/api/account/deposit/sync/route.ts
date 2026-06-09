import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, formatEther } from "viem";
import { giwaSepolia } from "@/lib/chain";
import { GAMEVAULT_ADDRESS, gameVaultAbi, gameVaultEnabled } from "@/lib/gamevault";
import { getSql } from "@/lib/server/db";
import { credit } from "@/lib/server/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// After a player deposits tKRW into the GameVault on-chain, the frontend calls
// this to credit their off-chain balance. Reads `Deposited` events for the user
// and credits any not seen before (idempotent via the deposits table). Works on
// serverless — no persistent watcher needed.
export async function POST(req: Request) {
  if (!gameVaultEnabled) return NextResponse.json({ error: "Vault not configured" }, { status: 503 });

  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const address = body.address;
  if (!address || !isAddress(address)) return NextResponse.json({ error: "valid address required" }, { status: 400 });

  const publicClient = createPublicClient({ chain: giwaSepolia, transport: http(process.env.NEXT_PUBLIC_GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io") });
  const fromBlock = process.env.GAMEVAULT_DEPLOY_BLOCK ? BigInt(process.env.GAMEVAULT_DEPLOY_BLOCK) : 0n;

  let logs;
  try {
    logs = await publicClient.getLogs({
      address: GAMEVAULT_ADDRESS as `0x${string}`,
      event: gameVaultAbi.find((x) => x.type === "event" && x.name === "Deposited") as any,
      args: { user: address as `0x${string}` },
      fromBlock,
      toBlock: "latest",
    });
  } catch (e: any) {
    return NextResponse.json({ error: typeof e?.shortMessage === "string" ? e.shortMessage : "could not read deposits" }, { status: 500 });
  }

  const db = getSql();
  let credited = 0;
  let balance = 0;
  for (const log of logs) {
    const txHash = log.transactionHash;
    const logIndex = log.logIndex ?? 0;
    const amount = (log as any).args?.amount as bigint | undefined;
    if (!txHash || amount == null) continue;
    // claim this (txHash, logIndex) exactly once
    const ins = await db`insert into deposits (tx_hash, log_index, address, amount) values (${txHash}, ${logIndex}, ${address.toLowerCase()}, ${amount.toString()}) on conflict (tx_hash, log_index) do nothing returning tx_hash`;
    if (ins.length) {
      const krw = Number(formatEther(amount));
      balance = await credit(address, krw, "deposit", txHash);
      credited += krw;
    }
  }

  return NextResponse.json({ ok: true, credited, balance });
}
