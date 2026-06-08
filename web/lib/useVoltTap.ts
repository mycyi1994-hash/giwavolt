"use client";

import { useCallback } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { decodeEventLog } from "viem";
import { giwaSepolia } from "./chain";
import { voltTapAbi, VOLTTAP_ADDRESS, STAKE_WEI } from "./voltTap";

export type TapResult = { win: boolean; payout: bigint; hash: `0x${string}` };

export function useVoltTap() {
  const { isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: giwaSepolia.id });
  const { writeContractAsync } = useWriteContract();

  const configured = !!VOLTTAP_ADDRESS;
  const ready = configured && isConnected;
  const wrongChain = isConnected && chainId !== giwaSepolia.id;

  const tap = useCallback(
    async (winChanceBps: number): Promise<TapResult> => {
      if (!VOLTTAP_ADDRESS) throw new Error("VoltTap not configured");
      const hash = await writeContractAsync({
        address: VOLTTAP_ADDRESS,
        abi: voltTapAbi,
        functionName: "tap",
        args: [winChanceBps],
        value: STAKE_WEI,
        chainId: giwaSepolia.id,
      });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      let win = false;
      let payout = 0n;
      for (const log of receipt.logs) {
        try {
          const d = decodeEventLog({ abi: voltTapAbi, data: log.data, topics: log.topics });
          if (d.eventName === "Tapped") {
            const a = d.args as unknown as { win: boolean; payout: bigint };
            win = a.win;
            payout = a.payout;
          }
        } catch {
          /* not our event */
        }
      }
      return { win, payout, hash };
    },
    [publicClient, writeContractAsync]
  );

  return { tap, ready, configured, wrongChain };
}
