// 今日總覽用的即時資料（呼叫自己網站的 Vercel 函式 /api/*，不是直接呼叫 Finnhub）
// 瀏覽器端完全碰不到 Finnhub 金鑰；送出去的只有股票代號（沒有股數、成本）。
//
// 任何失敗都不丟錯：報價失敗 → 狀態 "fallback"，畫面改用每日收盤資料並標示「非即時」；
// 新聞、財報失敗 → 顯示「暫時無法取得」。本機開發（npm run dev）沒有 /api，也會走 fallback。

import { useEffect, useRef, useState } from "react";
import type { EarningsItem, LiveQuote, NewsItem } from "./finnhub";

export type LiveStatus = "idle" | "loading" | "live" | "fallback";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** 每 intervalMs 毫秒更新一次即時報價；分頁在背景時暫停（省額度），回到前景立刻更新 */
export function useLiveQuotes(symbols: string[], intervalMs = 60_000) {
  const key = symbols.join(",");
  const [state, setState] = useState<{ quotes: Record<string, LiveQuote>; status: LiveStatus; updatedAt: Date | null }>({
    quotes: {},
    status: symbols.length ? "loading" : "idle",
    updatedAt: null,
  });
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!key) {
      setState({ quotes: {}, status: "idle", updatedAt: null });
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await getJson<{ quotes: Record<string, LiveQuote> }>(`/api/quote?symbols=${encodeURIComponent(key)}`);
        if (!cancelled) setState({ quotes: body.quotes ?? {}, status: "live", updatedAt: new Date() });
      } catch {
        // 失敗就退回收盤資料（不保留舊的即時價，避免把幾分鐘前的價格當成現在）
        if (!cancelled) setState({ quotes: {}, status: "fallback", updatedAt: new Date() });
      }
    };
    const start = () => {
      if (timer.current !== null) window.clearInterval(timer.current);
      void tick();
      timer.current = window.setInterval(() => {
        if (document.visibilityState === "visible") void tick();
      }, intervalMs);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") start();
    };
    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer.current !== null) window.clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, intervalMs]);

  return state;
}

/** 讀一次 /api/news 或 /api/earnings；url 為 null 時不讀 */
function useApiOnce<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; failed: boolean; loading: boolean }>({ data: null, failed: false, loading: !!url });
  useEffect(() => {
    if (!url) {
      setState({ data: null, failed: false, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    getJson<T>(url)
      .then((data) => {
        if (!cancelled) setState({ data, failed: false, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, failed: true, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

export function useNews(symbols: string[]) {
  return useApiOnce<{ items: NewsItem[] }>(symbols.length ? `/api/news?symbols=${encodeURIComponent(symbols.join(","))}` : null);
}

export function useEarnings(symbols: string[]) {
  return useApiOnce<{ items: EarningsItem[] }>(symbols.length ? `/api/earnings?symbols=${encodeURIComponent(symbols.join(","))}` : null);
}
