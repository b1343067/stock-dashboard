// AI 投研辦公室（首頁，#/ 或 #/office）：5 位 AI 分析師坐在像素風辦公室裡，點角色看他今天的報告。
// 設計成「沉浸式」：沒有頁面標題、卡片框，房間直接浮在背景上；報告日期、範例標示等資訊
// 用小標籤放在房間角落；辦公室裡的門、窗、電視、看板、書櫃就是選單（見 OfficeScene）。
// 第一階段用範例報告；第二階段由 Claude Code 排程任務每天產生報告（只用公開資料）。
// 報告讀不到時辦公室照樣顯示（大家休假中），不會整頁壞掉。

import { useCallback, useEffect, useState } from "react";
import OfficeScene from "../components/office/OfficeScene";
import ReportPanel from "../components/office/ReportPanel";
import { loadAiIndex, loadAiReport, loadMlVol } from "../lib/data";
import { REGIME_COLOR } from "../lib/ml";
import { officeMood, type MoodInfo } from "../lib/officeMood";
import { LAB_HREF } from "../lib/route";
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

  // 今日氣氛：ML 市場狀態（ml-vol.json 是小檔案）；讀不到就維持平常的樣子
  const [mood, setMood] = useState<MoodInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMlVol().then((d) => {
      if (!cancelled) setMood(officeMood(d));
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
  // 偶爾說話用的一句話摘要（只有完成報告的人）
  const summaries = Object.fromEntries(
    ROLE_ORDER.filter((k) => report?.roles[k].status === "done").map((k) => [k, pick(report!.roles[k].summary, lang)]),
  ) as Partial<Record<AiRoleKey, string>>;

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
        mood={mood?.mood}
        summaries={summaries}
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
        {/* 左下角（房間外的空白處，不會擋到物件標籤）：今日氣氛的來源，點了到 ML 實驗室看說明 */}
        {mood && (
          <div className="office-hud office-hud-bottom">
            <a className="hud-chip hud-mood" href={LAB_HREF} title={t("市場狀態（看說明）")}>
              <i style={{ background: `var(${REGIME_COLOR[mood.key]})` }} aria-hidden="true" />
              {t(mood.label)} {t(mood.name)}
            </a>
          </div>
        )}
      </OfficeScene>

      {state === "loading" && !report && <div className="office-brief-skeleton" aria-hidden="true" />}
      {/* 主管的今日重點（摘要＋3～5 點；點「看完整報告」打開主管報告） */}
      {lead?.status === "done" && (
        <section className="office-brief" aria-label={t("今日重點")}>
          <div className="office-brief-head">
            <span className="office-brief-who">{t("主管")}</span>
            <b className="office-brief-text">{pick(lead.summary, lang)}</b>
          </div>
          {lead.points && lead.points.length > 0 && (
            <ol className="office-brief-points">
              {lead.points.map((p, i) => (
                <li key={i}>{pick(p.text, lang)}</li>
              ))}
            </ol>
          )}
          <button type="button" className="office-brief-go" onClick={() => setOpen("lead")}>
            {t("看完整報告")} ›
          </button>
        </section>
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
