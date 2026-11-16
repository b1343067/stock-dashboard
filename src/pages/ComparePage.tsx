// 多檔走勢比較：最多 4 檔，從同一天起算累積報酬 %，畫在同一張圖上
// 網址 #/compare/NVDA,AMD,TSM，可以直接分享。計算邏輯在 src/lib/compare.ts。

import { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, LineSeries, createChart, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import { MAX_COMPARE, RANGE_LABEL, compareStats, normalize, parseSymbols, rangeStart, type Normalized, type Range } from "../lib/compare";
import { loadTicker } from "../lib/data";
import { fmtPct, pnlClass } from "../lib/format";
import { chartHref, compareHref } from "../lib/route";
import { useStoredState } from "../lib/storage";
import { useThemeColors } from "../lib/theme";
import type { IndexData, TickerData } from "../lib/types";
import { matchesQuery } from "../lib/watchlist";
import { t, locale } from "../lib/i18n";

// 固定順序的類別色（第 1 檔藍、第 2 檔橘、第 3 檔青綠、第 4 檔黃）
const SLOTS = ["s1", "s2", "s3", "s4"] as const;
const DEFAULT_SYMBOLS = ["VOO", "QQQ"];

interface Props {
  index: IndexData | null;
  /** 網址裡的代號字串（逗號分隔） */
  symbolsParam: string | null;
  redUp: boolean;
}

export default function ComparePage({ index, symbolsParam, redUp }: Props) {
  const symbols = useMemo(() => {
    const s = parseSymbols(symbolsParam);
    return s.length ? s : DEFAULT_SYMBOLS;
  }, [symbolsParam]);
  const [range, setRange] = useStoredState<Range>("compare:range", "1y");
  const [data, setData] = useState<Record<string, TickerData>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const colors = useThemeColors();

  // 只下載有選的股票（已經下載過的會用快取）
  useEffect(() => {
    let cancelled = false;
    for (const s of symbols) {
      if (data[s] || errors[s]) continue;
      loadTicker(s)
        .then((d) => !cancelled && setData((m) => ({ ...m, [s]: d })))
        .catch((e: unknown) => !cancelled && setErrors((m) => ({ ...m, [s]: e instanceof Error ? e.message : String(e) })));
    }
    return () => {
      cancelled = true;
    };
  }, [symbols]); // eslint 沒裝，這裡刻意只在選的股票改變時讀取

  const setSymbols = (next: string[]) => {
    window.location.hash = compareHref(next.slice(0, MAX_COMPARE));
  };

  // 共同的起始日：以「各檔最後交易日中最晚的那天」往回推，台股、美股才會對齊同一段期間
  const lastDate = symbols.map((s) => data[s]?.lastDate).filter(Boolean).sort().at(-1) as string | undefined;
  const start = lastDate ? rangeStart(lastDate, range) : null;
  const lines = useMemo(() => {
    const out: { symbol: string; color: string; n: Normalized; name: string }[] = [];
    symbols.forEach((s, i) => {
      const d = data[s];
      if (!d || !start) return;
      out.push({ symbol: s, name: d.name, color: colors[SLOTS[i]], n: normalize(d.daily.time, d.daily.close, start) });
    });
    return out;
  }, [symbols, data, start, colors]);

  const suggestions = useMemo(
    () => (query.trim() ? (index?.tickers ?? []).filter((t) => !symbols.includes(t.symbol) && matchesQuery(t, query)).slice(0, 6) : []),
    [query, index, symbols],
  );

  return (
    <div className="compare">
      <div className="market-head">
        <div>
          <h2>{t("走勢比較")}</h2>
          <p className="muted small">{t("最多 {0} 檔，從同一天起算累積報酬（各自用原幣計算；台股為台幣報酬）。", [MAX_COMPARE])}</p>
        </div>
        <div className="segmented" role="radiogroup" aria-label={t("期間")}>
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={range === r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
              {t(RANGE_LABEL[r])}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="cmp-picks">
          {symbols.map((s, i) => (
            <span key={s} className="cmp-chip" style={{ borderColor: `var(--${SLOTS[i]})` }}>
              <i className="swatch" style={{ background: `var(--${SLOTS[i]})` }} />
              <a href={chartHref(s)}>{s}</a>
              {symbols.length > 1 && (
                <button type="button" aria-label={t("移除 {0}", [s])} onClick={() => setSymbols(symbols.filter((x) => x !== s))}>
                  ×
                </button>
              )}
            </span>
          ))}
          {symbols.length < MAX_COMPARE && (
            <div className="cmp-add">
              <input
                className="text-input"
                placeholder={t("＋ 加入比較（代號或名稱）")}
                aria-label={t("加入比較的股票")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && suggestions[0]) {
                    setSymbols([...symbols, suggestions[0].symbol]);
                    setQuery("");
                  }
                }}
              />
              {suggestions.length > 0 && (
                <ul className="qs-list" role="listbox">
                  {suggestions.map((t) => (
                    <li key={t.symbol}>
                      <button
                        type="button"
                        onClick={() => {
                          setSymbols([...symbols, t.symbol]);
                          setQuery("");
                        }}
                      >
                        <b>{t.symbol}</b>
                        <span className="muted">{t.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {Object.entries(errors)
          .filter(([s]) => symbols.includes(s))
          .map(([s, e]) => (
            <p key={s} className="error small">
              {t("{0} 讀取失敗：{1}", [s, e])}
            </p>
          ))}

        {lines.length === 0 ? (
          <div className="chart-placeholder muted">{t("載入中…")}</div>
        ) : (
          <CompareChart lines={lines} />
        )}

        <div className="table-scroll">
          <table className="data-table cmp-table">
            <thead>
              <tr>
                <th>{t("股票")}</th>
                <th className="num">{t("累積報酬")}</th>
                <th className="num">{t("年化波動")}</th>
                <th className="num">{t("最大回撤")}</th>
                <th>{t("期間")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const st = compareStats(l.n);
                return (
                  <tr key={l.symbol}>
                    <td>
                      <i className="swatch" style={{ background: l.color }} /> <b>{l.symbol}</b> <span className="muted small">{l.name}</span>
                    </td>
                    <td className={`num ${pnlClass(st?.totalReturn, redUp)}`}>{fmtPct(st?.totalReturn, 2, true)}</td>
                    <td className="num">{fmtPct(st?.annVol, 1)}</td>
                    <td className="num">{fmtPct(st?.maxDrawdown, 1)}</td>
                    <td className="muted small">{st ? t("{0} ～ {1}", [st.start, st.end]) : t("資料不足")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">{t("價格已含除權息調整。日線資料最多約 5 年。")}</p>
      </div>
    </div>
  );
}

/** 多條累積報酬 % 線，共用同一個座標軸；每條線右端有代號標籤 */
function CompareChart({ lines }: { lines: { symbol: string; color: string; n: Normalized }[] }) {
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
      localization: { locale: locale(), dateFormat: "yyyy-MM-dd", priceFormatter: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` },
    });
    chart.subscribeCrosshairMove((p) => setHover(p.time ? String(p.time) : null));
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: { textColor: colors.text, fontFamily: colors.font },
      grid: { vertLines: { visible: false }, horzLines: { color: colors.grid } },
    });
    for (const s of seriesRef.current) chart.removeSeries(s);
    seriesRef.current = lines.map((l, i) => {
      const s = chart.addSeries(LineSeries, { color: l.color, lineWidth: 2, priceLineVisible: false, title: l.symbol });
      s.setData(l.n.time.map((t, k) => ({ time: t as Time, value: l.n.pct[k] })));
      if (i === 0) s.createPriceLine({ price: 0, color: colors.muted, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      return s;
    });
    chart.timeScale().fitContent();
  }, [lines, colors]);

  // 圖例：滑鼠指到的日期（或最新）各檔的報酬
  const legend = lines.map((l) => {
    const i = hover ? l.n.time.findIndex((t) => t >= hover) : l.n.time.length - 1;
    const v = i >= 0 ? l.n.pct[i] : null;
    return { symbol: l.symbol, color: l.color, v };
  });

  return (
    <div className="cmp-chart">
      <div className="bt-legend" aria-live="polite">
        <span className="legend-date">{hover ?? lines[0]?.n.time.at(-1)}</span>
        {legend.map((x) => (
          <span key={x.symbol}>
            <i className="swatch" style={{ background: x.color }} /> {x.symbol} <b>{x.v === null ? "—" : `${x.v >= 0 ? "+" : ""}${x.v.toFixed(2)}%`}</b>
          </span>
        ))}
      </div>
      <div className="cmp-canvas" ref={ref} />
    </div>
  );
}
