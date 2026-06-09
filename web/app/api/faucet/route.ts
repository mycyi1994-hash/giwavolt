import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, isAddress, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { giwaSepolia } from "@/lib/chain";
import { TESTKRW_ADDRESS, erc20Abi } from "@/lib/testkrw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How much each claim hands out. tKRW is play money; the dust ETH is just so a
// fresh wallet (0 ETH) can pay gas for deposits / future on-chain actions.
const DRIP_TKRW = parseEther(process.env.FAUCET_DRIP_TKRW ?? "1000000"); // 1,000,000 tKRW
const DRIP_ETH = parseEther(process.env.FAUCET_DRIP_ETH ?? "0.001");
const COOLDOWN_MS = Number(process.env.FAUCET_COOLDOWN_MS ?? 8 * 60 * 60 * 1000);

// Per-address cooldown. In-memory: resets on cold start / redeploy, which is
// fine for a testnet faucet (the goal is light abuse resistance, not custody).
const lastClaim = new Map<string, number>();

export async function POST(req: Request) {
  const key = process.env.FAUCET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key || !TESTKRW_ADDRESS) {
    return NextResponse.json(
      { error: "Faucet not configured (set FAUCET_PRIVATE_KEY and NEXT_PUBLIC_TESTKRW_ADDRESS)." },
      { status: 503 }
    );
  }

  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const to = body.address;
  if (!to || !isAddress(to)) {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  }

  const now = Date.now();
  const prev = lastClaim.get(to.toLowerCase());
  if (prev && now - prev < COOLDOWN_MS) {
    const mins = Math.ceil((COOLDOWN_MS - (now - prev)) / 60000);
    return NextResponse.json({ error: `Already claimed. Try again in ~${mins} min.` }, { status: 429 });
  }

  const account = privateKeyToAccount(key);
  const transport = http(process.env.NEXT_PUBLIC_GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io");
  const publicClient = createPublicClient({ chain: giwaSepolia, transport });
  const wallet = createWalletClient({ account, chain: giwaSepolia, transport });

  try {
    // Reserve the cooldown slot up-front so concurrent requests can't double-spend.
    lastClaim.set(to.toLowerCase(), now);

    // 1) dust ETH for gas (skip if the wallet already has plenty)
    let ethHash: `0x${string}` | null = null;
    const bal = await publicClient.getBalance({ address: to as `0x${string}` });
    if (DRIP_ETH > 0n && bal < DRIP_ETH) {
      ethHash = await wallet.sendTransaction({ to: to as `0x${string}`, value: DRIP_ETH });
    }

    // 2) tKRW play money
    const tkrwHash = await wallet.writeContract({
      address: TESTKRW_ADDRESS as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to as `0x${string}`, DRIP_TKRW],
    });

    return NextResponse.json({
      ok: true,
      tkrw: formatEther(DRIP_TKRW),
      eth: ethHash ? formatEther(DRIP_ETH) : "0",
      tkrwTx: tkrwHash,
      ethTx: ethHash,
    });
  } catch (e: any) {
    // Roll back the cooldown so a failed drip can be retried.
    lastClaim.delete(to.toLowerCase());
    const msg = typeof e?.shortMessage === "string" ? e.shortMessage : "Faucet transfer failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
