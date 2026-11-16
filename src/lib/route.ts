// 極簡的網址路由（不用 react-router，自己處理 hash 就夠了）
//   （空白）或 #/market → 市場總覽（網站打開的第一頁）
//   #/代號/週期   → 看盤頁，例如 #/0050.TW/weekly
//   #/screener    → 指標篩選器
//   #/portfolio   → 投資組合
//   #/analysis    → 組合分析
// 好處：重新整理、分享連結、瀏覽器「上一頁」都能停在同一個畫面。

import { useCallback, useEffect, useState } from "react";
import type { Timeframe } from "./types";

export type Page = "market" | "chart" | "screener" | "portfolio" | "analysis";

export interface Route {
  page: Page;
  symbol: string | null;
  timeframe: Timeframe;
}

const TIMEFRAMES: Timeframe[] = ["daily", "weekly", "monthly"];

export function parseHash(hash: string): Route {
  const [, first, tf] = hash.replace(/^#/, "").split("/");
  // 沒有指定頁面（剛打開網站）→ 市場總覽
  if (first === undefined || (first === "" && tf === undefined) || first === "market") return { page: "market", symbol: null, timeframe: "daily" };
  if (first === "screener" || first === "portfolio" || first === "analysis") return { page: first, symbol: null, timeframe: "daily" };
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

export const MARKET_HREF = "#/market";
export const SCREENER_HREF = "#/screener";
export const PORTFOLIO_HREF = "#/portfolio";
export const ANALYSIS_HREF = "#/analysis";

export function useHashRoute() {
  const [route, setRouteState] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRouteState(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const setRoute = useCallback((r: Omit<Route, "page"> & { page?: Page }) => {
    const next =
      r.page === "market"
        ? MARKET_HREF
        : r.page === "screener"
        ? SCREENER_HREF
        : r.page === "portfolio"
          ? PORTFOLIO_HREF
          : r.page === "analysis"
            ? ANALYSIS_HREF
            : chartHref(r.symbol ?? "", r.timeframe);
    if (window.location.hash !== next) window.location.hash = next; // 會觸發 hashchange
  }, []);

  return [route, setRoute] as const;
}
