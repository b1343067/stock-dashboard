// 財報日曆：GET /api/earnings?symbols=AAPL,NVDA&days=7
// Finnhub 一次回傳這段期間所有公司的財報日，這裡只留要的代號。

import { finnhubGet, parseEarnings, parseSymbolsParam, ymd } from "../src/lib/finnhub.js";
import { cached, getKey, json, notConfigured } from "./_lib.js";

const TTL_MS = 6 * 3600_000; // 財報日期一天變不了幾次

export async function GET(request: Request): Promise<Response> {
  const key = getKey();
  if (!key) return notConfigured();
  const params = new URL(request.url).searchParams;
  const symbols = parseSymbolsParam(params.get("symbols"), 80);
  if (symbols.length === 0) return json({ error: "no-symbols" }, 400);
  const days = Math.min(14, Math.max(1, Number(params.get("days")) || 7));

  const now = new Date();
  const from = ymd(now);
  const to = ymd(new Date(now.getTime() + days * 86_400_000));
  try {
    const all = await cached(`earnings:${from}:${to}`, TTL_MS, async () => parseEarnings(await finnhubGet("/calendar/earnings", { from, to }, key)));
    const want = new Set(symbols);
    return json({ from, to, items: all.filter((e) => want.has(e.symbol)) }, 200, 3600);
  } catch {
    return json({ error: "upstream" }, 502);
  }
}
