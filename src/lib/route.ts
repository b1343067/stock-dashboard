// 極簡的網址路由：#/代號/週期，例如 #/0050.TW/weekly
// 不用 react-router，因為只有一個頁面，自己處理 hash 就夠了。

import { useCallback, useEffect, useState } from "react";
import type { Timeframe } from "./types";

export interface Route {
  symbol: string | null;
  timeframe: Timeframe;
}

const TIMEFRAMES: Timeframe[] = ["daily", "weekly", "monthly"];

function parse(hash: string): Route {
  const [, sym, tf] = hash.replace(/^#/, "").split("/");
  return {
    symbol: sym ? decodeURIComponent(sym) : null,
    timeframe: TIMEFRAMES.includes(tf as Timeframe) ? (tf as Timeframe) : "daily",
  };
}

export function useHashRoute() {
  const [route, setRouteState] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRouteState(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const setRoute = useCallback((r: Route) => {
    const next = `#/${encodeURIComponent(r.symbol ?? "")}/${r.timeframe}`;
    if (window.location.hash !== next) window.location.hash = next; // 會觸發 hashchange
  }, []);

  return [route, setRoute] as const;
}
