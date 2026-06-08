"use client";

import { useEffect, useRef } from "react";

// Live BTC/USD price straight from the user's browser: Binance trade websocket
// (high-frequency, real ticks) with a REST poll fallback. Returns getters so a
// render loop can read the latest price without re-rendering.
export function useLivePrice(initial = 63500) {
  const price = useRef(initial);
  const live = useRef(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const restOnce = async () => {
      try {
        const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
        const j = await r.json();
        if (j?.price) {
          price.current = parseFloat(j.price);
          live.current = true;
        }
      } catch {
        /* ignore */
      }
    };
    const startPoll = () => {
      if (poll) return;
      restOnce();
      poll = setInterval(restOnce, 3000);
    };

    restOnce(); // instant value
    try {
      ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade");
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d?.p) {
            price.current = parseFloat(d.p);
            live.current = true;
          }
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => !closed && startPoll();
      ws.onclose = () => !closed && startPoll();
    } catch {
      startPoll();
    }

    return () => {
      closed = true;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      if (poll) clearInterval(poll);
    };
  }, []);

  return { getPrice: () => price.current, isLive: () => live.current };
}
