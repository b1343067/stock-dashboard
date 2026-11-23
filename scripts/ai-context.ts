// 產生 AI 每日報告的素材：npm run ai:context
// 讀 public/data（先 npm run data:pull 下載 data 分支）與 config/notify.json，印出整理好的 JSON。
// Claude Code 排程任務照 docs/daily-report-task.md 用這份素材寫報告。
// 只有公開資料（觀察清單、指標、新聞標題），沒有任何持股。

import { join } from "node:path";
import { buildContext, type NewsFile } from "../src/lib/aiContext";
import type { MlVolData } from "../src/lib/ml";
import { sanitizeNotifyConfig } from "../src/lib/notify";
import type { ScreenerData } from "../src/lib/screener";
import type { SignalStatsFile } from "../src/lib/signalStats";
import type { IndexData } from "../src/lib/types";
import { DATA, readJson, ROOT, taipeiToday } from "./ai-lib";

const index = readJson<IndexData>(join(DATA, "index.json"));
const screener = readJson<ScreenerData>(join(DATA, "screener.json"));
if (!index || !screener) {
  console.error("找不到 public/data/index.json 或 screener.json：請先執行 npm run data:pull");
  process.exit(1);
}
if (index.sample) {
  console.error("目前是範例資料（sample: true），不可以拿來寫正式報告：請先執行 npm run data:pull");
  process.exit(1);
}
const ctx = buildContext({
  index,
  screener,
  mlVol: readJson<MlVolData>(join(DATA, "ml-vol.json")),
  news: readJson<NewsFile>(join(DATA, "news.json")),
  cfg: sanitizeNotifyConfig(readJson(join(ROOT, "config", "notify.json"))),
  today: process.env.REPORT_DATE ?? taipeiToday(),
  stats: readJson<SignalStatsFile>(join(DATA, "signal-stats.json")),
});
console.log(JSON.stringify(ctx, null, 2));
