"use client";

import { useEffect, useRef, useState } from "react";
import { getFeedState, subscribeFeed, type FeedState } from "@/lib/priceFeed";

// React view of the real BTC/USD feed (lib/priceFeed.ts). Mounting this keeps
// the shared feed alive; the feed itself is a singleton, so several components
// on a page cost one connection between them.
//
// Trade ticks arrive tens of times a second, which is far more than React needs
// to repaint a price label, so state updates are throttled. Canvas consumers
// should read getFeedState()/getTicks() straight from the feed inside their
// animation loop instead of re-rendering per tick.
const UPDATE_MS = 250;

export function useLivePrice(): FeedState {
  const [snapshot, setSnapshot] = useState<FeedState>(getFeedState);
  const pending = useRef<FeedState | null>(null);

  useEffect(() => {
    const flush = setInterval(() => {
      if (pending.current) {
        setSnapshot(pending.current);
        pending.current = null;
      }
    }, UPDATE_MS);

    const unsub = subscribeFeed((s) => {
      pending.current = s;
    });

    return () => {
      clearInterval(flush);
      unsub();
    };
  }, []);

  return snapshot;
}
