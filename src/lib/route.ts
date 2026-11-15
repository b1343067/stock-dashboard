// 極簡的網址路由（不用 react-router，自己處理 hash 就夠了）
//   #/代號/週期   → 看盤頁，例如 #/0050.TW/weekly
//   #/screener    → 指標篩選器
//   #/portfolio   → 投資組合
// 好處：重新整理、分享連結、瀏覽器「上一頁」都能停在同一個畫面。

import { useCallback, useEffect, useState } from "react";
import type { Timeframe } from "./types";

export type Page = "chart" | "screener" | "portfolio";

export interface Route {
  page: Page;
  symbol: string | null;
  timeframe: Timeframe;
}

const TIMEFRAMES: Timeframe[] = ["daily", "weekly", "monthly"];

export function parseHash(hash: string): Route {
  const [, first, tf] = hash.replace(/^#/, "").split("/");
  if (first === "screener" || first === "portfolio") return { page: first, symbol: null, timeframe: "daily" };
  return {
    page: "chart",
    symbol: first ? decodeURIComponent(first) : null,
    timeframe: TIMEFRAMES.includes(tf as Timeframe) ? (tf as Timeframe) : "daily",
  };
}

/** 產生看盤頁的連結，例如 chartHref("NVDA", "weekly") → "#/NVDA/weekly" */
export function chartHref(symbol: string, timeframe: Timeframe = "daily"): string {
  return `#/${encodeURIComponent(symbol)}/${timeframe}`;
}

export const SCREENER_HREF = "#/screener";
export const PORTFOLIO_HREF = "#/portfolio";

export function useHashRoute() {
  const [route, setRouteState] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRouteState(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const setRoute = useCallback((r: Omit<Route, "page"> & { page?: Page }) => {
    const next =
      r.page === "screener" ? SCREENER_HREF : r.page === "portfolio" ? PORTFOLIO_HREF : chartHref(r.symbol ?? "", r.timeframe);
    if (window.location.hash !== next) window.location.hash = next; // 會觸發 hashchange
  }, []);

  return [route, setRoute] as const;
}
