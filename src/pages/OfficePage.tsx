// AI 投研辦公室（#/office）：5 位 AI 分析師坐在像素風辦公室裡，點角色看他今天的報告。
// 第一階段用範例報告；第二階段由 Claude Code 排程任務每天產生報告（只用公開資料）。
// 報告讀不到時辦公室照樣顯示（大家休假中），不會整頁壞掉。

import { useCallback, useEffect, useState } from "react";
import OfficeScene from "../components/office/OfficeScene";
import ReportPanel from "../components/office/ReportPanel";
import { loadAiReport } from "../lib/data";
import { doneCount, pick, reportStale, ROLE_NAME, ROLE_ORDER } from "../lib/aiReport";
import { getLang, t } from "../lib/i18n";
import { SEATS } from "../lib/iso";
import type { AiReport, AiRoleKey } from "../lib/types";

interface Props {
  redUp: boolean;
}

/** 角色的工作內容（中文原文，畫面用 t()） */
const ROLE_DESC: Record<AiRoleKey, string> = {
  tech: "看篩選器訊號：黃金交叉、死亡交叉、RSI",
  news: "整理重大新聞、關注股新聞、7 天內財報",
  fundamental: "看本益比、殖利率、距 52 週高低點",
  debate: "同一份資料，分別寫出偏多與偏空的理由",
  lead: "讀完大家的報告，整理今日重點",
};

export default function OfficePage({ redUp }: Props) {
  const [report, setReport] = useState<AiReport | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [open, setOpen] = useState<AiRoleKey | null>(null);
  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    let cancelled = false;
    void loadAiReport().then((r) => {
      if (cancelled) return;
      setReport(r);
      setState(r ? "ok" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const lang = getLang();
  const present = Object.fromEntries(ROLE_ORDER.map((k) => [k, report?.roles[k].status === "done"])) as Record<AiRoleKey, boolean>;
  const today = new Date().toISOString().slice(0, 10);
  // 範例報告的日期是固定的，不顯示「過期」提醒
  const stale = report && !report.sample && reportStale(report, today);

  return (
    <div className="office-page">
      <div className="market-head">
        <div>
          <h2>{t("AI 投研辦公室")}</h2>
          <p className="muted small">{t("5 位 AI 分析師每天整理公開資料（觀察清單、指標、新聞），點角色看報告")}</p>
        </div>
      </div>

      {report?.sample && (
        <div className="banner office-banner" role="status">
          <b>{t("範例報告")}</b>
          {t("：目前顯示的是示範用的假內容，不是真實市場分析。")}
        </div>
      )}
      {state === "error" && <p className="error card">{t("暫時無法讀取 AI 報告，今天大家都休假中。")}</p>}
      {report && (stale || report.staleNote) && (
        <p className="banner office-banner" role="status">
          {report.staleNote ? pick(report.staleNote, lang) : t("報告使用的資料已超過 3 個交易日沒有更新，內容可能過時。")}
        </p>
      )}
      {report && (
        <p className="muted small office-dates">
          {t("報告日期 {0}・美股資料 {1}・台股資料 {2}・新聞 {3}", [report.date, report.dataDates.us ?? "—", report.dataDates.tw ?? "—", report.dataDates.news ?? "—"])}
          {"・"}
          {t("{0}／5 位完成", [doneCount(report)])}
        </p>
      )}

      <OfficeScene present={present} loading={state === "loading"} redUp={redUp} onOpen={setOpen} />

      {/* 角色列表：手機上名牌比較小，這裡也可以點；同時顯示每個人今天的摘要 */}
      <div className="office-roster">
        {ROLE_ORDER.map((key) => {
          const r = report?.roles[key];
          const done = r?.status === "done";
          return (
            <button key={key} type="button" className={`office-station office-${key}`} onClick={() => setOpen(key)} aria-haspopup="dialog">
              <span className="office-swatch" style={{ background: `var(${SEATS[key].shirt})` }} aria-hidden="true" />
              <span className="office-name">{t(ROLE_NAME[key])}</span>
              <span className={`office-status ${done ? "is-done" : "is-off"}`}>{state === "loading" ? t("載入中…") : done ? t("已完成") : t("休假中")}</span>
              <span className="office-summary muted small">{done && r ? pick(r.summary, lang) : t(ROLE_DESC[key])}</span>
            </button>
          );
        })}
      </div>

      <p className="office-disclaimer muted small">{t("AI 報告僅供學習參考，非投資建議。")}{t("報告只使用公開資料，不含任何個人持股，也不提供買賣建議或目標價。")}</p>

      {open && <ReportPanel role={open} report={report} redUp={redUp} onClose={close} />}
    </div>
  );
}
