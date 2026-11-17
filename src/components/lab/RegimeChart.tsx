// ML 實驗室 ③：大盤價格線，依每天的市場狀態上色（每一段的顏色 = 那天的狀態），下方有圖例
// 只靠顏色不夠：圖例寫名稱、滑鼠指到時顯示那天的狀態名稱。

import { useEffect, useRef, useState } from "react";
import { ColorType, LineSeries, createChart, type IChartApi, type Time } from "lightweight-charts";
import { locale, t } from "../../lib/i18n";
import { REGIME_COLOR, type RegimeMarket } from "../../lib/ml";
import { useThemeColors } from "../../lib/theme";

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export default function RegimeChart({ market }: { market: RegimeMarket }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const colors = useThemeColors();
  const [hover, setHover] = useState<number | null>(null);
  const tl = market.timeline;
  const names = Object.fromEntries(market.states.map((s) => [s.key, s.name]));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, attributionLogo: false, textColor: colors.text, fontFamily: colors.font },
      grid: { vertLines: { visible: false }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      localization: { locale: locale(), dateFormat: "yyyy-MM-dd" },
    });
    const s = chart.addSeries(LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    s.setData(tl.time.map((tm, i) => ({ time: tm as Time, value: tl.close[i], color: cssVar(REGIME_COLOR[tl.state[i]]) })));
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => setHover(p.time ? tl.time.indexOf(String(p.time)) : null));
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [tl, colors]);

  const i = hover !== null && hover >= 0 ? hover : tl.time.length - 1;
  return (
    <div className="cmp-chart" role="img" aria-label={t("{0} 價格與市場狀態", [t(market.label)])}>
      <div className="bt-legend" aria-live="polite">
        <span className="legend-date">{tl.time[i]}</span>
        <span>
          <b>{tl.close[i]}</b>　<i className="swatch" style={{ background: `var(${REGIME_COLOR[tl.state[i]]})` }} /> {t(names[tl.state[i]] ?? tl.state[i])}
        </span>
      </div>
      <div className="cmp-canvas" ref={ref} />
      <div className="regime-legend">
        {market.states.map((s) => (
          <span key={s.key}>
            <i className="swatch" style={{ background: `var(${REGIME_COLOR[s.key]})` }} /> {t(s.name)}
          </span>
        ))}
      </div>
    </div>
  );
}
