// 看盤頁：左邊觀察清單、右邊 K 線圖與指標摘要（第一階段）

import { useCallback, useEffect, useMemo, useState } from "react";
import StockChart from "../components/StockChart";
import Watchlist from "../components/Watchlist";
import SignalSummary from "../components/SignalSummary";
import ChartToolbar from "../components/ChartToolbar";
import TrendCard, { TREND_HORIZON, TREND_LOOKBACK } from "../components/TrendCard";
import { extrapolate, nextTradingDays } from "../lib/trend";
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
  const [showTrend, setShowTrend] = useStoredState("showTrend", true);

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

  // 短期趨勢外推（一律用日線計算）。用 useMemo 避免每次重畫都產生新陣列、讓圖表重設位置。
  const market: "US" | "TW" = shown && /\.TWO?$/.test(shown.symbol) ? "TW" : "US";
  const projection = useMemo(() => {
    if (!shown) return null;
    const { time, close } = shown.daily;
    if (close.length < TREND_LOOKBACK) return null;
    const values = extrapolate(close, TREND_LOOKBACK, TREND_HORIZON);
    const dates = nextTradingDays(time[time.length - 1], TREND_HORIZON, market);
    // 第一個點放最新收盤，讓虛線從 K 線最後一根接出去
    return [{ time: time[time.length - 1], value: close[close.length - 1] }, ...dates.map((d, i) => ({ time: d, value: values[i] }))];
  }, [shown, market]);

  return (
    <div className="layout">
      <aside className="sidebar">
        {indexError ? (
          <p className="error">無法讀取股票清單：{indexError}</p>
        ) : (
          <Watchlist
            items={index?.tickers ?? null}
            categories={index?.categories}
            selected={symbol}
            onSelect={select}
            redUp={redUp}
          />
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
            <StockChart
              data={series}
              timeframe={route.timeframe}
              overlays={overlays}
              redUp={redUp}
              projection={showTrend ? projection : null}
            />
          ) : (
            <div className="chart-placeholder muted">{loading || !index ? "載入中…" : "請選擇股票"}</div>
          )}
        </div>

        {series && shown && (
          <SignalSummary data={series} timeframe={route.timeframe} currency={shown.currency} redUp={redUp} />
        )}

        {shown && projection && (
          <TrendCard
            closes={shown.daily.close}
            lastDate={shown.daily.time[shown.daily.time.length - 1]}
            currency={shown.currency}
            market={market}
            projection={projection}
            showOnChart={showTrend}
            onToggle={() => setShowTrend(!showTrend)}
          />
        )}
      </section>
    </div>
  );
}
