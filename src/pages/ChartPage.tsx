// 看盤頁：左邊觀察清單；右邊報價標頭、K 線圖、「現在的狀態」卡片、短期趨勢外推

import { useCallback, useEffect, useMemo, useState } from "react";
import StockChart from "../components/StockChart";
import Watchlist from "../components/Watchlist";
import StatusCards from "../components/StatusCards";
import ChartToolbar from "../components/ChartToolbar";
import DrawingTools from "../components/DrawingTools";
import FundamentalsCard from "../components/FundamentalsCard";
import { drawingKey, handleClick, sanitizeDrawings, type DrawMode, type Drawing, type Point } from "../lib/drawings";
import TrendCard, { TREND_HORIZON, TREND_LOOKBACK } from "../components/TrendCard";
import { extrapolate, nextTradingDays } from "../lib/trend";
import { loadTicker } from "../lib/data";
import { fmtFixed, pnlClass } from "../lib/format";
import { compareHref, type Route } from "../lib/route";
import { readStorage, useStoredState, writeStorage } from "../lib/storage";
import type { IndexData, OverlayKey, TickerData, Timeframe } from "../lib/types";
import { t } from "../lib/i18n";

// 預設：K 線＋MA20／50／200；布林、MACD、RSI 收起來（使用者展開後會記住）
const DEFAULT_OVERLAYS: Record<OverlayKey, boolean> = {
  ma10: false,
  ma20: true,
  ma50: true,
  ma200: true,
  bb: false,
  macd: false,
  rsi: false,
};

interface Props {
  index: IndexData | null;
  indexError: string | null;
  route: Route;
  navigate: (symbol: string, timeframe: Timeframe) => void;
  redUp: boolean;
  /** 「＋提醒」：打開價格提醒面板並帶入這檔股票與現價 */
  onAddAlert: (symbol: string, price: number) => void;
}

/** 成交量縮寫：12,345,678 → 12.3M */
function fmtVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

