"use client";

import { useEffect, useRef } from "react";

// Live BTC/USD price for the browser games. Binance is geo-blocked in some
// regions (incl. KR) and its websocket is often unreachable, which used to leave
// the price stuck at the seed value — making Candle/Breakout look frozen. So we
// poll CORS-friendly, non-geoblocked REST sources (Coinbase → Coingecko →
// Binance), and additionally use the Binance trade socket when it connects.
// A 100 ms easing loop keeps the line smooth between updates while staying
// anchored to the real price.
export function useLivePrice(initial = 95000) {
  const target = useRef(initial); // latest real price
  const shown = useRef(initial); // eased/displayed price
  const live = useRef(false);

  useEffect(() => {
    let stop = false;
    let ws: WebSocket | null = null;

    const set = (v: number) => {
      if (Number.isFinite(v) && v > 0) {
        target.current = v;
        live.current = true;
      }
    };

    const fetchRest = async () => {
      try {
        const r = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot");
        const j = await r.json();
        const v = parseFloat(j?.data?.amount);
        if (v) return set(v);
      } catch {
        /* try next */
      }
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
        const j = await r.json();
        if (j?.bitcoin?.usd) return set(j.bitcoin.usd);
      } catch {
        /* try next */
      }
      try {
        const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
        const j = await r.json();
        if (j?.price) set(parseFloat(j.price));
      } catch {
        /* give up this round */
      }
    };

    fetchRest(); // instant value
    const poll = setInterval(() => !stop && fetchRest(), 4000);

    // best-effort high-frequency stream; ignored if blocked
    try {
      ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade");
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d?.p) set(parseFloat(d.p));
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* no ws */
    }

    // ease the shown price toward the real target + tiny jitter so the line
    // stays lively even when updates only arrive every few seconds.
    const ease = setInterval(() => {
      const t = target.current;
      const noise = (Math.random() - 0.5) * t * 0.00015;
      shown.current += (t - shown.current) * 0.18 + noise;
    }, 100);

    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(ease);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return { getPrice: () => shown.current, isLive: () => live.current };
}
