"use client";

import { useAccount, useBalance } from "wagmi";
import { giwaSepolia } from "./chain";
import { usePlay } from "@/components/play/PlayProvider";
import { usdc, krw } from "./money";
import { STAKE_ETH } from "./voltTap";

// Unified funds view: DEMO = USDC play money (PlayProvider); REAL = live native
// ETH balance from the connected wallet. REAL bets are a fixed 0.0001 ETH stake.
export function useFunds() {
  const { mode } = usePlay();
  const play = usePlay();
  const { address } = useAccount();
  const { data, refetch } = useBalance({
    address,
    chainId: giwaSepolia.id,
    query: { enabled: !!address && mode === "real" },
  });

  if (mode === "real") {
    const eth = data ? Number(data.formatted) : 0;
    return {
      mode,
      symbol: "ETH",
      amount: eth,
      fixedStake: STAKE_ETH,
      fmtMain: `${eth.toFixed(4)} ETH`,
      fmtSub: "GIWA Sepolia",
      refetch,
    };
  }
  const bal = play.balance.demo;
  return {
    mode,
    symbol: "USDC",
    amount: bal,
    fixedStake: undefined as number | undefined,
    fmtMain: usdc(bal),
    fmtSub: krw(bal),
    refetch,
  };
}
