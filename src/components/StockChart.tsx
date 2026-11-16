// K 線圖元件（使用 TradingView 的 lightweight-charts v5）
//
// 版面分「窗格（pane）」：
//   第 0 格：K 線 + 成交量 + 均線 + 布林通道
//   MACD、RSI 窗格預設收起來，展開時依序加在下方（柱狀體 + 快慢線；RSI 含 70 / 30 參考線）
// 三格共用同一條時間軸，所以縮放、拖曳會同步。

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { OverlayKey, SeriesData, Timeframe } from "../lib/types";
import { useThemeColors, type ChartColors } from "../lib/theme";

interface Props {
  data: SeriesData;
  timeframe: Timeframe;
  overlays: Record<OverlayKey, boolean>;
  /** true = 紅漲綠跌（台灣習慣）；false = 綠漲紅跌（歐美習慣） */
  redUp: boolean;
  /** 價格顯示的小數位數（台股、美股都用 2） */
  precision?: number;
  /** 短期趨勢外推的虛線（第一個點是最後一根收盤，接著是未來的交易日）；只在日線顯示 */
  projection?: { time: string; value: number }[] | null;
}

// 各週期一開始顯示多少根 K 棒
const INITIAL_BARS: Record<Timeframe, number> = { daily: 120, weekly: 104, monthly: 120 };

type LineKey = "ma10" | "ma20" | "ma50" | "ma200" | "bbUpper" | "bbMiddle" | "bbLower";

interface SeriesRefs {
  candle: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  lines: Record<LineKey, ISeriesApi<"Line">>;
  // MACD、RSI 只有展開時才建立（收起來時是 null）
  macdHist: ISeriesApi<"Histogram"> | null;
  macd: ISeriesApi<"Line"> | null;
  signal: ISeriesApi<"Line"> | null;
  rsi: ISeriesApi<"Line"> | null;
  projection: ISeriesApi<"Line">;
}

/** 把「可能是 null 的陣列」轉成 lightweight-charts 的格式；null 變成空白點（只有時間、沒有值） */
function toLine(time: string[], values: (number | null)[]) {
  return time.map((t, i) => {
    const v = values[i];
    return v === null || v === undefined ? { time: t as Time } : { time: t as Time, value: v };
  });
}

function upDown(c: ChartColors, redUp: boolean) {
  return redUp ? { up: c.red, down: c.green } : { up: c.green, down: c.red };
}

