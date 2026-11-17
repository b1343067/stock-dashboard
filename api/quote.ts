// 即時報價：GET /api/quote?symbols=AAPL,NVDA
// 只收股票代號（不收股數、成本）；只查美股，台股網頁用每日收盤資料。
// 回應：{ asOf, quotes: { AAPL: {price, change, changePct, prevClose, time} }, failed: [...] }

import { finnhubGet, parseQuote, parseSymbolsParam, type LiveQuote } from "../src/lib/finnhub.js";
import { cached, getKey, json, notConfigured } from "./_lib.js";

const TTL_MS = 30_000; // 每檔 30 秒內重複查詢用快取

export async function GET(request: Request): Promise<Response> {
  const key = getKey();
  if (!key) return notConfigured();
  const symbols = parseSymbolsParam(new URL(request.url).searchParams.get("symbols"), 30);
  if (symbols.length === 0) return json({ error: "no-symbols" }, 400);

  const quotes: Record<string, LiveQuote> = {};
  const failed: string[] = [];
  await Promise.all(
    symbols.map(async (s) => {
      try {
        const q = await cached(`quote:${s}`, TTL_MS, async () => parseQuote(s, await finnhubGet("/quote", { symbol: s }, key)));
        if (q) quotes[s] = q;
        else failed.push(s);
      } catch {
        failed.push(s);
      }
    }),
  );
  // 全部失敗（例如 Finnhub 掛了或額度用完）→ 502，網頁會顯示「非即時」
  if (Object.keys(quotes).length === 0) return json({ error: "upstream", failed }, 502);
  return json({ asOf: Math.floor(Date.now() / 1000), quotes, failed: failed.sort() }, 200, 30);
}
