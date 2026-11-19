// 發布一份 AI 每日報告：npm run ai:publish -- <報告草稿.json>
//   1. 用 checkDailyReport 檢查（格式、字數、禁用詞、只能提到觀察清單、資料過期要說明…）
//   2. 通過才寫入 public/ai/reports/<日期>.json、public/ai/latest.json，更新 public/ai/index.json
//   3. 超過 30 份的舊報告刪掉
// 檢查沒過：印出所有問題、結束碼 1、不寫任何檔案（不會用壞報告覆蓋好報告）。

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { addToIndex, checkDailyReport, validIndex, type AiIndex } from "../src/lib/aiReport";
import type { AiReport } from "../src/lib/types";
import { AI, readJson, watchlistSymbols, writeJsonAtomic } from "./ai-lib";

const file = process.argv[2];
if (!file) {
  console.error("用法：npm run ai:publish -- <報告草稿.json>");
  process.exit(1);
}
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`讀不到或不是 JSON：${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
const errors = checkDailyReport(raw, watchlistSymbols());
if (errors.length) {
  console.error(`報告沒有通過檢查（${errors.length} 個問題），沒有發布：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const report = raw as AiReport;
const reports = join(AI, "reports");
mkdirSync(reports, { recursive: true });
const prev = readJson<AiIndex>(join(AI, "index.json"));
const { index, removed } = addToIndex(validIndex(prev) ? prev : null, report.date);
writeJsonAtomic(join(reports, `${report.date}.json`), report);
// latest.json 一定是最新日期那份（補發舊日期的報告時不會蓋掉最新的）
if (index.dates[0] === report.date) writeJsonAtomic(join(AI, "latest.json"), report);
writeJsonAtomic(join(AI, "index.json"), index);
for (const d of removed) rmSync(join(reports, `${d}.json`), { force: true });
console.log(`已發布 ${report.date} 的報告（共 ${index.dates.length} 份${removed.length ? `，刪除 ${removed.join("、")}` : ""}）。`);
