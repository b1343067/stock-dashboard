// 公司新聞：GET /api/news?symbols=AAPL,NVDA&hours=24
// 只回傳標題、來源、時間、連結（不轉載內文）。每檔最多 3 則、同一則新聞只出現一次。

import { dedupeNews, finnhubGet, parseNews, parseSymbolsParam, recentNews, ymd, type NewsItem } from "../src/lib/finnhub.js";
import { cached, getKey, json, notConfigured } from "./_lib.js";

const TTL_MS = 10 * 60_000; // 新聞 10 分鐘更新一次就夠了
const PER_SYMBOL = 3;

export async function GET(request: Request): Promise<Response> {
  const key = getKey();
  if (!key) return notConfigured();
  const params = new URL(request.url).searchParams;
  const symbols = parseSymbolsParam(params.get("symbols"), 20);
  if (symbols.length === 0) return json({ error: "no-symbols" }, 400);
  const hours = Math.min(72, Math.max(1, Number(params.get("hours")) || 24));

  const now = new Date();
  // Finnhub 的 from／to 是日期，多抓前兩天再用時間過濾成「最近 N 小時」
  const from = ymd(new Date(now.getTime() - 2 * 86_400_000));
  const to = ymd(now);
  const all: NewsItem[] = [];
  let ok = 0;
  await Promise.all(
    symbols.map(async (s) => {
      try {
        const items = await cached(`news:${s}:${from}:${to}`, TTL_MS, async () =>
          parseNews(await finnhubGet("/company-news", { symbol: s, from, to }, key), s),
        );
        ok++;
        all.push(...recentNews(items, Math.floor(now.getTime() / 1000), hours).slice(0, PER_SYMBOL));
      } catch {
        /* 單檔失敗不影響其他檔 */
      }
    }),
  );
  if (ok === 0) return json({ error: "upstream" }, 502);
  const items = dedupeNews(all.sort((a, b) => b.datetime - a.datetime));
  return json({ asOf: Math.floor(now.getTime() / 1000), items }, 200, 600);
}
