// 回測淨值曲線：組合 vs VOO，兩條線都換算成「累積報酬 %」，共用同一個座標軸。

import { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, LineSeries, createChart, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import { useThemeColors } from "../../lib/theme";
import { t, locale } from "../../lib/i18n";

interface Props {
  time: string[];
  portfolio: number[];
  benchmark: number[];
  benchmarkName: string;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export default function BacktestChart({ time, portfolio, benchmark, benchmarkName }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{ p: ISeriesApi<"Line">; b: ISeriesApi<"Line"> } | null>(null);
  const colors = useThemeColors();
  const [hover, setHover] = useState<number | null>(null);

  // 換算成累積報酬 %：(當天淨值 ÷ 第一天淨值 − 1) × 100
  const pRet = useMemo(() => portfolio.map((v) => (v / portfolio[0] - 1) * 100), [portfolio]);
  const bRet = useMemo(() => benchmark.map((v) => (v / benchmark[0] - 1) * 100), [benchmark]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, attributionLogo: false },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      localization: { locale: locale(), dateFormat: "yyyy-MM-dd", priceFormatter: (v: number) => pct(v) },
      handleScroll: false,
      handleScale: false,
    });
    const opts = { lineWidth: 2 as const, priceLineVisible: false };
    const p = chart.addSeries(LineSeries, { ...opts, title: t("組合") });
    const b = chart.addSeries(LineSeries, { ...opts, title: benchmarkName });
    // 0% 基準線
    p.createPriceLine({ price: 0, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    chart.subscribeCrosshairMove((param) => setHover(param.logical === undefined || !param.point ? null : Math.round(param.logical)));
    chartRef.current = chart;
    seriesRef.current = { p, b };
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [benchmarkName]);

  useEffect(() => {
    const chart = chartRef.current;
    const s = seriesRef.current;
    if (!chart || !s) return;
    chart.applyOptions({
      layout: { textColor: colors.text, fontFamily: colors.font },
      grid: { vertLines: { visible: false }, horzLines: { color: colors.grid } },
    });
    s.p.applyOptions({ color: colors.s1 });
    s.b.applyOptions({ color: colors.s2 });
    for (const pl of s.p.priceLines()) pl.applyOptions({ color: colors.muted });
  }, [colors]);

  useEffect(() => {
    const chart = chartRef.current;
    const s = seriesRef.current;
    if (!chart || !s) return;
    s.p.setData(time.map((t, i) => ({ time: t as Time, value: pRet[i] })));
    s.b.setData(time.map((t, i) => ({ time: t as Time, value: bRet[i] })));
    chart.timeScale().fitContent();
  }, [time, pRet, bRet]);

  const i = hover === null || hover < 0 || hover >= time.length ? time.length - 1 : hover;

  return (
    <div className="bt-chart">
      <div className="bt-legend" aria-live="polite">
        <span className="legend-date">{time[i]}</span>
        <span>
          <i className="swatch" style={{ background: "var(--s1)" }} /> {" "}{t("組合")}{" "}<b>{pct(pRet[i])}</b>
        </span>
        <span>
          <i className="swatch" style={{ background: "var(--s2)" }} /> {benchmarkName} <b>{pct(bRet[i])}</b>
        </span>
      </div>
      <div className="bt-canvas" ref={ref} />
    </div>
  );
}
