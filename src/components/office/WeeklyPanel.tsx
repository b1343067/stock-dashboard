// AI 週報面板（和每日報告同樣的 .sheet：桌機右側、手機底部滑出）
// 內容由每週一的排程任務整理上週的每日報告；還沒有正式週報時顯示範例（清楚標示）。

import { useEffect, useRef } from "react";
import { pick } from "../../lib/aiReport";
import { weekRange } from "../../lib/aiWeekly";
import { getLang, t } from "../../lib/i18n";
import type { AiWeekly } from "../../lib/types";
import { Items } from "./ReportPanel";

interface Props {
  weekly: AiWeekly;
  redUp: boolean;
  onClose: () => void;
}

export default function WeeklyPanel({ weekly, redUp, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // 打開時把焦點移到面板、Esc 關閉（和每日報告面板一樣）
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const lang = getLang();
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet report-sheet" role="dialog" aria-modal="true" aria-labelledby="weekly-title" tabIndex={-1} ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="weekly-title">{t("週報 {0}", [weekRange(weekly.week)])}</h2>
          <button type="button" className="icon-btn" aria-label={t("關閉")} onClick={onClose}>
            ×
          </button>
        </div>
        {weekly.sample && <p className="report-sample">{t("範例週報")}</p>}
        <p className="report-summary">{pick(weekly.summary, lang)}</p>
        <p className="muted small">{t("整理自 {0} 份每日報告（{1}）", [weekly.basedOn.length, weekly.basedOn.join("、")])}</p>
        <section className="report-section">
          <h3>{t("本週重點")}</h3>
          <Items items={weekly.points} redUp={redUp} ordered />
        </section>
        {weekly.sections.map((s, i) => (
          <section key={i} className="report-section">
            <h3>{pick(s.heading, lang)}</h3>
            <Items items={s.items} redUp={redUp} />
          </section>
        ))}
        <p className="report-disclaimer muted small">{t("AI 報告僅供學習參考，非投資建議。")}</p>
      </div>
    </div>
  );
}
