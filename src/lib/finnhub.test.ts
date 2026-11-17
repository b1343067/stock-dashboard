// Finnhub 共用工具與 Vercel 函式（api/*.ts）的測試。用假的 fetch，不需要真的金鑰。執行：npm test
import { afterEach, describe, expect, it, vi } from "vitest";
import { dedupeNews, parseEarnings, parseNews, parseQuote, parseSymbolsParam, rankMarketNews, recentNews, type NewsItem } from "./finnhub";
import { GET as quoteGET } from "../../api/quote";
import { GET as newsGET } from "../../api/news";
import { GET as earningsGET } from "../../api/earnings";

describe("parseSymbolsParam", () => {
  it("轉大寫、去重、排除台股與奇怪字元、限制數量", () => {
    expect(parseSymbolsParam("aapl, NVDA,aapl,2330.TW,BRK-B,../etc,<x>")).toEqual(["AAPL", "NVDA", "BRK-B"]);
    expect(parseSymbolsParam("A,B,C", 2)).toEqual(["A", "B"]);
    expect(parseSymbolsParam(null)).toEqual([]);
  });
});

describe("parseQuote", () => {
  it("Finnhub 報價格式", () => {
    expect(parseQuote("AAPL", { c: 101, d: 1, dp: 1, pc: 100, t: 1700000000 })).toEqual({ symbol: "AAPL", price: 101, change: 1, changePct: 1, prevClose: 100, time: 1700000000 });
  });
  it("代號不存在時 c = 0 → null", () => expect(parseQuote("XXX", { c: 0, pc: 0 })).toBeNull());
});

describe("新聞", () => {
  const n = (id: string, headline: string, url: string, datetime: number, source = "Reuters"): NewsItem => ({ id, symbol: null, headline, source, url, datetime });
  it("parseNews 不保留內文、丟掉沒有連結的", () => {
    const out = parseNews([{ id: 1, headline: "A", url: "https://x/a", datetime: 10, source: "CNBC", summary: "全文…" }, { headline: "B", url: "javascript:1", datetime: 1 }], "AAPL");
    expect(out).toEqual([{ id: "1", symbol: "AAPL", headline: "A", source: "CNBC", url: "https://x/a", datetime: 10 }]);
  });
  it("同網址或同標題只留一則", () => {
    expect(dedupeNews([n("1", "Fed holds rates", "https://a", 1), n("2", "FED holds rates!", "https://b", 2), n("3", "Other", "https://a", 3)])).toHaveLength(1);
  });
  it("最近 24 小時、新的在前", () => {
    const now = 100 * 3600;
    expect(recentNews([n("1", "old", "https://1", now - 25 * 3600), n("2", "new", "https://2", now - 3600), n("3", "newer", "https://3", now - 60)], now).map((x) => x.id)).toEqual(["3", "2"]);
  });
  it("重大新聞：主要媒體與總經關鍵字優先", () => {
    const list = [n("1", "Some startup raises money", "https://1", 300, "Blog"), n("2", "Fed signals rate cut", "https://2", 100, "Reuters"), n("3", "Stocks rise", "https://3", 200, "CNBC")];
    expect(rankMarketNews(list, 2).map((x) => x.id)).toEqual(["2", "3"]);
  });
});

describe("parseEarnings", () => {
  it("只留格式正確的，依日期排序", () => {
    const out = parseEarnings({ earningsCalendar: [{ symbol: "nvda", date: "2026-11-19", hour: "amc", epsEstimate: 1.2 }, { symbol: "AAPL", date: "bad" }, { symbol: "WMT", date: "2026-11-18", hour: "bmo" }] });
    expect(out.map((e) => [e.symbol, e.date, e.hour])).toEqual([["WMT", "2026-11-18", "bmo"], ["NVDA", "2026-11-19", "amc"]]);
  });
});

// ---- Vercel 函式 ----
describe("api/*（假的 Finnhub）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const fakeFetch = (handler: (url: URL) => unknown) =>
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      // 金鑰只能在標頭、不能在網址
      expect(url.search).not.toContain("SECRET");
      expect((init?.headers as Record<string, string>)["X-Finnhub-Token"]).toBe("SECRET");
      const body = handler(url);
      return new Response(JSON.stringify(body), { status: body === null ? 500 : 200 });
    });

  it("沒有金鑰 → 503，網頁會退回收盤資料", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "");
    expect((await quoteGET(new Request("https://x/api/quote?symbols=AAPL"))).status).toBe(503);
  });

  it("quote：回傳報價、標出失敗的代號、回應裡沒有金鑰、可被 CDN 快取", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "SECRET");
    vi.stubGlobal("fetch", fakeFetch((u) => (u.searchParams.get("symbol") === "AAPL" ? { c: 101, pc: 100, d: 1, dp: 1, t: 5 } : { c: 0, pc: 0 })));
    const res = await quoteGET(new Request("https://x/api/quote?symbols=AAPL,ZZZQ,2330.TW"));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain("SECRET");
    const body = JSON.parse(text);
    expect(body.quotes.AAPL.price).toBe(101);
    expect(body.failed).toEqual(["ZZZQ"]);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=30");
  });

  it("quote：Finnhub 全部失敗 → 502", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "SECRET");
    vi.stubGlobal("fetch", fakeFetch(() => null));
    expect((await quoteGET(new Request("https://x/api/quote?symbols=MSFT"))).status).toBe(502);
  });

  it("news：每檔最多 3 則、只有最近 24 小時", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "SECRET");
    const now = Math.floor(Date.now() / 1000);
    vi.stubGlobal(
      "fetch",
      fakeFetch(() => [0, 1, 2, 3, 30].map((h) => ({ id: h, headline: `News ${h}`, url: `https://n/${h}`, datetime: now - h * 3600 - 60, source: "Reuters" }))),
    );
    const body = await (await newsGET(new Request("https://x/api/news?symbols=TSLA"))).json();
    expect(body.items.map((x: NewsItem) => x.headline)).toEqual(["News 0", "News 1", "News 2"]);
  });

  it("earnings：只留要的代號", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "SECRET");
    vi.stubGlobal("fetch", fakeFetch(() => ({ earningsCalendar: [{ symbol: "NVDA", date: "2026-11-19", hour: "amc" }, { symbol: "OTHER", date: "2026-11-18" }] })));
    const body = await (await earningsGET(new Request("https://x/api/earnings?symbols=NVDA,AAPL"))).json();
    expect(body.items.map((e: { symbol: string }) => e.symbol)).toEqual(["NVDA"]);
  });
});
