// 第四階段：組合分析頁
//
// 資料流：
//   投資組合頁存的持股（localStorage）→ 依目前美元市值算出「目前權重」
//   每檔的日線收盤價 → 台股用歷史匯率換成美元 → 對齊日期
//     ├─ analyze()     → 加權 Beta、Jensen's Alpha、最大回撤、相關係數、CAPM
//     ├─ maxSharpe()   → 夏普值最佳化的建議權重（5%～45%）
//     └─ buyAndHold()  → 從使用者選的起始日買進持有，和 VOO 比較（修正 #5）

import { useEffect, useMemo, useState } from "react";
import BacktestChart from "../components/analysis/BacktestChart";
import CorrelationHeatmap from "../components/analysis/CorrelationHeatmap";
import WeightsCompare from "../components/analysis/WeightsCompare";
import {
  alignSeries,
  analyze,
  backtestStats,
  buyAndHold,
  convertToUsd,
  maxSharpe,
  portfolioPerf,
  sliceFrom,
  type PriceSeries,
} from "../lib/analytics";
import { loadFxHistory, loadTicker } from "../lib/data";
import { fmtFixed, fmtMoney, fmtPct, pnlClass } from "../lib/format";
import { computePortfolio, type Quote } from "../lib/portfolio";
import { loadHoldings, loadSettings } from "../lib/portfolioStore";
import { PORTFOLIO_HREF, chartHref } from "../lib/route";
import { useStoredState } from "../lib/storage";
import type { IndexData } from "../lib/types";

const MARKET = "VOO";
const W_LO = 0.05;
const W_HI = 0.45;
const DEFAULT_RF = 0.04;
const INITIAL = 10_000;

type Period = "1y" | "3y" | "5y";
const PERIOD_YEARS: Record<Period, number> = { "1y": 1, "3y": 3, "5y": 5 };
type WeightSource = "current" | "suggested" | "equal";

interface Props {
  index: IndexData | null;
  redUp: boolean;
}