export default function StockChart({ data, timeframe, overlays, redUp, precision = 2, projection = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<SeriesRefs | null>(null);
  const colors = useThemeColors();
  // 滑鼠目前指到第幾根 K 棒（null = 最新一根）
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // MACD、RSI 兩格在畫面上的位置（像素），用來放標籤
  const [paneTops, setPaneTops] = useState<[number, number]>([0, 0]);
  // 下方窗格：預設收起來，按「＋MACD」「＋RSI」才展開
  const showMacd = overlays.macd;
  const showRsi = overlays.rsi;
  const macdPane = showMacd ? 1 : -1;
  const rsiPane = showRsi ? (showMacd ? 2 : 1) : -1;

  // ---- 1. 建立圖表（第一次出現、或展開／收起 MACD、RSI 時重建）----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true, // 跟著容器大小自動縮放（手機旋轉也 OK）
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        attributionLogo: false,
        panes: { enableResize: true },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 3 },
      localization: { locale: "zh-TW", dateFormat: "yyyy-MM-dd" },
    });

    const priceFormat = { type: "price" as const, precision, minMove: 1 / 10 ** precision };
    const candle = chart.addSeries(CandlestickSeries, { priceFormat }, 0);

    // 成交量：放在 K 線同一格的下方 20%，使用獨立的價格座標
    const volume = chart.addSeries(
      HistogramSeries,
      { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false },
      0,
    );
    chart.priceScale("vol", 0).applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const mkLine = (pane: number, extra: object = {}) =>
      chart.addSeries(
        LineSeries,
        { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat, ...extra },
        pane,
      );

    const lines = {
      ma10: mkLine(0),
      ma20: mkLine(0),
      ma50: mkLine(0),
      ma200: mkLine(0),
      bbUpper: mkLine(0, { lineStyle: LineStyle.Dashed }),
      bbMiddle: mkLine(0, { lineStyle: LineStyle.Dotted }),
      bbLower: mkLine(0, { lineStyle: LineStyle.Dashed }),
    };

    const macdFormat = { type: "price" as const, precision: 3, minMove: 0.001 };
    let macdHist: ISeriesApi<"Histogram"> | null = null;
    let macd: ISeriesApi<"Line"> | null = null;
    let signal: ISeriesApi<"Line"> | null = null;
    if (macdPane > 0) {
      macdHist = chart.addSeries(HistogramSeries, { priceFormat: macdFormat, priceLineVisible: false, lastValueVisible: false }, macdPane);
      macd = mkLine(macdPane, { priceFormat: macdFormat });
      signal = mkLine(macdPane, { priceFormat: macdFormat });
    }

    let rsi: ISeriesApi<"Line"> | null = null;
    if (rsiPane > 0) {
      rsi = mkLine(rsiPane, { lineWidth: 2, lastValueVisible: true, priceFormat: { type: "price", precision: 1, minMove: 0.1 } });
      rsi.createPriceLine({ price: 70, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "" });
      rsi.createPriceLine({ price: 30, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "" });
      rsi.priceScale().applyOptions({ autoScale: false, scaleMargins: { top: 0.05, bottom: 0.05 } });
      rsi.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
    }

    // 高度比例：K 線 4、每個下方窗格 1
    const panes = chart.panes();
    panes[0]?.setStretchFactor(4);
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1);

    const onMove = (p: MouseEventParams<Time>) => {
      setHoverIndex(p.logical === undefined || p.point === undefined ? null : Math.round(p.logical));
    };
    chart.subscribeCrosshairMove(onMove);

    // 量出第 1、2 格的位置，讓 MACD / RSI 標籤貼在各自窗格的左上角
    const measure = () => {
      // 標籤是放在外層 .chart-wrap 裡，所以要用外層的頂端當基準（上方還有圖例）
      const base = (el.parentElement ?? el).getBoundingClientRect().top;
      const top = (i: number) => {
        const cell = chart.panes()[i]?.getHTMLElement();
        return cell ? cell.getBoundingClientRect().top - base : 0;
      };
      setPaneTops([macdPane > 0 ? top(macdPane) : 0, rsiPane > 0 ? top(rsiPane) : 0]);
    };
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(el);
    requestAnimationFrame(measure);

    chartRef.current = chart;
    // 趨勢外推：虛線、粗一點，最後一個點顯示價格標籤
    const proj = mkLine(0, { lineWidth: 2, lineStyle: LineStyle.Dashed, lastValueVisible: true, title: "外推" });

    seriesRef.current = { candle, volume, lines, macdHist, macd, signal, rsi, projection: proj };

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [precision, macdPane, rsiPane]);

  // ---- 2. 顏色（深色／淺色主題、紅漲綠跌設定改變時）----
  useEffect(() => {
    const chart = chartRef.current;
    const s = seriesRef.current;
    if (!chart || !s) return;
    const { up, down } = upDown(colors, redUp);

    chart.applyOptions({
      layout: { textColor: colors.text, fontFamily: colors.font, panes: { separatorColor: colors.grid } },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    });
    s.candle.applyOptions({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
    s.lines.ma10.applyOptions({ color: colors.ma10 });
    s.lines.ma20.applyOptions({ color: colors.ma20 });
    s.lines.ma50.applyOptions({ color: colors.ma50 });
    s.lines.ma200.applyOptions({ color: colors.ma200 });
    for (const k of ["bbUpper", "bbMiddle", "bbLower"] as const) s.lines[k].applyOptions({ color: colors.bb });
    s.macd?.applyOptions({ color: colors.macd });
    s.signal?.applyOptions({ color: colors.signal });
    s.rsi?.applyOptions({ color: colors.rsi });
    s.projection.applyOptions({ color: colors.s2 });
    for (const pl of s.rsi?.priceLines() ?? []) pl.applyOptions({ color: colors.muted });
    // 圖表重建（展開／收起窗格）後也要重新上色
  }, [colors, redUp, macdPane, rsiPane]);

  // ---- 3. 資料（切換股票或日/週/月線時）----
  useEffect(() => {
    const chart = chartRef.current;
    const s = seriesRef.current;
    if (!chart || !s) return;
    const { time } = data;
    const { up, down } = upDown(colors, redUp);
    const upA = withAlpha(up, 0.45);
    const downA = withAlpha(down, 0.45);

    s.candle.setData(
      time.map((t, i) => ({ time: t as Time, open: data.open[i], high: data.high[i], low: data.low[i], close: data.close[i] })),
    );
    s.volume.setData(
      time.map((t, i) => ({
        time: t as Time,
        value: data.volume[i],
        color: data.close[i] >= data.open[i] ? upA : downA,
      })),
    );
    for (const k of Object.keys(s.lines) as LineKey[]) s.lines[k].setData(toLine(time, data[k]));

    s.macdHist?.setData(
      time.map((t, i) => {
        const v = data.hist[i];
        return v === null ? { time: t as Time } : { time: t as Time, value: v, color: v >= 0 ? upA : downA };
      }),
    );
    s.macd?.setData(toLine(time, data.macd));
    s.signal?.setData(toLine(time, data.signal));
    s.rsi?.setData(toLine(time, data.rsi));
    const proj = timeframe === "daily" && projection ? projection : [];
    s.projection.setData(proj.map((p) => ({ time: p.time as Time, value: p.value })));

    // 預設顯示最近 N 根
    const n = time.length;
    const bars = INITIAL_BARS[timeframe];
    // 有外推時多留一點右邊空間，讓未來的虛線看得到
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - bars), to: n + 2 + (proj.length > 0 ? proj.length : 0) });
    setHoverIndex(null);
    // colors / redUp 也會影響成交量、柱狀體顏色
  }, [data, timeframe, colors, redUp, projection, macdPane, rsiPane]);

  // ---- 4. 疊加指標的顯示／隱藏 ----
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    s.lines.ma10.applyOptions({ visible: overlays.ma10 });
    s.lines.ma20.applyOptions({ visible: overlays.ma20 });
    s.lines.ma50.applyOptions({ visible: overlays.ma50 });
    s.lines.ma200.applyOptions({ visible: overlays.ma200 });
    for (const k of ["bbUpper", "bbMiddle", "bbLower"] as const) s.lines[k].applyOptions({ visible: overlays.bb });
  }, [overlays, macdPane, rsiPane]);

  // 圖例：顯示滑鼠指到（或最新）那一根的數值
  const legend = useMemo(() => {
    const n = data.time.length;
    const i = hoverIndex === null || hoverIndex < 0 || hoverIndex >= n ? n - 1 : hoverIndex;
    const prevClose = i > 0 ? data.close[i - 1] : data.open[i];
    return {
      time: data.time[i],
      o: data.open[i],
      h: data.high[i],
      l: data.low[i],
      c: data.close[i],
      chg: prevClose ? (data.close[i] / prevClose - 1) * 100 : 0,
      ma10: data.ma10[i],
      ma20: data.ma20[i],
      ma50: data.ma50[i],
      ma200: data.ma200[i],
      bbU: data.bbUpper[i],
      bbL: data.bbLower[i],
      macd: data.macd[i],
      signal: data.signal[i],
      hist: data.hist[i],
      rsi: data.rsi[i],
    };
  }, [data, hoverIndex]);

  const { up, down } = upDown(colors, redUp);
  const chgColor = legend.chg >= 0 ? up : down;
  const f = (v: number | null | undefined, d = precision) => (v === null || v === undefined ? "—" : v.toFixed(d));

  return (
    <div className="chart-wrap">
      <div className="chart-legend" aria-live="polite">
        <span className="legend-date">{legend.time}</span>
        <span>開 {f(legend.o)}</span>
        <span>高 {f(legend.h)}</span>
        <span>低 {f(legend.l)}</span>
        <span>
          收 <b style={{ color: chgColor }}>{f(legend.c)}</b>
        </span>
        <span style={{ color: chgColor }}>
          {legend.chg >= 0 ? "+" : ""}
          {legend.chg.toFixed(2)}%
        </span>
        <span className="legend-break" />
        {overlays.ma10 && <span style={{ color: colors.ma10 }}>MA10 {f(legend.ma10)}</span>}
        {overlays.ma20 && <span style={{ color: colors.ma20 }}>MA20 {f(legend.ma20)}</span>}
        {overlays.ma50 && <span style={{ color: colors.ma50 }}>MA50 {f(legend.ma50)}</span>}
        {overlays.ma200 && <span style={{ color: colors.ma200 }}>MA200 {f(legend.ma200)}</span>}
        {overlays.bb && (
          <span style={{ color: colors.bb }}>
            BB {f(legend.bbU)} / {f(legend.bbL)}
          </span>
        )}
      </div>
      {/* 高度依展開的窗格數調整（見 styles.css 的 .panes-0／1／2） */}
      <div className={`chart-canvas panes-${(showMacd ? 1 : 0) + (showRsi ? 1 : 0)}`} ref={containerRef} />
      {/* 下方兩格的標籤，用絕對定位疊在圖上 */}
      <div className="pane-labels" aria-hidden="true">
        {showMacd && (
          <span className="pane-label" style={{ top: paneTops[0] }}>
            MACD(12,26,9) <i style={{ color: colors.macd }}>DIF {f(legend.macd, 3)}</i>{" "}
            <i style={{ color: colors.signal }}>DEA {f(legend.signal, 3)}</i> <i>柱 {f(legend.hist, 3)}</i>
          </span>
        )}
        {showRsi && (
          <span className="pane-label" style={{ top: paneTops[1] }}>
            RSI(14) <i style={{ color: colors.rsi }}>{f(legend.rsi, 1)}</i>
          </span>
        )}
      </div>
    </div>
  );
}

/** "#rrggbb" → "rgba(r,g,b,a)" */
function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
