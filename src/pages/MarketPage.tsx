// 市場總覽（網站打開的第一頁）
// 只用 index.json（每檔最新價、漲跌、最近 30 天收盤），不用另外下載各股資料，所以打開很快。
// 計算邏輯在 src/lib/market.ts。

import { useMemo } from "react";
import Sparkline from "../components/Sparkline";
import { fmtFixed, pnlClass } from "../lib/format";
import { breadth, categoryStats, heatIntensity, periodChange, topMovers, type Mover, type Period } from "../lib/market";
import { chartHref, compareHref } from "../lib/route";
import { useStoredState } from "../lib/storage";
import type { IndexData, TickerSummary } from "../lib/types";
import { t } from "../lib/i18n";

// 上方「大盤指標」卡片要顯示哪些（不在觀察清單裡的會自動略過）
const BENCHMARKS = ["VOO", "QQQ", "VT", "0050.TW", "BND", "GLD"];
const PERIOD_LABEL: Record<Period, string> = { day: "今日", month: "近 30 天" };

interface Props {
  index: IndexData | null;
  indexError: string | null;
  redUp: boolean;
}

const sign = (v: number) => (v >= 0.005 ? "+" : "");
/** 漲跌幅文字：接近 0 時顯示 0.00%，避免出現「-0.00%」 */
const pctText = (v: number, d = 2) => `${sign(v)}${(Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d)}%`;

