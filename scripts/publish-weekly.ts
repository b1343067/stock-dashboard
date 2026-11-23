// 發布一份 AI 週報：npm run ai:publish-weekly -- <週報草稿.json>
//   檢查（checkWeeklyReport）通過才寫 public/ai/weekly/<週一>.json 與 weekly/index.json，超過 12 週的刪掉。
// 檢查沒過：印出所有問題、結束碼 1、不寫任何檔案。

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { addWeek, checkWeeklyReport, validWeeklyIndex, type WeeklyIndex } from "../src/lib/aiWeekly";
import type { AiWeekly } from "../src/lib/types";
import { AI, readJson, watchlistSymbols, writeJsonAtomic } from "./ai-lib";

const file = process.argv[2];
if (!file) {
  console.error("用法：npm run ai:publish-weekly -- <週報草稿.json>");
  process.exit(1);
}
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`讀不到或不是 JSON：${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
const errors = checkWeeklyReport(raw, watchlistSymbols());
if (errors.length) {
  console.error(`週報沒有通過檢查（${errors.length} 個問題），沒有發布：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const weekly = raw as AiWeekly;
const dir = join(AI, "weekly");
mkdirSync(dir, { recursive: true });
const prev = readJson<WeeklyIndex>(join(dir, "index.json"));
const { index, removed } = addWeek(validWeeklyIndex(prev) ? prev : null, weekly.week);
writeJsonAtomic(join(dir, `${weekly.week}.json`), weekly);
writeJsonAtomic(join(dir, "index.json"), index);
for (const w of removed) rmSync(join(dir, `${w}.json`), { force: true });
console.log(`已發布 ${weekly.week} 那一週的週報（共 ${index.weeks.length} 份${removed.length ? `，刪除 ${removed.join("、")}` : ""}）。`);
