// 訊號回測：npx vite-node scripts/signal-stats.ts
// 讀 public/data 的每一檔日線、config/notify.json 的危險／偏多規則、篩選器的內建範例組合，
// 用 src/lib/signalStats.ts 重播過去約 5 年，寫 public/data/signal-stats.json（篩選器頁、Discord、AI 報告用）。
// 在 update-data.yml 裡抓完資料後執行；失敗時保留上一次的檔案（不會用空資料覆蓋）。

import { join } from "node:path";
import { sanitizeNotifyConfig } from "../src/lib/notify";
import { BUILTIN_PRESETS } from "../src/lib/screener";
import { computeSignalStats, type FullSeries, type StatRule } from "../src/lib/signalStats";
import type { IndexData } from "../src/lib/types";
import { DATA, readJson, ROOT, writeJsonAtomic } from "./ai-lib";

const index = readJson<IndexData>(join(DATA, "index.json"));
if (!index) {
  console.error("找不到 public/data/index.json：請先執行 npm run data:pull");
  process.exit(1);
}
const cfg = sanitizeNotifyConfig(readJson(join(ROOT, "config", "notify.json")));
// 和 Discord 通知一樣略過 exclude 的股票（例如 0050），結果才會一致
const exclude = new Set(cfg.exclude);
const tickers = index.tickers
  .filter((t) => !exclude.has(t.symbol))
  .map((t) => ({ symbol: t.symbol, category: t.category, daily: readJson<{ daily: FullSeries }>(join(DATA, `${t.symbol}.json`))?.daily }))
  .filter((t): t is { symbol: string; category: string | undefined; daily: FullSeries } => !!t.daily && Array.isArray(t.daily.close));

const rules: StatRule[] = [
  ...cfg.danger.map((r) => ({ ...r, group: "danger" as const })),
  ...cfg.rules.map((r) => ({ ...r, group: "bullish" as const })),
];
// 篩選器的內建範例組合：和通知規則同名的就不重複（以通知的參數為準）
const names = new Set(rules.map((r) => r.name));
for (const p of BUILTIN_PRESETS) if (!names.has(p.name)) rules.push({ ...p, group: "preset" });

const started = Date.now();
const out = computeSignalStats({ tickers, rules, generatedAt: new Date().toISOString() });
if (out.tickers === 0 || out.rules.length === 0) {
  console.error("沒有可以回測的資料，保留舊的 signal-stats.json");
  process.exit(1);
}
writeJsonAtomic(join(DATA, "signal-stats.json"), out);
console.log(`訊號回測：${out.tickers} 檔、${out.rules.length} 條規則（略過 ${out.skipped.length} 條），${out.from} ～ ${out.to}，${((Date.now() - started) / 1000).toFixed(1)} 秒`);
console.log(`基準：20 天後平均 ${out.baseline.h20.avg}%、上漲機率 ${out.baseline.h20.win}%（${out.baseline.h20.n} 筆）`);
for (const r of out.rules) console.log(`  [${r.group}] ${r.name}：${r.events} 次（${r.symbols} 檔）；5 天 ${r.h5.avg}%／${r.h5.win}%；20 天 ${r.h20.avg}%／${r.h20.win}%`);
