// 篩選結果：符合的股票在上面，點一下直接看圖。
// 也列出「不符合」的股票（預設收合），方便看每個條件差在哪裡。

import { useState } from "react";
import { chartHref } from "../../lib/route";
import type { Condition, ScreenResult } from "../../lib/screener";
import type { Timeframe } from "../../lib/types";

interface Props {
  results: ScreenResult[];
  conditions: Condition[];
  redUp: boolean;
}

export default function ResultsTable({ results, conditions, redUp }: Props) {
  const [showOthers, setShowOthers] = useState(false);
  const matched = results.filter((r) => r.matched);
  const others = results.filter((r) => !r.matched).sort((a, b) => b.hits - a.hits);
  // 點進去看圖時，用第一個條件的週期（例如篩的是週線，就打開週線圖）
  const tf: Timeframe = conditions[0]?.tf ?? "daily";

  if (conditions.length === 0) {
    return <p className="muted empty">請新增至少一個條件，或從上方載入範例組合。</p>;
  }

  return (
    <div className="results">
      <h3 className="section-title">
        符合條件 <span className="count-badge">{matched.length}</span>
        <span className="muted"> / {results.length} 檔</span>
      </h3>

      {matched.length === 0 ? (
        <p className="muted empty">目前沒有股票符合。可以放寬參數，或改用「任一符合（OR）」。</p>
      ) : (
        <ResultList rows={matched} conditions={conditions} tf={tf} redUp={redUp} />
      )}

      {others.length > 0 && (
        <>
          <button type="button" className="btn-link" onClick={() => setShowOthers(!showOthers)} aria-expanded={showOthers}>
            {showOthers ? "▾" : "▸"} 不符合的股票（{others.length}）
          </button>
          {showOthers && <ResultList rows={others} conditions={conditions} tf={tf} redUp={redUp} dim />}
        </>
      )}
    </div>
  );
}

function ResultList({
  rows,
  conditions,
  tf,
  redUp,
  dim = false,
}: {
  rows: ScreenResult[];
  conditions: Condition[];
  tf: Timeframe;
  redUp: boolean;
  dim?: boolean;
}) {
  return (
    <ul className={`result-list${dim ? " dim" : ""}`}>
      {rows.map(({ ticker: t, results }) => {
        const up = t.changePct >= 0;
        const chgCls = t.changePct === 0 ? "" : up === redUp ? "num-red" : "num-green";
        return (
          <li key={t.symbol}>
            <a className="result-item" href={chartHref(t.symbol, tf)}>
              <div className="result-head">
                <span className="result-sym">{t.symbol}</span>
                <span className="result-name">{t.name}</span>
                <span className="result-price">
                  {t.lastClose.toFixed(2)} <small className="muted">{t.currency}</small>
                </span>
                <span className={`result-chg ${chgCls}`}>
                  {up ? "+" : ""}
                  {t.changePct.toFixed(2)}%
                </span>
                <span className="result-go" aria-hidden="true">
                  看圖 ›
                </span>
              </div>
              <div className="result-conds">
                {results.map((r, i) => (
                  <span key={conditions[i].id} className={`cond-tag ${r.matched ? "ok" : "no"}`}>
                    <b>{r.matched ? "✓" : "✗"}</b> {i + 1}. {r.detail}
                  </span>
                ))}
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
