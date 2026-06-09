"use client";

import { useCallback } from "react";
import { decodeEventLog } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import {
  BPS,
  EDGE_BPS,
  STAKE_WEI,
  VOLTTAP_ADDRESS,
  payoutWeiFor,
  voltTapAbi,
  voltTapEnabled,
  winChanceBpsFromMult,
} from "./volttap";

export type TapResult = {
  win: boolean;
  payoutWei: bigint; // 0 on a loss
  multBps: number; // realised multiplier in bps (post integer-rounding)
  winChanceBps: number;
  txHash: `0x${string}`;
};

export type TapError =
  | "disabled" // no contract address configured
  | "disconnected" // wallet not connected
  | "bad-mult" // multiplier too low to represent on-chain
  | "bankroll" // contract can't cover the payout
  | "rejected" // user rejected / tx reverted
  | "failed"; // anything else

export class VoltTapError extends Error {
  constructor(public code: TapError) {
    super(code);
  }
}

// Imperative on-chain tap. One signature per tap (no off-chain balance).
export function useVoltTap() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const { data: bankrollWei, refetch: refetchBankroll } = useReadContract({
    address: voltTapEnabled ? (VOLTTAP_ADDRESS as `0x${string}`) : undefined,
    abi: voltTapAbi,
    functionName: "freeBankroll",
    query: { enabled: voltTapEnabled, refetchInterval: 15_000 },
  });

  const tap = useCallback(
    async (mult: number): Promise<TapResult> => {
      if (!voltTapEnabled) throw new VoltTapError("disabled");
      if (!isConnected || !address) throw new VoltTapError("disconnected");
      if (!publicClient) throw new VoltTapError("failed");

      const winChanceBps = winChanceBpsFromMult(mult);
      if (winChanceBps == null) throw new VoltTapError("bad-mult");

      // Pre-flight the bankroll so the user doesn't pay gas for a sure revert.
      const need = payoutWeiFor(winChanceBps);
      if (typeof bankrollWei === "bigint" && bankrollWei < need) {
        throw new VoltTapError("bankroll");
      }

      let txHash: `0x${string}`;
      try {
        txHash = await writeContractAsync({
          address: VOLTTAP_ADDRESS as `0x${string}`,
          abi: voltTapAbi,
          functionName: "tap",
          args: [winChanceBps],
          value: STAKE_WEI,
        });
      } catch (e) {
        throw new VoltTapError("rejected");
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") throw new VoltTapError("rejected");

      // Find our Tapped event in the receipt logs.
      let win = false;
      let payoutWei = 0n;
      let multBps = (BigInt(BPS - EDGE_BPS) * BigInt(BPS)) / BigInt(winChanceBps);
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== (VOLTTAP_ADDRESS as string).toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: voltTapAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "Tapped") {
            const a = ev.args as { win: boolean; payout: bigint; multiplierBps: bigint };
            win = a.win;
            payoutWei = a.payout;
            multBps = a.multiplierBps;
            break;
          }
        } catch {
          /* not our event */
        }
      }

      refetchBankroll();
      return { win, payoutWei, multBps: Number(multBps), winChanceBps, txHash };
    },
    [address, isConnected, publicClient, writeContractAsync, bankrollWei, refetchBankroll]
  );

  return {
    enabled: voltTapEnabled,
    bankrollWei: typeof bankrollWei === "bigint" ? bankrollWei : undefined,
    tap,
  };
}
