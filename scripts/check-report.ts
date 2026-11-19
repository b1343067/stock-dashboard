// 檢查 public/ai 底下所有報告：npm run check:report（CI 也會跑）
//   - 範例報告 sample-report.json 格式正確
//   - index.json 的每個日期都有對應的報告檔，而且通過正式報告的檢查
//   - latest.json 就是最新日期那份；沒有在索引裡的報告檔（殘留）也算錯
// 有問題 → 印出來、結束碼 1。

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkDailyReport, HISTORY_DAYS, validateReport, validIndex, type AiIndex } from "../src/lib/aiReport";
import { AI, readJson, watchlistSymbols } from "./ai-lib";

const symbols = watchlistSymbols();
const errors: string[] = [];

const sample = validateReport(readJson(join(AI, "sample-report.json")), symbols);
for (const e of sample.errors) errors.push(`sample-report.json：${e}`);

const index = readJson<AiIndex>(join(AI, "index.json"));
if (!validIndex(index)) {
  errors.push("index.json 不存在或格式錯誤（應該是 { \"dates\": [...] }）");
} else {
  const sorted = [...index.dates].sort().reverse();
  if (JSON.stringify(sorted) !== JSON.stringify(index.dates)) errors.push("index.json 的日期要由新到舊排序");
  if (new Set(index.dates).size !== index.dates.length) errors.push("index.json 有重複的日期");
  if (index.dates.length > HISTORY_DAYS) errors.push(`index.json 超過 ${HISTORY_DAYS} 份`);
  for (const d of index.dates) {
    const p = join(AI, "reports", `${d}.json`);
    if (!existsSync(p)) {
      errors.push(`reports/${d}.json 不存在`);
      continue;
    }
    const raw = readJson<{ date?: string }>(p);
    if (raw?.date !== d) errors.push(`reports/${d}.json 裡的 date 和檔名不同`);
    for (const e of checkDailyReport(raw, symbols)) errors.push(`reports/${d}.json：${e}`);
  }
  const dir = join(AI, "reports");
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) if (!index.dates.includes(f.replace(/\.json$/, ""))) errors.push(`reports/${f} 不在 index.json 裡（應該刪掉）`);
  }
  if (index.dates.length > 0) {
    const latest = join(AI, "latest.json");
    const newest = join(AI, "reports", `${index.dates[0]}.json`);
    if (!existsSync(latest)) errors.push("有報告但沒有 latest.json");
    else if (existsSync(newest) && readFileSync(latest, "utf8") !== readFileSync(newest, "utf8")) errors.push(`latest.json 和最新的 reports/${index.dates[0]}.json 內容不同`);
  }
  console.log(`檢查了範例報告與 ${index.dates.length} 份每日報告。`);
}

if (errors.length) {
  console.error(`AI 報告檢查失敗（${errors.length} 個問題）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("AI 報告檢查通過。");