function yearsBefore(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/** 讀取每檔股票的日線並換成美元 */
function useUsdPrices(symbols: string[], index: IndexData | null) {
  const [state, setState] = useState<{
    series: Record<string, PriceSeries>;
    failed: string[];
    approxFx: boolean;
    loading: boolean;
  }>({ series: {}, failed: [], approxFx: false, loading: true });
  const key = symbols.join(",");

  useEffect(() => {
    if (!index) return;
    let cancelled = false;
    (async () => {
      const fxHist = await loadFxHistory();
      const results = await Promise.allSettled(symbols.map((s) => loadTicker(s)));
      const series: Record<string, PriceSeries> = {};
      const failed: string[] = [];
      let approxFx = false;
      results.forEach((r, i) => {
        const s = symbols[i];
        if (r.status !== "fulfilled") return failed.push(s);
        const usd = convertToUsd(
          { time: r.value.daily.time, close: r.value.daily.close },
          r.value.currency,
          fxHist?.USDTWD ?? null,
          index.fx?.USDTWD,
        );
        if (!usd) return failed.push(s);
        if (usd.approx) approxFx = true;
        series[s] = usd.series;
      });
      if (!cancelled) setState({ series, failed, approxFx, loading: false });
    })();
    return () => {
      cancelled = true;
    };
    // key 代表 symbols 的內容（陣列每次都是新的，用字串比較才不會重複讀取）
  }, [key, index]);

  return state;
}

export default function AnalysisPage({ index, redUp }: Props) {
  // 持股只在打開頁面時讀一次（在投資組合頁修改後，切回來就會重新讀）
  const [{ holdings, isSample }] = useState(loadHoldings);
  const [settings] = useState(loadSettings);

  const [period, setPeriod] = useStoredState<Period>("analysis:period", "1y");
  const [rfInput, setRfInput] = useState<string>("");
  const [mktInput, setMktInput] = useState<string>("");
  const [source, setSource] = useStoredState<WeightSource>("analysis:source", "current");
  const [btStart, setBtStart] = useState<string>("");

  // ---- 1. 目前權重：依美元市值（同一檔出現多次會合併）----
  const quotes = useMemo(() => {
    const q: Record<string, Quote> = {};
    for (const t of index?.tickers ?? []) q[t.symbol] = { price: t.lastClose, currency: t.currency, name: t.name, date: t.lastDate };
    return q;
  }, [index]);
  const valueBySymbol = useMemo(() => {
    const m: Record<string, number> = {};
    if (!index) return m;
    for (const r of computePortfolio(holdings, quotes, index.fx ?? {}, settings).rows) {
      if (r.marketValueUsd && r.marketValueUsd > 0) m[r.holding.symbol] = (m[r.holding.symbol] ?? 0) + r.marketValueUsd;
    }
    return m;
  }, [holdings, quotes, index, settings]);
  const held = Object.keys(valueBySymbol);
  const allSymbols = useMemo(() => Array.from(new Set([...held, MARKET])).sort(), [held.join(",")]);

  const prices = useUsdPrices(allSymbols, index);

  // ---- 2. 對齊日期、算權重 ----
  const symbols = held.filter((s) => prices.series[s]).sort();
  const fullAligned = useMemo(() => {
    if (prices.loading || !prices.series[MARKET]) return null;
    const pick: Record<string, PriceSeries> = { [MARKET]: prices.series[MARKET] };
    for (const s of symbols) pick[s] = prices.series[s];
    return alignSeries(pick);
  }, [prices, symbols.join(",")]);

  const weights = useMemo(() => {
    const total = symbols.reduce((a, s) => a + valueBySymbol[s], 0);
    const w: Record<string, number> = {};
    for (const s of symbols) w[s] = valueBySymbol[s] / total;
    return w;
  }, [symbols.join(","), valueBySymbol]);

  // 無風險利率：使用者輸入 > index.json（^IRX）> 預設 4%
  const rfAuto = index?.riskFree ?? DEFAULT_RF;
  const rfParsed = rfInput.trim() === "" ? NaN : Number(rfInput) / 100;
  const rf = Number.isFinite(rfParsed) && rfParsed >= 0 && rfParsed < 0.3 ? rfParsed : rfAuto;
  const mktParsed = mktInput.trim() === "" ? NaN : Number(mktInput) / 100;
  const mktOverride = Number.isFinite(mktParsed) && Math.abs(mktParsed) < 1 ? mktParsed : null;

  // ---- 3. 分析期間 ----
  const lastDate = fullAligned?.time[fullAligned.time.length - 1];
  const windowAligned = useMemo(() => {
    if (!fullAligned || !lastDate) return null;
    return sliceFrom(fullAligned, yearsBefore(lastDate, PERIOD_YEARS[period]));
  }, [fullAligned, lastDate, period]);

  const result = useMemo(() => {
    if (!windowAligned || symbols.length === 0 || windowAligned.time.length < 60) return null;
    return analyze(windowAligned, weights, MARKET, rf, mktOverride);
  }, [windowAligned, weights, rf, mktOverride]);

  const currentW = useMemo(() => (result ? result.symbols.map((s) => weights[s]) : []), [result, weights]);
  const opt = useMemo(() => {
    if (!result) return null;
    return maxSharpe(result.assets.map((a) => a.capm), result.cov, rf, W_LO, W_HI, currentW);
  }, [result, rf, currentW]);
  const currentPerf = result ? portfolioPerf(currentW, result.assets.map((a) => a.capm), result.cov, rf) : null;

  // ---- 4. 回測（修正 #5）----
  const firstDate = fullAligned?.time[0];
  const defaultStart = lastDate ? yearsBefore(lastDate, 1) : "";
  const start = btStart || defaultStart;
  const btWeights = useMemo(() => {
    if (!result) return null;
    if (source === "suggested" && opt?.ok) return Object.fromEntries(result.symbols.map((s, i) => [s, opt.weights[i]]));
    if (source === "equal") return Object.fromEntries(result.symbols.map((s) => [s, 1 / result.symbols.length]));
    return weights;
  }, [result, source, opt, weights]);
  const bt = useMemo(() => {
    if (!fullAligned || !btWeights || !start) return null;
    const a = sliceFrom(fullAligned, start);
    if (a.time.length < 20) return null;
    const pv = buyAndHold(a, btWeights, INITIAL);
    const bv = buyAndHold(a, { [MARKET]: 1 }, INITIAL);
    return { time: a.time, pv, bv, ps: backtestStats(a.time, pv, rf), bs: backtestStats(a.time, bv, rf) };
  }, [fullAligned, btWeights, start, rf]);

  // ---- 畫面 ----

  if (!index) return <div className="card"><p className="muted empty">載入中…</p></div>;
  if (held.length === 0) {
    return (
      <div className="card">
        <h2>組合分析</h2>
        <p className="muted empty">
          還沒有可分析的持股。請先到 <a href={PORTFOLIO_HREF}>投資組合</a> 輸入持股（需要在觀察清單內、有報價的股票）。
        </p>
      </div>
    );
  }

  return (
    <div className="analysis">
      {isSample && (
        <div className="banner" role="status">
          目前分析的是<b>範例持股</b>。到 <a href={PORTFOLIO_HREF}>投資組合</a> 輸入自己的持股後，這裡會自動改用你的資料。
        </div>
      )}

      <div className="card">
        <div className="screener-head">
          <h2>組合分析</h2>
          <div className="segmented" role="radiogroup" aria-label="分析期間">
            {(Object.keys(PERIOD_YEARS) as Period[]).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={period === p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>
                近 {PERIOD_YEARS[p]} 年
              </button>
            ))}
          </div>
        </div>
        <div className="form-grid compact">
          <label className="field">
            <span>無風險利率 %（空白 = {(rfAuto * 100).toFixed(2)}%{index.riskFree != null ? "，美國 13 週國庫券" : "，預設值"}）</span>
            <input className="text-input" type="number" inputMode="decimal" step="0.01" value={rfInput} placeholder={(rfAuto * 100).toFixed(2)} onChange={(e) => setRfInput(e.target.value)} />
          </label>
          <label className="field">
            <span>CAPM 市場預期報酬 %（空白 = 期間內 VOO 歷史年化{result ? ` ${(result.market.annReturn * 100).toFixed(1)}%` : ""}）</span>
            <input className="text-input" type="number" inputMode="decimal" step="0.1" value={mktInput} placeholder="例如 8" onChange={(e) => setMktInput(e.target.value)} />
          </label>
        </div>

        {prices.loading ? (
          <p className="muted empty">讀取價格資料中…</p>
        ) : !result ? (
          <p className="error">資料不足，無法分析（共同交易日少於 60 天，或讀不到 VOO）。</p>
        ) : (
          <>
            <p className="hint">
              期間 {result.start} ～ {result.end}，共 {result.days} 個共同交易日；比較基準 {MARKET}。
              {prices.failed.length > 0 && ` 讀取失敗、未納入：${prices.failed.join("、")}。`}
              {prices.approxFx && " ⚠️ 尚無歷史匯率資料，台股暫以最新匯率換算（下次資料更新後會自動改用歷史匯率）。"}
            </p>
            <div className="summary-grid six">
              <Stat label="加權 Beta" value={fmtFixed(result.weightedBeta, 2)} note={`${MARKET} = 1.00`} />
              <Stat
                label="Jensen's Alpha（年化）"
                value={fmtPct(result.alpha * 100, 2, true)}
                cls={pnlClass(result.alpha, redUp)}
                note="扣除市場風險後的超額報酬"
              />
              <Stat
                label="最大回撤"
                value={fmtPct(result.portfolio.maxDrawdown * 100, 1)}
                note={`${MARKET} ${fmtPct(result.market.maxDrawdown * 100, 1)}`}
              />
              <Stat
                label="年化報酬"
                value={fmtPct(result.portfolio.annReturn * 100, 1, true)}
                cls={pnlClass(result.portfolio.annReturn, redUp)}
                note={`${MARKET} ${fmtPct(result.market.annReturn * 100, 1, true)}`}
              />
              <Stat label="年化波動度" value={fmtPct(result.portfolio.annVol * 100, 1)} note={`${MARKET} ${fmtPct(result.market.annVol * 100, 1)}`} />
              <Stat label="夏普值" value={fmtFixed(result.portfolio.sharpe, 2)} note={`${MARKET} ${fmtFixed(result.market.sharpe, 2)}`} />
            </div>
            <p className="hint">
              以上用目前權重、每日維持固定比例計算，描述組合的風險特性；實際「買進持有」的結果請看下方回測。
            </p>
          </>
        )}
      </div>

      {result && (
        <div className="card">
          <h3 className="section-title">個股指標</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>股票</th>
                  <th className="num">目前權重</th>
                  <th className="num">Beta</th>
                  <th className="num">Alpha（年化）</th>
                  <th className="num">年化報酬</th>
                  <th className="num">年化波動</th>
                  <th className="num">CAPM 預期報酬</th>
                </tr>
              </thead>
              <tbody>
                {result.assets.map((a) => (
                  <tr key={a.symbol}>
                    <td>
                      <a className="stock-link" href={chartHref(a.symbol)}>
                        {a.symbol}
                      </a>
                    </td>
                    <td className="num">{fmtPct(a.weight * 100, 1)}</td>
                    <td className="num">{fmtFixed(a.beta, 2)}</td>
                    <td className={`num ${pnlClass(a.alpha, redUp)}`}>{fmtPct(a.alpha * 100, 1, true)}</td>
                    <td className={`num ${pnlClass(a.annReturn, redUp)}`}>{fmtPct(a.annReturn * 100, 1, true)}</td>
                    <td className="num">{fmtPct(a.annVol * 100, 1)}</td>
                    <td className="num">{fmtPct(a.capm * 100, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            CAPM 預期報酬 = 無風險利率 {fmtPct(rf * 100, 2)} + Beta × （市場預期報酬 {fmtPct(result.marketExpected * 100, 1)} − 無風險利率）。
          </p>
        </div>
      )}

      {result && result.symbols.length >= 2 && (
        <div className="card">
          <h3 className="section-title">相關係數熱力圖（日報酬）</h3>
          <CorrelationHeatmap symbols={result.symbols} corr={result.corr} />
          <p className="hint">相關係數越接近 1，兩檔越常同漲同跌，分散風險的效果越小。台股和美股交易時間不同，同一天的報酬並非同時發生，相關係數會偏低。</p>
        </div>
      )}

      {result && (
        <div className="card">
          <h3 className="section-title">夏普值最佳化（每檔權重 {W_LO * 100}%～{W_HI * 100}%）</h3>
          {opt && opt.ok && currentPerf ? (
            <>
              <WeightsCompare symbols={result.symbols} current={currentW} suggested={opt.weights} lo={W_LO} hi={W_HI} />
              <div className="table-scroll">
                <table className="data-table compare">
                  <thead>
                    <tr>
                      <th />
                      <th className="num">預期報酬（CAPM）</th>
                      <th className="num">預期波動</th>
                      <th className="num">夏普值</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>目前權重</td>
                      <td className="num">{fmtPct(currentPerf.expReturn * 100, 2)}</td>
                      <td className="num">{fmtPct(currentPerf.vol * 100, 2)}</td>
                      <td className="num">{fmtFixed(currentPerf.sharpe, 3)}</td>
                    </tr>
                    <tr>
                      <td>建議權重</td>
                      <td className="num">{fmtPct(opt.expReturn * 100, 2)}</td>
                      <td className="num">{fmtPct(opt.vol * 100, 2)}</td>
                      <td className="num">
                        <b>{fmtFixed(opt.sharpe, 3)}</b>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="hint">
                預期報酬用 CAPM 估計、風險用期間內的歷史共變異數。結果對假設很敏感（特別是市場預期報酬），只能當作參考方向，不是買賣建議。
              </p>
            </>
          ) : (
            <p className="muted empty">{opt?.reason ?? "無法最佳化"}</p>
          )}
        </div>
      )}

      {result && (
        <div className="card">
          <h3 className="section-title">回測：買進持有 vs {MARKET}</h3>
          <div className="form-grid compact">
            <label className="field">
              <span>起始日（最早 {firstDate}）</span>
              <input className="text-input" type="date" min={firstDate} max={lastDate} value={start} onChange={(e) => setBtStart(e.target.value)} />
            </label>
            <div className="field">
              <span>買進時的權重</span>
              <div className="segmented" role="radiogroup" aria-label="回測權重">
                {(
                  [
                    ["current", "目前權重"],
                    ["suggested", "建議權重"],
                    ["equal", "等權重"],
                  ] as [WeightSource, string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={source === k}
                    disabled={k === "suggested" && !opt?.ok}
                    className={source === k ? "active" : ""}
                    onClick={() => setSource(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {bt ? (
            <>
              <BacktestChart time={bt.time} portfolio={bt.pv} benchmark={bt.bv} benchmarkName={MARKET} />
              <div className="table-scroll">
                <table className="data-table compare">
                  <thead>
                    <tr>
                      <th />
                      <th className="num">累積報酬</th>
                      <th className="num">年化報酬</th>
                      <th className="num">最大回撤</th>
                      <th className="num">夏普值</th>
                      <th className="num">期末價值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["組合", bt.ps, "var(--s1)"],
                        [MARKET, bt.bs, "var(--s2)"],
                      ] as const
                    ).map(([name, st, color]) => (
                      <tr key={name}>
                        <td>
                          <i className="swatch" style={{ background: color }} /> {name}
                        </td>
                        <td className={`num ${pnlClass(st.totalReturn, redUp)}`}>{fmtPct(st.totalReturn * 100, 1, true)}</td>
                        <td className="num">{fmtPct(st.cagr * 100, 1, true)}</td>
                        <td className="num" title={`${st.mddPeak} → ${st.mddTrough}`}>
                          {fmtPct(st.maxDrawdown * 100, 1)}
                        </td>
                        <td className="num">{fmtFixed(st.sharpe, 2)}</td>
                        <td className="num">{fmtMoney(st.finalValue, "USD", 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">
                {bt.time[0]} 用 {fmtMoney(INITIAL, "USD", 0)} 依權重一次買進，之後不再調整（不再平衡）。價格已含除權息調整（等同股利再投入），未計手續費與稅。
                最大回撤滑鼠移上去可看起訖日期。
              </p>
            </>
          ) : (
            <p className="muted empty">起始日太接近最後一天，資料不足。</p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, note, cls = "" }: { label: string; value: string; note?: string; cls?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${cls}`}>{value}</div>
      {note && <div className="stat-note muted">{note}</div>}
    </div>
  );
}
