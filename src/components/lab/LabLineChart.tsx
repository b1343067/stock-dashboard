// ML 實驗室用的多線圖（lightweight-charts）：預測 vs 實際、策略累積報酬
// 線色用類別色 --s1～--s4（已用驗證工具檢查過），圖例直接寫名稱和數值，不只靠顏色辨識。

import { useEffect, useRef, useState } from "react";
import { ColorType, LineSeries, createChart, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import { locale } from "../../lib/i18n";
import { useThemeColors } from "../../lib/theme";

export interface LabLine {
  name: string;
  /** s1～s4 */
  slot: "s1" | "s2" | "s3" | "s4";
  time: string[];
  values: number[];
  dashed?: boolean;
}

interface Props {
  lines: LabLine[];
  /** 數值顯示格式，例如 (v) => `${v.toFixed(1)}%` */
  format: (v: number) => string;
  /** 加一條 0 的參考線（累積報酬用） */
  zeroLine?: boolean;
  label: string;
}

export default function LabLineChart({ lines, format, zeroLine = false, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const colors = useThemeColors();
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, attributionLogo: false },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      localization: { locale: locale(), dateFormat: "yyyy-MM-dd", priceFormatter: format },
    });
    chart.subscribeCrosshairMove((p) => setHover(p.time ? String(p.time) : null));
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = [];
    };
  }, [format]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({ layout: { textColor: colors.text, fontFamily: colors.font }, grid: { vertLines: { visible: false }, horzLines: { color: colors.grid } } });
    for (const s of seriesRef.current) chart.removeSeries(s);
    seriesRef.current = lines.map((l, i) => {
      const s = chart.addSeries(LineSeries, { color: colors[l.slot], lineWidth: 2, lineStyle: l.dashed ? 2 : 0, priceLineVisible: false, lastValueVisible: false });
      s.setData(l.time.map((t, k) => ({ time: t as Time, value: l.values[k] })));
      if (i === 0 && zeroLine) s.createPriceLine({ price: 0, color: colors.muted, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      return s;
    });
    chart.timeScale().fitContent();
  }, [lines, colors, zeroLine]);

  const legend = lines.map((l) => {
    const i = hover ? l.time.indexOf(hover) : l.time.length - 1;
    return { name: l.name, slot: l.slot, v: i >= 0 ? l.values[i] : null };
  });

  return (
    <div className="cmp-chart" role="img" aria-label={label}>
      <div className="bt-legend" aria-live="polite">
        <span className="legend-date">{hover ?? lines[0]?.time.at(-1)}</span>
        {legend.map((x) => (
          <span key={x.name}>
            <i className="swatch" style={{ background: `var(--${x.slot})` }} /> {x.name} <b>{x.v === null ? "—" : format(x.v)}</b>
          </span>
        ))}
      </div>
      <div className="cmp-canvas" ref={ref} />
    </div>
  );
}
