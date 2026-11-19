// AI 投研辦公室（首頁，#/ 或 #/office）：5 位 AI 分析師坐在像素風辦公室裡，點角色看他今天的報告。
// 設計成「沉浸式」：沒有頁面標題、卡片框，房間直接浮在背景上；報告日期、範例標示等資訊
// 用小標籤放在房間角落；辦公室裡的門、窗、電視、看板、書櫃就是選單（見 OfficeScene）。
// 第一階段用範例報告；第二階段由 Claude Code 排程任務每天產生報告（只用公開資料）。
// 報告讀不到時辦公室照樣顯示（大家休假中），不會整頁壞掉。

import { useCallback, useEffect, useState } from "react";
import OfficeScene from "../components/office/OfficeScene";
import ReportPanel from "../components/office/ReportPanel";
import { loadAiIndex, loadAiReport } from "../lib/data";
import { doneCount, pick, reportStale, ROLE_ORDER } from "../lib/aiReport";
import { getLang, t } from "../lib/i18n";
import type { AiReport, AiRoleKey } from "../lib/types";

interface Props {
  redUp: boolean;
  /** 看盤頁連結（電視那個入口用，記得上次看的股票） */
  chartHref: string;
}

export default function OfficePage({ redUp, chartHref }: Props) {
  const [report, setReport] = useState<AiReport | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [open, setOpen] = useState<AiRoleKey | null>(null);
  const close = useCallback(() => setOpen(null), []);
  // 歷史報告：index.json 的日期清單；picked = 使用者選的日期（null = 最新）
  const [dates, setDates] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAiIndex().then((idx) => {
      if (!cancelled) setDates(idx?.dates ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    void loadAiReport(picked ?? undefined).then((r) => {
      if (cancelled) return;
      setReport(r);
      setState(r ? "ok" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, [picked]);

  const lang = getLang();
  const present = Object.fromEntries(
    ROLE_ORDER.map((k) => [k, report?.roles[k].status === "done"]),
  ) as Record<AiRoleKey, boolean>;
  const today = new Date().toISOString().slice(0, 10);
  // 範例報告的日期是固定的、看歷史報告時本來就是舊的：這兩種不顯示「過期」提醒
  const stale = report && !report.sample && !picked && reportStale(report, today);
  const lead = report?.roles.lead;

  return (
    <div className="office-page">
      {/* 畫面上不顯示標題（沉浸式辦公室，使用者要求）；保留給螢幕報讀器 */}
      <h2 className="sr-only">{t("AI 投研辦公室")}</h2>

      <OfficeScene
        present={present}
        loading={state === "loading"}
        redUp={redUp}
        chartHref={chartHref}
        onOpen={setOpen}
      >
        {/* 房間左上角：報告資訊；右上角：完成人數 */}
        <div className="office-hud office-hud-left" role="status">
          {report?.sample && (
            <span className="hud-chip hud-sample">{t("範例報告")}</span>
          )}
          {report && !report.sample && dates.length > 1 ? (
            <select
              className="hud-chip hud-select"
              aria-label={t("報告日期")}
              value={picked ?? dates[0]}
              onChange={(e) =>
                setPicked(e.target.value === dates[0] ? null : e.target.value)
              }
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {t("報告 {0}", [d])}
                </option>
              ))}
            </select>
          ) : (
            report && (
              <span
                className="hud-chip"
                title={t("報告日期 {0}・美股資料 {1}・台股資料 {2}・新聞 {3}", [
                  report.date,
                  report.dataDates.us ?? "—",
                  report.dataDates.tw ?? "—",
                  report.dataDates.news ?? "—",
                ])}
              >
                {t("報告 {0}", [report.date])}
              </span>
            )
          )}
          {report && (stale || report.staleNote) && (
            <span className="hud-chip hud-warn">
              {report.staleNote
                ? pick(report.staleNote, lang)
                : t("資料超過 3 個交易日沒更新")}
            </span>
          )}
          {state === "error" && (
            <span className="hud-chip hud-warn">
              {t("暫時無法讀取 AI 報告，今天大家都休假中。")}
            </span>
          )}
        </div>
        {report && (
          <div className="office-hud office-hud-right">
            <span className="hud-chip">
              {t("{0}／5 位完成", [doneCount(report)])}
            </span>
          </div>
        )}
      </OfficeScene>

      {/* 主管的一句話摘要（點了看完整報告） */}
      {lead?.status === "done" && (
        <button
          type="button"
          className="office-brief"
          onClick={() => setOpen("lead")}
        >
          <span className="office-brief-who">{t("主管")}</span>
          <span className="office-brief-text">{pick(lead.summary, lang)}</span>
          <span className="office-brief-go">{t("看報告")} ›</span>
        </button>
      )}

      <p className="office-disclaimer muted small">
        {t("AI 報告僅供學習參考，非投資建議。")}
        {t("報告只使用公開資料，不含任何個人持股，也不提供買賣建議或目標價。")}
      </p>

      {open && (
        <ReportPanel
          role={open}
          report={report}
          redUp={redUp}
          onClose={close}
        />
      )}
    </div>
  );
}
