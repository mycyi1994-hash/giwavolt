"use client";

import { useAccount, useReadContract } from "wagmi";
import { TESTKRW_ADDRESS, erc20Abi, testKrwEnabled } from "./testkrw";

// Reads the connected wallet's tKRW balance off-chain-free (straight RPC read).
export function useTestKrw() {
  const { address, isConnected } = useAccount();
  const { data, refetch, isFetching } = useReadContract({
    address: testKrwEnabled ? (TESTKRW_ADDRESS as `0x${string}`) : undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: testKrwEnabled && !!address, refetchInterval: 12_000 },
  });
  return {
    enabled: testKrwEnabled,
    connected: isConnected,
    address,
    balance: typeof data === "bigint" ? data : undefined,
    refetch,
    isFetching,
  };
}
