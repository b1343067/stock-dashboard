// 新聞與財報（Finnhub）：每日通知（notify.ts）和存檔（save-news.ts）共用
//
// 為什麼要把新聞存成 public/data/news.json（放在 data 分支）？
//   AI 投研辦公室的每日報告由 Claude Code 排程任務產生，那邊沒有 Finnhub 金鑰；
//   金鑰只在 GitHub Secrets，所以由每天的資料更新順便把新聞存下來，報告任務直接讀檔。
//   檔案只有標題、來源、網址、時間（不轉載內文），網站本來就會顯示這些。

import { readFileSync } from "node:fs";
import { finnhubGet, isUsSymbol, parseEarnings, parseNews, ymd, type NewsItem } from "../src/lib/finnhub";
import type { NewsBundle, NotifyConfig } from "../src/lib/notify";
import type { NewsFile } from "../src/lib/aiContext";

/**
 * 抓新聞與財報。每一部分各自失敗就各自略過（null），不影響其他部分和整個通知。
 * 金鑰只從環境變數讀，用標頭送出；錯誤訊息只印狀態碼，不會印出金鑰。
 */
export async function fetchNews(cfg: NotifyConfig): Promise<NewsBundle | null> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) {
    console.log("沒有設定 FINNHUB_API_KEY，略過新聞與財報。");
    return null;
  }
  const now = new Date();
  const from = ymd(new Date(now.getTime() - 2 * 86_400_000));
  const to = ymd(now);
  const watch = cfg.watch.filter(isUsSymbol); // Finnhub 免費版沒有台股新聞

  let market: NewsItem[] | null = null;
  try {
    market = parseNews(await finnhubGet("/news", { category: "general" }, key), null);
  } catch (e) {
    console.log(`市場新聞抓取失敗，略過：${e instanceof Error ? e.message : e}`);
  }

  let watchNews: Record<string, NewsItem[]> | null = {};
  let ok = 0;
  for (const s of watch) {
    try {
      watchNews[s] = parseNews(await finnhubGet("/company-news", { symbol: s, from, to }, key), s);
      ok++;
    } catch (e) {
      console.log(`${s} 新聞抓取失敗，略過：${e instanceof Error ? e.message : e}`);
    }
  }
  if (watch.length > 0 && ok === 0) watchNews = null;

  let earnings = null;
  try {
    const until = ymd(new Date(now.getTime() + 7 * 86_400_000));
    earnings = parseEarnings(await finnhubGet("/calendar/earnings", { from: to, to: until }, key));
  } catch (e) {
    console.log(`財報日曆抓取失敗，略過：${e instanceof Error ? e.message : e}`);
  }
  return { market, watch: watchNews, earnings };
}

/** news.json 在這個時間內（3 小時）算新的，通知直接用，不重抓 */
const FRESH_MS = 3 * 3600_000;

export async function loadOrFetchNews(cfg: NotifyConfig, path: string): Promise<NewsBundle | null> {
  try {
    const f = JSON.parse(readFileSync(path, "utf8")) as NewsFile;
    if (Date.now() - Date.parse(f.generatedAt) < FRESH_MS) {
      console.log(`使用剛存的新聞檔（${f.generatedAt}）`);
      return { market: f.market, watch: f.watch, earnings: f.earnings };
    }
  } catch {
    // 沒有檔案或壞掉：重抓
  }
  return fetchNews(cfg);
}
