import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { giwaSepolia } from "@/lib/chain";
import { GAMEVAULT_ADDRESS, gameVaultAbi, gameVaultEnabled, voucherDomain, withdrawVoucherTypes } from "@/lib/gamevault";
import { debit, credit, getBalance } from "@/lib/server/ledger";
import { reqAddress, reqAmount, readBody, json, err, rateLimit } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cash out game balance to real on-chain tKRW via the GameVault: the operator
// signs an EIP-712 cumulative voucher and relays the withdraw tx. Funds go only
// to the player. We debit the ledger first and refund if the on-chain tx fails.
export async function POST(req: Request) {
  // No falling back to FAUCET_PRIVATE_KEY. The vault now requires its operator
  // to differ from its owner, so that fallback would sign every voucher with a
  // key the vault does not accept — every withdrawal reverting as "bad sig" —
  // and the reason it existed, "use one key for all", is the arrangement the
  // separation is there to prevent.
  const key = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key || !gameVaultEnabled) {
    return err("Withdrawals not configured (OPERATOR_PRIVATE_KEY + NEXT_PUBLIC_GAMEVAULT_ADDRESS).", 503);
  }

  const body = await readBody<{ address?: string; amount?: number }>(req);
  const address = reqAddress(body?.address);
  const amount = reqAmount(body?.amount);
  if (!address) return err("valid address required");
  if (amount === null) return err("amount must be positive");
  if (!rateLimit(`withdraw:${address.toLowerCase()}`, 10, 60_000)) return err("too many requests — slow down", 429);

  if ((await getBalance(address)) < amount) return err("insufficient game balance");

  // Debit first so a double-submit can't double-withdraw.
  const balance = await debit(address, amount, "withdraw", "vault");
  if (balance === null) return err("insufficient game balance", 402);

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
    // A receipt is not a success. waitForTransactionReceipt resolves for a
    // reverted transaction too, so without this check a revert that got past
    // gas estimation — the operator rotated mid-flight, a race on `withdrawn`,
    // out of gas — would debit the player and report ok.
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") throw new Error(`withdraw reverted on-chain (${tx})`);
    return json({ ok: true, balance, tx });
  } catch (e: any) {
    await credit(address, amount, "refund", "withdraw-failed"); // give it back
    return err(typeof e?.shortMessage === "string" ? e.shortMessage : "withdraw failed", 500);
  }
}
