// 產生 AI 週報的素材：npm run ai:week-context
// 讀 public/ai/reports/ 裡「上一週」（週一～下週一，因為每日報告寫的是前一個交易日）的每日報告，
// 整理每天的主管重點與各角色摘要，印出 JSON。週一的排程任務照 docs/daily-report-task.md 用它寫週報。
// 只有公開資料（每日報告本身就只用公開資料）。上週一份每日報告都沒有 → 印出錯誤、結束碼 1（不寫週報）。

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROLE_ORDER } from "../src/lib/aiReport";
import { previousWeek } from "../src/lib/aiWeekly";
import type { AiReport } from "../src/lib/types";
import { AI, readJson, taipeiToday, watchlistSymbols } from "./ai-lib";

const today = process.env.REPORT_DATE ?? taipeiToday();
const { week, from, to } = previousWeek(today);
const dir = join(AI, "reports");
// 上週二～這週一的每日報告：週二的報告寫的是週一的收盤……這週一的報告寫的是上週五（不含今天以後）
const nextMonday = new Date(Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
const end = today < nextMonday ? today : nextMonday;
const dates = existsSync(dir)
  ? readdirSync(dir)
      .map((f) => f.replace(/\.json$/, ""))
      .filter((d) => d > from && d <= end)
      .sort()
  : [];
const days = dates
  .map((d) => readJson<AiReport>(join(dir, `${d}.json`)))
  .filter((r): r is AiReport => !!r && !r.sample)
  .map((r) => ({
    date: r.date,
    dataDates: r.dataDates,
    lead: r.roles.lead.status === "done" ? { summary: r.roles.lead.summary.zh, points: (r.roles.lead.points ?? []).map((p) => p.text.zh) } : null,
    summaries: Object.fromEntries(ROLE_ORDER.filter((k) => r.roles[k].status === "done").map((k) => [k, r.roles[k].summary.zh])),
  }));
if (days.length === 0) {
  console.error(`上一週（${from} ～ ${to}）沒有任何每日報告，不寫週報。`);
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      reportDate: today,
      week,
      range: { from, to },
      rules: "只能整理這些每日報告裡的內容；不可以提到觀察清單以外的股票、不可以給買進／賣出建議或目標價",
      basedOn: days.map((d) => d.date),
      allowedSymbols: [...watchlistSymbols()],
      days,
    },
    null,
    2,
  ),
);
