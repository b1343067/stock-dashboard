// 看盤頁：左邊觀察清單、右邊 K 線圖與指標摘要（第一階段）

import { useCallback, useEffect, useState } from "react";
import StockChart from "../components/StockChart";
import Watchlist from "../components/Watchlist";
import SignalSummary from "../components/SignalSummary";
import ChartToolbar from "../components/ChartToolbar";
import { loadTicker } from "../lib/data";
import type { Route } from "../lib/route";
import { useStoredState } from "../lib/storage";
import type { IndexData, OverlayKey, TickerData, Timeframe } from "../lib/types";

const DEFAULT_OVERLAYS: Record<OverlayKey, boolean> = { ma10: false, ma20: true, ma50: true, ma200: true, bb: false };

interface Props {
  index: IndexData | null;
  indexError: string | null;
  route: Route;
  navigate: (symbol: string, timeframe: Timeframe) => void;
  redUp: boolean;
}

export default function ChartPage({ index, indexError, route, navigate, redUp }: Props) {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [overlays, setOverlays] = useStoredState("overlays", DEFAULT_OVERLAYS);

  // 網址沒有指定股票時，預設選清單第一檔
  const symbol = route.symbol ?? index?.tickers[0]?.symbol ?? null;

  // 讀取選中的股票
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false; // 避免快速切換時，舊的請求比新的晚回來而蓋掉畫面
    setLoading(true);
    setTickerError(null);
    loadTicker(symbol)
      .then((d) => !cancelled && setTicker(d))
      .catch((e: unknown) => !cancelled && setTickerError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const select = useCallback((s: string) => navigate(s, route.timeframe), [route.timeframe, navigate]);

  const shown = ticker && ticker.symbol === symbol ? ticker : null;
  const series = shown ? shown[route.timeframe] : null;

  return (
    <div className="layout">
      <aside className="sidebar">
        {indexError ? (
          <p className="error">無法讀取股票清單：{indexError}</p>
        ) : (
          <Watchlist items={index?.tickers ?? null} selected={symbol} onSelect={select} redUp={redUp} />
        )}
      </aside>

      <section className="content">
        <div className="card chart-card">
          <div className="chart-head">
            <div className="chart-title">
              <h2>{shown?.symbol ?? symbol ?? "—"}</h2>
              <span className="muted">
                {shown?.name}
                {shown && ` · ${shown.currency}`}
              </span>
            </div>
            <ChartToolbar
              timeframe={route.timeframe}
              onTimeframe={(tf) => symbol && navigate(symbol, tf)}
              overlays={overlays}
              onOverlays={setOverlays}
            />
          </div>

          {tickerError ? (
            <p className="error chart-placeholder">此股票資料讀取失敗：{tickerError}</p>
          ) : series ? (
            <StockChart data={series} timeframe={route.timeframe} overlays={overlays} redUp={redUp} />
          ) : (
            <div className="chart-placeholder muted">{loading || !index ? "載入中…" : "請選擇股票"}</div>
          )}
        </div>

        {series && shown && (
          <SignalSummary data={series} timeframe={route.timeframe} currency={shown.currency} redUp={redUp} />
        )}
      </section>
    </div>
  );
}
