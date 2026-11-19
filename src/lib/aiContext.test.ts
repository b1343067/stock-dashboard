import { describe, expect, it } from "vitest";
import { buildContext, fundamentalRows, latestDates, staleMarkets, type NewsFile } from "./aiContext";
import { sanitizeNotifyConfig } from "./notify";
import type { ScreenerData, ScreenerTicker } from "./screener";
import type { IndexData } from "./types";

// 30 天的序列：最後一天收盤跌破 20 日線（讓「跌破」類規則有機會觸發；這裡只檢查結構）
function series(closes: number[]) {
  const n = closes.length;
  const flat = (v: number) => Array(n).fill(v);
  return { time: closes.map((_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`), close: closes, volume: flat(1000), ma10: flat(100), ma20: flat(100), ma50: flat(100), ma200: flat(90), rsi: flat(50), macd: flat(0.1), signal: flat(0.05), hist: flat(0.05), bbUpper: flat(110), bbMiddle: flat(100), bbLower: flat(90) };
}
function tk(symbol: string, currency: string, lastDate: string, changePct: number, f?: ScreenerTicker["fundamentals"]): ScreenerTicker {
  const s = series(Array.from({ length: 30 }, (_, i) => 100 + i * 0.1));
  return { symbol, name: symbol, currency, lastDate, lastClose: 102.9, changePct, daily: s, weekly: s, monthly: s, fundamentals: f } as ScreenerTicker;
}

const tickers = [
  tk("VOO", "USD", "2026-11-18", 0.5, { pe: 25, forwardPe: null, pb: 4, dividendYield: 1.2, high52w: 105, low52w: 80 }),
  tk("NVDA", "USD", "2026-11-18", 3.1, { pe: 60, forwardPe: null, pb: 30, dividendYield: 0.02, high52w: 103, low52w: 60 }),
  tk("KO", "USD", "2026-11-18", -1.2, { pe: 22, forwardPe: null, pb: 9, dividendYield: 3.1, high52w: 130, low52w: 100 }),
  tk("0050.TW", "TWD", "2026-11-19", 1.0),
  tk("2330.TW", "TWD", "2026-11-19", -2.0),
];
const screener: ScreenerData = { generatedAt: "2026-11-19T00:00:00Z", bars: 30, tickers };
const index: IndexData = {
  generatedAt: "2026-11-19T00:00:00Z",
  sample: false,
  fx: { USDTWD: 32 },
  tickers: tickers.map((t) => ({ symbol: t.symbol, name: t.name, currency: t.currency, lastDate: t.lastDate, lastClose: t.lastClose, changePct: t.changePct, sample: false, spark: [100, 101, 102.9] })),
};
const cfg = sanitizeNotifyConfig({ benchmarks: ["VOO", "0050.TW"], exclude: ["0050.TW"], watch: ["NVDA", "KO"], danger: [], rules: [] });
const news: NewsFile = {
  generatedAt: "2026-11-18T23:00:00Z",
  market: [{ id: "1", symbol: null, headline: "Fed minutes due", source: "X", url: "https://x", datetime: 1_763_500_000 }],
  watch: { NVDA: [{ id: "2", symbol: "NVDA", headline: "NVDA earnings", source: "Y", url: "https://y", datetime: 1_763_500_000 }] },
  earnings: [
    { symbol: "NVDA", date: "2026-11-20", hour: "amc", epsEstimate: 1 },
    { symbol: "ZZZZ", date: "2026-11-20", hour: "bmo", epsEstimate: 1 },
  ],
};

describe("aiContext", () => {
  it("各市場的最新日期、過期判斷", () => {
    expect(latestDates(index)).toEqual({ us: "2026-11-18", tw: "2026-11-19" });
    expect(staleMarkets({ us: "2026-11-18", tw: "2026-11-19" }, "2026-11-19")).toEqual([]);
    expect(staleMarkets({ us: "2026-11-13", tw: null }, "2026-11-19")).toEqual(["us", "tw"]);
  });

  it("基本面：距 52 週高低點（%）", () => {
    const rows = fundamentalRows(tickers);
    const voo = rows.find((r) => r.symbol === "VOO")!;
    expect(voo.fromHigh52w).toBeCloseTo((102.9 / 105 - 1) * 100, 1);
    expect(rows.some((r) => r.symbol === "0050.TW")).toBe(false); // 沒有基本面的不列
  });

  it("素材：排除不想看的股票、財報只留觀察清單、只有公開資料", () => {
    const c = buildContext({ index, screener, mlVol: null, news, cfg, today: "2026-11-19" });
    expect(c.dataDates).toEqual({ us: "2026-11-18", tw: "2026-11-19", news: "2026-11-18" });
    expect(c.market.benchmarks.map((b) => b.symbol)).toEqual(["VOO", "0050.TW"]);
    expect(c.market.topUp.map((m) => m.symbol)).not.toContain("0050.TW");
    expect(c.tech.watch.map((w) => w.symbol)).toEqual(["NVDA", "KO"]);
    expect(c.fundamental.highestYield[0].symbol).toBe("KO");
    expect(c.news?.earnings7d.map((e) => e.symbol)).toEqual(["NVDA"]);
    expect(c.allowedSymbols).toContain("2330.TW");
    // 素材裡不應該有任何持股相關欄位
    expect(JSON.stringify(c)).not.toMatch(/shares|cost|holding/i);
  });

  it("沒有新聞檔時 news 為 null", () => {
    expect(buildContext({ index, screener, mlVol: null, news: null, cfg, today: "2026-11-19" }).news).toBeNull();
  });
});