export default function ChartPage({ index, indexError, route, navigate, redUp, onAddAlert }: Props) {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [overlays, setOverlays] = useStoredState("overlays", DEFAULT_OVERLAYS);
  const [showTrend, setShowTrend] = useStoredState("showTrend", true);

  // 網址沒有指定股票時，預設選清單第一檔
  const symbol = route.symbol ?? index?.tickers[0]?.symbol ?? null;

  // 讀取選中的股票（只有這一檔，其他股票點了才下載）
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

  // ---- 畫圖工具 ----
  // 每檔股票、每個週期各自一份。不用 useStoredState，因為它的 key 換了（換股票）時不會重新讀取。
  const dKey = symbol ? drawingKey(symbol, route.timeframe) : null;
  const [drawStore, setDrawStore] = useState<Record<string, Drawing[]>>({});
  const drawings = useMemo(
    () => (dKey ? (drawStore[dKey] ?? sanitizeDrawings(readStorage<unknown>(dKey, []))) : []),
    [dKey, drawStore],
  );
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [pending, setPending] = useState<Point | null>(null);
  const saveDrawings = useCallback(
    (list: Drawing[]) => {
      if (!dKey) return;
      setDrawStore((m) => ({ ...m, [dKey]: list }));
      writeStorage(dKey, list);
    },
    [dKey],
  );
  // 換股票或週期：取消畫到一半的線
  useEffect(() => {
    setPending(null);
    setDrawMode("none");
  }, [dKey]);
  // Esc 取消畫圖
  useEffect(() => {
    if (drawMode === "none") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawMode("none");
        setPending(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [drawMode]);
  const onChartClick = useCallback(
    (p: Point) => {
      const r = handleClick(drawings, drawMode, pending, p);
      setPending(r.pending);
      if (r.done) {
        saveDrawings(r.drawings);
        setDrawMode("none"); // 畫完一條就回到一般模式，避免不小心一直加線
      }
    },
    [drawings, drawMode, pending, saveDrawings],
  );

  const select = useCallback((s: string) => navigate(s, route.timeframe), [route.timeframe, navigate]);

  const shown = ticker && ticker.symbol === symbol ? ticker : null;
  const series = shown ? shown[route.timeframe] : null;
  const summary = index?.tickers.find((t) => t.symbol === symbol);

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

  // 報價標頭：用日線最後兩根算漲跌
  const quote = useMemo(() => {
    if (!shown) return null;
    const d = shown.daily;
    const i = d.close.length - 1;
    const prev = i > 0 ? d.close[i - 1] : d.open[i];
    const chg = d.close[i] - prev;
    return { close: d.close[i], chg, pct: prev ? (chg / prev) * 100 : 0, open: d.open[i], high: d.high[i], low: d.low[i], prev, volume: d.volume[i], date: d.time[i] };
  }, [shown]);

  return (
    <div className="layout">
      <aside className="sidebar">
        {indexError ? (
          <p className="error">{t("無法讀取股票清單：{0}", [indexError])}</p>
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
        {/* 報價標頭 */}
        <div className="quote-head">
          <div className="quote-main">
            <div className="quote-meta">
              <span>{shown?.name ?? summary?.name ?? ""}</span>
              {summary?.category && <span className="badge">{t(summary.category)}</span>}
              {shown && <span>{shown.currency}</span>}
            </div>
            <div className="quote-title-row">
              <h2 className="quote-symbol chart-title">{shown?.symbol ?? symbol ?? "—"}</h2>
              {shown && quote && (
                <button type="button" className="chip" onClick={() => onAddAlert(shown.symbol, quote.close)} title={t("這檔股票到某個價格時提醒我")}>
                  {t("🔔 ＋ 提醒")}
                </button>
              )}
              {shown && (
                <a className="chip" href={compareHref(shown.symbol === "VOO" ? ["VOO", "QQQ"] : [shown.symbol, "VOO"])} title={t("和其他股票比較走勢")}>
                  {t("📈 比較")}
                </a>
              )}
            </div>
            {quote && (
              <div className="quote-price">
                <span className="num quote-last">{fmtFixed(quote.close, 2)}</span>
                <span className={`num quote-chg ${pnlClass(quote.chg, redUp)}`}>
                  {t("{0}{1}　{2}{3}%", [quote.chg >= 0 ? "+" : "", quote.chg.toFixed(2), quote.pct >= 0 ? "+" : "", quote.pct.toFixed(2)])}
                </span>
              </div>
            )}
          </div>
          {quote && (
            <dl className="quote-stats num">
              <div>
                <dt>{t("開盤")}</dt>
                <dd>{fmtFixed(quote.open, 2)}</dd>
              </div>
              <div>
                <dt>{t("最高")}</dt>
                <dd>{fmtFixed(quote.high, 2)}</dd>
              </div>
              <div>
                <dt>{t("最低")}</dt>
                <dd>{fmtFixed(quote.low, 2)}</dd>
              </div>
              <div>
                <dt>{t("昨收")}</dt>
                <dd>{fmtFixed(quote.prev, 2)}</dd>
              </div>
              <div>
                <dt>{t("成交量")}</dt>
                <dd>{fmtVolume(quote.volume)}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="card chart-card">
          <ChartToolbar
            timeframe={route.timeframe}
            onTimeframe={(tf) => symbol && navigate(symbol, tf)}
            overlays={overlays}
            onOverlays={setOverlays}
          />
          <DrawingTools
            mode={drawMode}
            onMode={(m) => {
              setDrawMode(m);
              setPending(null);
            }}
            count={drawings.length}
            waiting={pending !== null}
            onUndo={() => saveDrawings(drawings.slice(0, -1))}
            onClear={() => {
              if (window.confirm(t("刪除 {0} {1}上畫的 {2} 條線？", [symbol ?? "", route.timeframe === "daily" ? t("日線") : route.timeframe === "weekly" ? t("週線") : t("月線"), drawings.length]))) saveDrawings([]);
            }}
          />
          {tickerError ? (
            <p className="error chart-placeholder">{t("此股票資料讀取失敗：{0}", [tickerError])}</p>
          ) : series ? (
            <StockChart
              data={series}
              timeframe={route.timeframe}
              overlays={overlays}
              redUp={redUp}
              projection={showTrend ? projection : null}
              drawings={drawings}
              pendingPoint={pending}
              onChartClick={drawMode === "none" ? undefined : onChartClick}
            />
          ) : (
            <div className="chart-placeholder muted">{loading || !index ? t("載入中…") : t("請選擇股票")}</div>
          )}
        </div>

        {series && <StatusCards data={series} timeframe={route.timeframe} redUp={redUp} />}

        {shown && quote && <FundamentalsCard data={shown.fundamentals} close={quote.close} currency={shown.currency} sample={shown.sample} />}

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
