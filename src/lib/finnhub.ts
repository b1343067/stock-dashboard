// Finnhub API 的共用工具（今日總覽的 Vercel 函式 api/*.ts、每日 Discord 通知 scripts/notify.ts 都用這裡）
// 測試在 finnhub.test.ts。
//
// ⚠️ 金鑰只能在伺服器端（Vercel 函式、GitHub Actions）從環境變數讀取，透過參數傳進 finnhubGet()；
//    瀏覽器端的程式絕對不能 import 這裡的 finnhubGet，也不能碰到金鑰。
// 這個檔案刻意不 import 任何其他檔案：Vercel 函式和 Node 腳本都能直接使用。

export const FINNHUB_BASE = "https://finnhub.io/api/v1";

/** 美股代號：大寫英數、點、橫線（BRK-B）。台股（.TW／.TWO）Finnhub 免費版沒有，一律排除 */
export function isUsSymbol(s: string): boolean {
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(s) && !/\.TWO?$/.test(s);
}

/** 解析網址參數 symbols=AAPL,NVDA：去重、轉大寫、只留合法代號、最多 max 檔 */
export function parseSymbolsParam(param: string | null, max = 30): string[] {
  if (!param) return [];
  const out: string[] = [];
  for (const raw of param.split(",")) {
    const s = raw.trim().toUpperCase();
    if (isUsSymbol(s) && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** YYYY-MM-DD（UTC） */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 呼叫 Finnhub。金鑰放在 X-Finnhub-Token 標頭，不放網址（網址會出現在各種記錄裡）。
 * 8 秒逾時；失敗時丟出只含狀態碼的錯誤（不會帶出金鑰）。
 */
export async function finnhubGet(
  path: string,
  params: Record<string, string>,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const url = `${FINNHUB_BASE}${path}?${new URLSearchParams(params).toString()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetchImpl(url, { headers: { "X-Finnhub-Token": key }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 報價
// ---------------------------------------------------------------------------

export interface LiveQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  /** 昨收（算今日損益用） */
  prevClose: number;
  /** 報價時間（Unix 秒） */
  time: number;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Finnhub /quote：{c 現價, d 漲跌, dp 漲跌%, pc 昨收, t 時間}。代號不存在時 c = 0 → 視為沒有報價 */
export function parseQuote(symbol: string, raw: unknown): LiveQuote | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const price = num(o.c);
  const prev = num(o.pc);
  if (price === null || price <= 0 || prev === null || prev <= 0) return null;
  return {
    symbol,
    price,
    prevClose: prev,
    change: num(o.d) ?? price - prev,
    changePct: num(o.dp) ?? (price / prev - 1) * 100,
    time: num(o.t) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// 新聞（只保留標題、來源、時間、連結；不轉載內文）
// ---------------------------------------------------------------------------

export interface NewsItem {
  id: string;
  /** 相關的股票代號（市場新聞為 null） */
  symbol: string | null;
  headline: string;
  source: string;
  url: string;
  /** 發布時間（Unix 秒） */
  datetime: number;
}

/** Finnhub /company-news 或 /news：陣列 [{id, headline, source, url, datetime, summary…}]；summary 刻意丟掉 */
export function parseNews(raw: unknown, symbol: string | null): NewsItem[] {
  if (!Array.isArray(raw)) return [];
  const out: NewsItem[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const headline = typeof o.headline === "string" ? o.headline.trim() : "";
    const url = typeof o.url === "string" ? o.url : "";
    const datetime = num(o.datetime);
    if (!headline || !/^https?:\/\//.test(url) || datetime === null) continue;
    out.push({
      id: String(o.id ?? url),
      symbol,
      headline: headline.slice(0, 300),
      source: typeof o.source === "string" && o.source ? o.source.slice(0, 60) : "",
      url,
      datetime,
    });
  }
  return out;
}

/** 標題正規化：比對「同一則新聞」用（不同網站轉載時網址不同、標題相同） */
const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, " ").trim();

/** 去掉重複的新聞（同網址或同標題只留第一則） */
export function dedupeNews(items: NewsItem[]): NewsItem[] {
  const urls = new Set<string>();
  const titles = new Set<string>();
  const out: NewsItem[] = [];
  for (const n of items) {
    const t = normTitle(n.headline);
    if (urls.has(n.url) || titles.has(t)) continue;
    urls.add(n.url);
    titles.add(t);
    out.push(n);
  }
  return out;
}

/** 只留最近 hours 小時內的新聞，新的在前 */
export function recentNews(items: NewsItem[], nowSec: number, hours = 24): NewsItem[] {
  return items.filter((n) => n.datetime >= nowSec - hours * 3600 && n.datetime <= nowSec + 600).sort((a, b) => b.datetime - a.datetime);
}

/** 主要財經媒體：「重大財經新聞」優先挑這些來源 */
const MAJOR_SOURCES = ["reuters", "bloomberg", "cnbc", "wsj", "wall street journal", "financial times", "marketwatch", "barron", "associated press", "ap news", "yahoo"];
/** 標題含這些字的通常是影響大盤的消息 */
const MARKET_KEYWORDS = ["fed", "fomc", "powell", "rate", "inflation", "cpi", "ppi", "jobs", "payroll", "gdp", "recession", "tariff", "treasury", "yield", "earnings", "s&p", "nasdaq", "dow", "oil", "opec", "china"];

/**
 * 挑出「最重要」的幾則市場新聞。Finnhub 沒有重要度分數，所以用規則估：
 *   主要媒體 +2、標題含總經關鍵字 +1（最多 +2），同分時新的在前。
 */
export function rankMarketNews(items: NewsItem[], n: number): NewsItem[] {
  const score = (x: NewsItem) => {
    const src = x.source.toLowerCase();
    const title = x.headline.toLowerCase();
    const major = MAJOR_SOURCES.some((m) => src.includes(m)) ? 2 : 0;
    const kw = Math.min(2, MARKET_KEYWORDS.filter((k) => new RegExp(`\\b${k.replace(/[&]/g, "\\$&")}`).test(title)).length);
    return major + kw;
  };
  return dedupeNews(items)
    .map((x) => ({ x, s: score(x) }))
    .sort((a, b) => b.s - a.s || b.x.datetime - a.x.datetime)
    .slice(0, n)
    .map((v) => v.x);
}

// ---------------------------------------------------------------------------
// 財報日曆
// ---------------------------------------------------------------------------

export interface EarningsItem {
  symbol: string;
  /** YYYY-MM-DD */
  date: string;
  /** bmo = 盤前、amc = 盤後、dmh = 盤中、"" = 未定 */
  hour: string;
  epsEstimate: number | null;
}

/** Finnhub /calendar/earnings：{earningsCalendar: [{symbol, date, hour, epsEstimate…}]} */
export function parseEarnings(raw: unknown): EarningsItem[] {
  const list = ((raw ?? {}) as { earningsCalendar?: unknown }).earningsCalendar;
  if (!Array.isArray(list)) return [];
  const out: EarningsItem[] = [];
  for (const r of list) {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.symbol !== "string" || typeof o.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue;
    out.push({ symbol: o.symbol.toUpperCase(), date: o.date, hour: typeof o.hour === "string" ? o.hour : "", epsEstimate: num(o.epsEstimate) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
}