export default function MarketPage({ index, indexError, redUp }: Props) {
  const [period, setPeriod] = useStoredState<Period>("market:period", "day");
  const tickers = useMemo(() => index?.tickers ?? [], [index]);

  const b = useMemo(() => breadth(tickers, period), [tickers, period]);
  const gainers = useMemo(() => topMovers(tickers, period, 5, "up"), [tickers, period]);
  const losers = useMemo(() => topMovers(tickers, period, 5, "down"), [tickers, period]);
  const cats = useMemo(() => categoryStats(tickers, index?.categories ?? [], period), [tickers, index, period]);
  const benches = BENCHMARKS.map((s) => tickers.find((t) => t.symbol === s)).filter((t): t is TickerSummary => !!t);

  // 「漲」的顏色、「跌」的顏色（跟著紅漲綠跌設定）
  const upVar = redUp ? "var(--red)" : "var(--green)";
  const downVar = redUp ? "var(--green)" : "var(--red)";
  const color = (v: number) => (v >= 0 ? upVar : downVar);

  if (indexError) return <div className="card"><p className="error">{t("無法讀取市場資料：{0}", [indexError])}</p></div>;
  if (!index) return <div className="card"><p className="muted empty">{t("載入中…")}</p></div>;

  // 資料日期：美股、台股收盤日可能不同，分開顯示
  const usDate = maxDate(tickers.filter((t) => t.currency !== "TWD"));
  const twDate = maxDate(tickers.filter((t) => t.currency === "TWD"));
  const maxAvg = Math.max(0.01, ...cats.map((c) => Math.abs(c.avg)));

  return (
    <div className="market">
      <div className="market-head">
        <div>
          <h2>{t("市場總覽")}</h2>
          <p className="muted small">
            {t("{0} 檔 · 美股 {1} 收盤{2}", [tickers.length, usDate ?? "—", twDate ? t(" · 台股 {0} 收盤", [twDate]) : ""])}
          </p>
        </div>
        <div className="segmented" role="radiogroup" aria-label={t("期間")}>
          {(["day", "month"] as Period[]).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={period === p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>
              {t(PERIOD_LABEL[p])}
            </button>
          ))}
        </div>
      </div>

      {/* 大盤指標 */}
      <div className="bench-head">
        <h3 className="section-title">{t("大盤指標")}</h3>
        <a className="btn-link" href={compareHref(benches.slice(0, 4).map((t) => t.symbol))}>
          {t("比較走勢 →")}
        </a>
      </div>
      <section className="bench-grid" aria-label={t("大盤指標")}>
        {benches.map((t) => {
          const c = periodChange(t, period);
          return (
            <a key={t.symbol} className="card bench" href={chartHref(t.symbol)}>
              <div className="bench-top">
                <b>{t.symbol}</b>
                <span className="muted bench-name">{t.name}</span>
              </div>
              <div className="bench-price num">{fmtFixed(t.lastClose, 2)}</div>
              <div className={`num bench-chg ${pnlClass(c, redUp)}`}>{c === null ? "—" : `${sign(c)}${c.toFixed(2)}%`}</div>
              {t.spark && <Sparkline values={t.spark} color={color((t.spark.at(-1) ?? 0) - t.spark[0])} width={160} height={36} />}
            </a>
          );
        })}
      </section>

      <div className="market-row">
        {/* 市場寬度 */}
        <section className="card breadth-card">
          <h3 className="section-title">{t("漲跌家數")}{" "}<small className="muted">{t(PERIOD_LABEL[period])}</small></h3>
          <div className="breadth-nums num">
            <div>
              <span className="breadth-n" style={{ color: upVar }}>{b.up}</span>
              <span className="muted">{t("上漲")}</span>
            </div>
            <div>
              <span className="breadth-n" style={{ color: downVar }}>{b.down}</span>
              <span className="muted">{t("下跌")}</span>
            </div>
            <div>
              <span className="breadth-n" style={{ color: "var(--text-3)" }}>{b.flat}</span>
              <span className="muted">{t("平盤")}</span>
            </div>
          </div>
          <div className="breadth-bar" role="img" aria-label={t("上漲 {0} 檔、下跌 {1} 檔、平盤 {2} 檔", [b.up, b.down, b.flat])}>
            <span style={{ flex: b.up, background: upVar }} />
            <span style={{ flex: b.flat, background: "var(--border-2)" }} />
            <span style={{ flex: b.down, background: downVar }} />
          </div>
          <p className="hint">
            {t("{0}只統計觀察清單裡的 {1} 檔。", [b.upPct === null ? "" : b.upPct >= 60 ? t("多數股票上漲，市場偏強。") : b.upPct <= 40 ? t("多數股票下跌，市場偏弱。") : t("漲跌家數接近，市場沒有明顯方向。"), b.up + b.down + b.flat])}
          </p>
        </section>

        {/* 漲跌幅排行 */}
        <section className="card movers-card">
          <MoverList title={t("漲幅前 {0} 名", [gainers.length || 5])} rows={gainers} redUp={redUp} empty={t("沒有上漲的股票")} />
          <MoverList title={t("跌幅前 {0} 名", [losers.length || 5])} rows={losers} redUp={redUp} empty={t("沒有下跌的股票")} />
        </section>
      </div>

      {/* 分類平均漲跌：以 0 為中心，往右是漲、往左是跌 */}
      <section className="card">
        <h3 className="section-title">{t("各分類平均漲跌")}{" "}<small className="muted">{t("{0} · 等權重平均", [t(PERIOD_LABEL[period])])}</small></h3>
        <ul className="cat-bars">
          {cats.map((c) => {
            const w = (Math.abs(c.avg) / maxAvg) * 50;
            return (
              <li key={c.name}>
                <span className="cat-name">{t(c.name)}</span>
                <span className="cat-track" aria-hidden="true">
                  <span className="cat-zero" />
                  <span className="cat-fill" style={{ width: `${w}%`, background: color(c.avg), [c.avg >= 0 ? "left" : "right"]: "50%" }} />
                </span>
                <span className={`num cat-val ${pnlClass(c.avg, redUp)}`}>{pctText(c.avg)}</span>
                <span className="muted small cat-count">
                  {t("{0}/{1} 漲", [c.up, c.count])}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 類股熱力圖：每個分類一區，格子顏色越深代表漲跌越大 */}
      <section className="card">
        <div className="heat-head">
          <h3 className="section-title">{t("類股熱力圖")}{" "}<small className="muted">{t(PERIOD_LABEL[period])}</small></h3>
          <span className="heat-legend small muted" aria-hidden="true">
            {t("跌")}{" "}<i style={{ background: downVar }} /> <i style={{ background: "var(--surface-3)" }} /> <i style={{ background: upVar }} /> {" "}{t("漲")}
          </span>
        </div>
        <div className="heat-groups">
          {cats.map((c) => (
            <div key={c.name} className="heat-group">
              <div className="heat-group-name">{t(c.name)}</div>
              <div className="heat-tiles">
                {c.members.map((m) => {
                  const k = heatIntensity(m.change, period);
                  return (
                    <a
                      key={m.ticker.symbol}
                      href={chartHref(m.ticker.symbol)}
                      className={`heat-tile${k > 0.55 ? " strong" : ""}`}
                      style={{ background: `color-mix(in oklab, ${color(m.change)} ${Math.round(12 + k * 78)}%, var(--surface-2))` }}
                      title={t("{0} {1}：{2}{3}%", [m.ticker.symbol, m.ticker.name, sign(m.change), m.change.toFixed(2)])}
                    >
                      <b>{m.ticker.symbol.replace(/\.TWO?$/, "")}</b>
                      <span className="num">{pctText(m.change, 1)}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="hint">{t("每格一檔股票（大小相同）；顏色越深代表{0}的程度越接近。點一下看 K 線。", [period === "day" ? t("今日漲跌超過 3%") : t("30 天漲跌超過 15%")])}</p>
      </section>
    </div>
  );
}

function MoverList({ title, rows, redUp, empty }: { title: string; rows: Mover[]; redUp: boolean; empty: string }) {
  return (
    <div className="movers">
      <h3 className="section-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ol>
          {rows.map((m) => (
            <li key={m.ticker.symbol}>
              <a href={chartHref(m.ticker.symbol)}>
                <b>{m.ticker.symbol}</b>
                <span className="muted mover-name">{m.ticker.name}</span>
                <span className="num mover-price">{fmtFixed(m.ticker.lastClose, 2)}</span>
                <span className={`num mover-chg ${pnlClass(m.change, redUp)}`}>
                  {sign(m.change)}
                  {m.change.toFixed(2)}%
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function maxDate(list: TickerSummary[]): string | null {
  return list.reduce<string | null>((m, t) => (m === null || t.lastDate > m ? t.lastDate : m), null);
}
