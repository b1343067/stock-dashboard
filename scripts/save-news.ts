// 把今天的新聞與財報存成 public/data/news.json（隨資料一起推到 data 分支）
//   npx vite-node scripts/save-news.ts   （GitHub Actions 每日更新時執行，需要 FINNHUB_API_KEY）
// 用途：AI 投研辦公室的「新聞分析師」讀這個檔（報告任務沒有 Finnhub 金鑰）。
// 規則：三個部分全部抓不到時不寫檔，保留舊檔（不可以用空資料覆蓋），結束碼一律 0、不影響資料更新。

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeNotifyConfig } from "../src/lib/notify";
import type { NewsFile } from "../src/lib/aiContext";
import { fetchNews } from "./news";

const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public", "data", "news.json");

async function main(): Promise<void> {
  let raw: unknown = null;
  try {
    raw = JSON.parse(readFileSync(join(ROOT, "config", "notify.json"), "utf8"));
  } catch {
    return console.log("沒有 config/notify.json，不存新聞。");
  }
  const news = await fetchNews(sanitizeNotifyConfig(raw));
  if (!news || (news.market === null && news.watch === null && news.earnings === null)) {
    return console.log("新聞全部抓不到，保留舊的 news.json。");
  }
  const file: NewsFile = { generatedAt: new Date().toISOString(), ...news };
  const tmp = `${OUT}.tmp`;
  writeFileSync(tmp, JSON.stringify(file));
  renameSync(tmp, OUT); // 先寫暫存檔再改名，避免寫到一半的壞檔案
  const n = (news.market?.length ?? 0) + Object.values(news.watch ?? {}).reduce((s, l) => s + l.length, 0);
  console.log(`已存 news.json：${n} 則新聞、${news.earnings?.length ?? 0} 筆財報。`);
}

main().catch((e: unknown) => console.log(`存新聞失敗（不影響資料更新）：${e instanceof Error ? e.message : String(e)}`));
