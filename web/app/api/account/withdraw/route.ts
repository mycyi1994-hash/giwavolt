import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { giwaSepolia } from "@/lib/chain";
import { GAMEVAULT_ADDRESS, gameVaultAbi, gameVaultEnabled, voucherDomain, withdrawVoucherTypes } from "@/lib/gamevault";
import { debit, credit, getBalance } from "@/lib/server/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cash out game balance to real on-chain tKRW via the GameVault: the operator
// signs an EIP-712 cumulative voucher and relays the withdraw tx. Funds go only
// to the player. We debit the ledger first and refund if the on-chain tx fails.
export async function POST(req: Request) {
  const key = (process.env.OPERATOR_PRIVATE_KEY ?? process.env.FAUCET_PRIVATE_KEY) as `0x${string}` | undefined;
  if (!key || !gameVaultEnabled) {
    return NextResponse.json({ error: "Withdrawals not configured (OPERATOR_PRIVATE_KEY + NEXT_PUBLIC_GAMEVAULT_ADDRESS)." }, { status: 503 });
  }

  let body: { address?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { address, amount } = body;
  if (!address || !isAddress(address)) return NextResponse.json({ error: "valid address required" }, { status: 400 });
  if (typeof amount !== "number" || !(amount > 0)) return NextResponse.json({ error: "amount must be positive" }, { status: 400 });

  if ((await getBalance(address)) < amount) return NextResponse.json({ error: "insufficient game balance" }, { status: 400 });

  // Debit first so a double-submit can't double-withdraw.
  const balance = await debit(address, amount, "withdraw", "vault");
  if (balance === null) return NextResponse.json({ error: "insufficient game balance" }, { status: 402 });

  try {
    const account = privateKeyToAccount(key);
    const transport = http(process.env.NEXT_PUBLIC_GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io");
    const publicClient = createPublicClient({ chain: giwaSepolia, transport });
    const wallet = createWalletClient({ account, chain: giwaSepolia, transport });
    const vault = GAMEVAULT_ADDRESS as `0x${string}`;

    // New cumulative = on-chain withdrawn (source of truth) + this amount.
    const base = (await publicClient.readContract({ address: vault, abi: gameVaultAbi, functionName: "withdrawn", args: [address as `0x${string}`] })) as bigint;
    const cumulative = base + parseEther(String(amount));

    const sig = await account.signTypedData({
      domain: voucherDomain(giwaSepolia.id, vault),
      types: withdrawVoucherTypes,
      primaryType: "Withdraw",
      message: { user: address as `0x${string}`, cumulative },
    });

    const tx = await wallet.writeContract({
      address: vault,
      abi: gameVaultAbi,
      functionName: "withdraw",
      args: [address as `0x${string}`, cumulative, sig],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    return NextResponse.json({ ok: true, balance, tx });
  } catch (e: any) {
    await credit(address, amount, "refund", "withdraw-failed"); // give it back
    const msg = typeof e?.shortMessage === "string" ? e.shortMessage : "withdraw failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
