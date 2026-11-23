// AI 每日報告發布後，送一則「🏢 AI 主管今日重點」到 Discord（純函式，測試在 aiDiscord.test.ts）
//
// 為什麼不放在每天早上的篩選通知裡？篩選通知在資料更新後（台灣約 6～7 點）送出，
// AI 報告是 8:25 的排程任務才寫，那時候還沒有今天的報告。所以改成「報告推上 main 之後」
// 由 check-report.yml 檢查通過再送（scripts/notify-ai.ts），手機上就能直接看到重點。

import type { DiscordMessage } from "./notify";
import type { AiReport } from "./types";

const COLOR = 0x585bef; // 網站主色

/** 範例報告、主管沒有完成 → null（不送） */
export function buildAiMessage(report: AiReport | null, siteUrl: string): DiscordMessage | null {
  const lead = report?.roles?.lead;
  if (!report || report.sample || !lead || lead.status !== "done") return null;
  const points = (lead.points ?? []).map((p, i) => `${i + 1}. ${p.text.zh}`);
  const lines = [`**${lead.summary.zh}**`, "", ...points];
  if (report.staleNote) lines.push("", `⚠️ ${report.staleNote.zh}`);
  lines.push("", `[🏢 到辦公室看五位分析師的完整報告](${siteUrl})`);
  const dates = `美股 ${report.dataDates.us ?? "—"}／台股 ${report.dataDates.tw ?? "—"}`;
  return {
    content: "",
    embeds: [
      {
        title: `🏢 AI 主管今日重點（${report.date}）`,
        description: lines.join("\n").slice(0, 4000),
        color: COLOR,
        footer: { text: `資料日期 ${dates} · AI 報告僅供學習參考，非投資建議` },
      },
    ],
  };
}

/** 同一天的報告只送一次：推上來的 latest.json 日期和上一版不同才送（同一天重新發布不重送） */
export function shouldSendAi(prevDate: string | null, report: AiReport | null): boolean {
  return !!report && !report.sample && report.date !== prevDate;
}
