// 篩選結果：符合的股票在上面，點一下直接看圖。
// 也列出「不符合」的股票（預設收合），方便看每個條件差在哪裡。

import { useState } from "react";
import { chartHref } from "../../lib/route";
import type { Condition, ScreenResult } from "../../lib/screener";
import type { Timeframe } from "../../lib/types";
import { t } from "../../lib/i18n";

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
    return <p className="muted empty">{t("請新增至少一個條件，或從上方載入範例組合。")}</p>;
  }

  return (
    <div className="results">
      <h3 className="section-title">
        {t("符合條件")}{" "}<span className="count-badge">{matched.length}</span>
        <span className="muted"> {t("/ {0} 檔", [results.length])}</span>
      </h3>

      {matched.length === 0 ? (
        <p className="muted empty">{t("目前沒有股票符合。可以放寬參數，或改用「任一符合（OR）」。")}</p>
      ) : (
        <ResultList rows={matched} conditions={conditions} tf={tf} redUp={redUp} />
      )}

      {others.length > 0 && (
        <>
          <button type="button" className="btn-link" onClick={() => setShowOthers(!showOthers)} aria-expanded={showOthers}>
            {t("{0} 不符合的股票（{1}）", [showOthers ? "▾" : "▸", others.length])}
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
      {rows.map(({ ticker: tk, results }) => {
        const up = tk.changePct >= 0;
        const chgCls = tk.changePct === 0 ? "" : up === redUp ? "num-red" : "num-green";
        return (
          <li key={tk.symbol}>
            <a className="result-item" href={chartHref(tk.symbol, tf)}>
              <div className="result-head">
                <span className="result-sym">{tk.symbol}</span>
                <span className="result-name">{tk.name}</span>
                <span className="result-price">
                  {tk.lastClose.toFixed(2)} <small className="muted">{tk.currency}</small>
                </span>
                <span className={`result-chg ${chgCls}`}>
                  {up ? "+" : ""}
                  {tk.changePct.toFixed(2)}%
                </span>
                <span className="result-go" aria-hidden="true">
                  {t("看圖 ›")}
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
