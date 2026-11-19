// 點角色後打開的報告面板（桌機從右側滑出、手機從底部滑出；沿用價格提醒面板的 .sheet 樣式）
// 報告內容由排程任務產生，中英文各一份；提到的股票做成看盤連結，漲跌顏色跟著紅漲綠跌設定。

import { useEffect, useRef } from "react";
import { pick, ROLE_NAME } from "../../lib/aiReport";
import { fmtPct, pnlClass } from "../../lib/format";
import { getLang, t } from "../../lib/i18n";
import { chartHref } from "../../lib/route";
import type { AiReport, AiRoleKey, ReportItem } from "../../lib/types";

interface Props {
  role: AiRoleKey;
  report: AiReport | null;
  redUp: boolean;
  onClose: () => void;
}

function Items({ items, redUp, ordered = false }: { items: ReportItem[]; redUp: boolean; ordered?: boolean }) {
  const lang = getLang();
  const List = ordered ? "ol" : "ul";
  return (
    <List className="report-items">
      {items.map((it, i) => (
        <li key={i}>
          <span>{pick(it.text, lang)}</span>
          {it.refs && it.refs.length > 0 && (
            <span className="report-refs">
              {it.refs.map((r) => (
                <a key={r.symbol} className="report-ref" href={chartHref(r.symbol)}>
                  {r.symbol}
                  {r.changePct !== undefined && <span className={`num ${pnlClass(r.changePct, redUp)}`}> {fmtPct(r.changePct)}</span>}
                </a>
              ))}
            </span>
          )}
        </li>
      ))}
    </List>
  );
}

export default function ReportPanel({ role, report, redUp, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // 打開時把焦點移到面板（鍵盤、螢幕報讀器使用者才知道面板開了），Esc 關閉
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lang = getLang();
  const r = report?.roles[role];
  const done = r?.status === "done";

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet report-sheet" role="dialog" aria-modal="true" aria-labelledby="report-title" tabIndex={-1} ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="report-title">{t(ROLE_NAME[role])}</h2>
          <button type="button" className="icon-btn" aria-label={t("關閉")} onClick={onClose}>
            ×
          </button>
        </div>
        {report?.sample && <p className="report-sample">{t("範例報告")}</p>}

        {!r || !done ? (
          <p className="muted">{t("今天休假中，沒有報告。")}</p>
        ) : (
          <>
            <p className="report-summary">{pick(r.summary, lang)}</p>
            <p className="muted small">{t("資料日期：{0}", [r.dataDate ?? "—"])}</p>
            {r.sections.map((s, i) => (
              <section key={i} className="report-section">
                <h3>{pick(s.heading, lang)}</h3>
                <Items items={s.items} redUp={redUp} />
              </section>
            ))}
            {r.bull && r.bear && (
              <div className="report-debate">
                <section className="report-section">
                  <h3>{t("偏多的理由")}</h3>
                  <Items items={r.bull} redUp={redUp} />
                </section>
                <section className="report-section">
                  <h3>{t("偏空的理由")}</h3>
                  <Items items={r.bear} redUp={redUp} />
                </section>
              </div>
            )}
            {r.points && (
              <section className="report-section">
                <h3>{t("今日重點")}</h3>
                <Items items={r.points} redUp={redUp} ordered />
              </section>
            )}
          </>
        )}
        <p className="report-disclaimer muted small">{t("AI 報告僅供學習參考，非投資建議。")}</p>
      </div>
    </div>
  );
}
