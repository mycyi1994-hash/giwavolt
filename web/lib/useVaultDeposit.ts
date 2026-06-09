"use client";

import { useCallback } from "react";
import { parseEther } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { GAMEVAULT_ADDRESS, gameVaultAbi, gameVaultEnabled } from "./gamevault";
import { TESTKRW_ADDRESS, erc20Abi, testKrwEnabled } from "./testkrw";

export type DepositResult = { ok: boolean; error?: string; credited?: number };

// Bring real on-chain tKRW into the game balance: approve → Vault.deposit() →
// tell the server to credit it. These are the player's only signatures.
export function useVaultDeposit() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const enabled = gameVaultEnabled && testKrwEnabled;

  const deposit = useCallback(
    async (amountKrw: number): Promise<DepositResult> => {
      if (!enabled) return { ok: false, error: "vault not configured" };
      if (!address || !publicClient) return { ok: false, error: "connect a wallet" };
      if (!(amountKrw > 0)) return { ok: false, error: "amount must be positive" };
      const amount = parseEther(String(amountKrw));
      try {
        const approveTx = await writeContractAsync({
          address: TESTKRW_ADDRESS as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [GAMEVAULT_ADDRESS as `0x${string}`, amount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        const depTx = await writeContractAsync({
          address: GAMEVAULT_ADDRESS as `0x${string}`,
          abi: gameVaultAbi,
          functionName: "deposit",
          args: [amount],
        });
        await publicClient.waitForTransactionReceipt({ hash: depTx });
      } catch (e: any) {
        return { ok: false, error: typeof e?.shortMessage === "string" ? e.shortMessage : "deposit rejected" };
      }

      // credit the off-chain balance from the on-chain event
      try {
        const r = await fetch("/api/account/deposit/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const d = await r.json();
        if (!r.ok) return { ok: false, error: d.error ?? "sync failed" };
        return { ok: true, credited: d.credited };
      } catch {
        return { ok: false, error: "deposited on-chain but sync failed — retry sync" };
      }
    },
    [enabled, address, publicClient, writeContractAsync]
  );

  return { enabled, deposit };
}
