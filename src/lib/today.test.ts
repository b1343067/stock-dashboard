// 今日總覽計算的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Holding } from "./portfolio";
import type { LiveBase, ScreenerSeries, ScreenerTicker } from "./screener";
import type { LiveQuote } from "./finnhub";
import type { TickerSummary } from "./types";
import { bigMovers, daysUntil, estimateBar, intradayEvents, isNewSession, liveHoldings, newsTargets, recentEvents, sortEvents } from "./today";

// ---- 盤中預估：和「把那一根加進去完整重算」一致 ----
function fullIndicators(c: number[]) {
  const sma = (n: number) => (c.length >= n ? c.slice(-n).reduce((a, b) => a + b, 0) / n : null);
  let ag = 0, al = 0;
  let e12 = c[0], e26 = c[0], sig = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    ag = i === 1 ? Math.max(d, 0) : ag + (Math.max(d, 0) - ag) / 14;
    al = i === 1 ? Math.max(-d, 0) : al + (Math.max(-d, 0) - al) / 14;
  }
  for (let i = 1; i < c.length; i++) {
    e12 += (2 / 13) * (c[i] - e12);
    e26 += (2 / 27) * (c[i] - e26);
    sig = i === 1 ? e12 - e26 : sig + (2 / 10) * (e12 - e26 - sig);
  }
  const last20 = c.slice(-20);
  const m = sma(20)!;
  const sd = Math.sqrt(last20.reduce((s, x) => s + (x - m) ** 2, 0) / 20);
  return { ma20: m, ma200: sma(200), rsi: 100 - 100 / (1 + ag / al), macd: e12 - e26, signal: sig, bbUpper: m + 2 * sd, ag, al, e12, e26, sig };
}

describe("estimateBar（盤中預估）", () => {
  const closes = Array.from({ length: 260 }, (_, i) => 100 + Math.sin(i / 7) * 10 + i * 0.05);
  const prev = closes.slice(0, -1);
  const p = fullIndicators(prev);
  const sum = (n: number) => prev.slice(-(n - 1)).reduce((a, b) => a + b, 0);
  const base: LiveBase = {
    close: prev[prev.length - 1], sum10: sum(10), sum20: sum(20), sum50: sum(50), sum200: sum(200),
    sumSq20: prev.slice(-19).reduce((a, b) => a + b * b, 0),
    avgGain: p.ag, avgLoss: p.al, ema12: p.e12, ema26: p.e26, signal: p.sig,
  };
  const price = closes[closes.length - 1];
  const est = estimateBar(base, price);
  const full = fullIndicators(closes);
  it("MA、布林、RSI、MACD 都和完整重算相同", () => {
    expect(est.ma20).toBeCloseTo(full.ma20, 8);
    expect(est.ma200).toBeCloseTo(full.ma200!, 8);
    expect(est.bbUpper).toBeCloseTo(full.bbUpper, 6);
    expect(est.rsi).toBeCloseTo(full.rsi, 6);
    expect(est.macd).toBeCloseTo(full.macd, 8);
    expect(est.signal).toBeCloseTo(full.signal, 8);
  });
  it("資料不足（null）時對應的指標也是 null", () => {
    expect(estimateBar({ ...base, sum200: null, avgGain: null }, 1)).toMatchObject({ ma200: null, rsi: null });
  });
});

// ---- 訊號 ----
function series(close: number[], extra: Partial<ScreenerSeries> = {}): ScreenerSeries {
  const nulls = () => close.map(() => null);
  return {
    time: close.map((_, i) => `2026-11-${String(10 + i).padStart(2, "0")}`), close,
    ma10: nulls(), ma20: nulls(), ma50: nulls(), ma200: nulls(), rsi: nulls(),
    macd: nulls(), signal: nulls(), hist: nulls(), bbUpper: nulls(), bbMiddle: nulls(), bbLower: nulls(), ...extra,
  };
}
function ticker(symbol: string, daily: ScreenerSeries, extra: Partial<ScreenerTicker> = {}): ScreenerTicker {
  return { symbol, name: symbol, currency: "USD", lastDate: daily.time[daily.time.length - 1], lastClose: daily.close[daily.close.length - 1], changePct: 0, daily, weekly: series([1]), monthly: series([1]), ...extra };
}

describe("recentEvents（收盤資料，最近 3 根）", () => {
  it("偵測突破／跌破均線、RSI、MACD，並標出幾根前", () => {
    const s = series([90, 95, 105, 104], {
      ma50: [100, 100, 100, 100],
      rsi: [35, 28, 31, 32],
      macd: [1, 1, -1, -1], signal: [0, 0, 0, 0],
    });
    const ev = recentEvents(ticker("AAA", s)).map((e) => [e.label, e.tone, e.barsAgo]);
    expect(ev).toContainEqual(["突破 MA50", "bull", 1]);
    expect(ev).toContainEqual(["RSI 跌破 30", "danger", 2]);
    expect(ev).toContainEqual(["RSI 回升到 30 以上", "bull", 1]);
    expect(ev).toContainEqual(["MACD 死亡交叉", "danger", 1]);
  });
  it("超過 3 根前的不算", () => {
    const s = series([90, 105, 106, 107, 108], { ma50: [100, 100, 100, 100, 100] });
    expect(recentEvents(ticker("AAA", s))).toEqual([]);
  });
});

describe("盤中預估訊號", () => {
  // 最後收盤 99 在 MA20 之下；即時價 130 會讓「今天收盤」站上 MA20
  const s = series(Array(20).fill(99), { ma20: Array(20).fill(100) });
  const base: LiveBase = { close: 99, sum10: null, sum20: 19 * 100, sum50: null, sum200: null, sumSq20: null, avgGain: null, avgLoss: null, ema12: null, ema26: null, signal: null };
  const tk = ticker("AAA", s, { lastDate: "2026-11-16", liveBase: base });
  const q = (price: number, time: number): LiveQuote => ({ symbol: "AAA", price, prevClose: 99, change: 0, changePct: 0, time });
  const tue = Date.parse("2026-11-17T15:00:00Z") / 1000; // 紐約 11/17 10:00（新的交易日）
  const mon = Date.parse("2026-11-16T20:00:00Z") / 1000; // 紐約 11/16 15:00（每日資料已經有這天）

  it("新交易日：用即時價預估，標示為盤中", () => {
    const ev = intradayEvents(tk, q(130, tue));
    expect(ev).toEqual([{ symbol: "AAA", label: "突破 MA20", tone: "bull", tf: "daily", barsAgo: 0, intraday: true }]);
  });
  it("報價日期和最後一根相同（已收盤、資料已更新）→ 不預估，避免假訊號", () => {
    expect(isNewSession(q(130, mon), "2026-11-16")).toBe(false);
    expect(intradayEvents(tk, q(130, mon))).toEqual([]);
  });
  it("沒有 liveBase（舊資料）→ 不預估", () => {
    expect(intradayEvents({ ...tk, liveBase: undefined }, q(130, tue))).toEqual([]);
  });
  it("排序：持股 → 盤中預估 → 越新越前面", () => {
    const e = (symbol: string, barsAgo: number, intraday = false) => ({ symbol, label: "x", tone: "bull" as const, tf: "daily" as const, barsAgo, intraday });
    expect(sortEvents([e("B", 0), e("A", 2), e("C", 0, true), e("H", 2)], new Set(["H"])).map((x) => x.symbol)).toEqual(["H", "C", "B", "A"]);
  });
});

// ---- 持股即時損益 ----
describe("liveHoldings", () => {
  const index: TickerSummary[] = [
    { symbol: "AAA", name: "AAA", currency: "USD", lastDate: "2026-11-16", lastClose: 100, changePct: 0 } as TickerSummary,
    { symbol: "2330.TW", name: "台積電", currency: "TWD", lastDate: "2026-11-17", lastClose: 1100, changePct: 10 } as TickerSummary,
  ];
  const h = (symbol: string, shares: number, cost: number, extra: Partial<Holding> = {}): Holding => ({ id: symbol, symbol, shares, cost, type: "core", tpPct: null, slPct: null, ...extra });
  const live = { AAA: { symbol: "AAA", price: 110, prevClose: 100, change: 10, changePct: 10, time: 1 } };
  const fx = { USDTWD: 32 };

  it("美股用即時價、台股用收盤；今日損益換成美元加總", () => {
    const s = liveHoldings([h("AAA", 10, 50), h("2330.TW", 1000, 1000)], index, live, fx, DEFAULT_SETTINGS);
    const aaa = s.rows.find((r) => r.holding.symbol === "AAA")!;
    expect(aaa.isLive).toBe(true);
    expect(aaa.dayPnlUsd).toBeCloseTo(100); // (110−100) × 10
    const tw = s.rows.find((r) => r.holding.symbol === "2330.TW")!;
    expect(tw.isLive).toBe(false);
    expect(tw.dayPnlUsd).toBeCloseTo((1100 - 1000) * 1000 / 32); // 昨收由漲跌 10% 反推 = 1000
    expect(s.dayPnlUsd).toBeCloseTo(100 + 100_000 / 32);
    expect(s.liveCount).toBe(1);
    expect(s.dayPnlPct).toBeCloseTo((s.dayPnlUsd / (s.totalValueUsd - s.dayPnlUsd)) * 100);
  });

  it("觸及或接近停利停損的排最前面", () => {
    // AAA 短線、成本 100、停損 5%：即時價 110 → 不觸及；BBB 成本 200 停損 20% → 價格 100 已觸及
    const idx = [...index, { symbol: "BBB", name: "BBB", currency: "USD", lastDate: "2026-11-16", lastClose: 100, changePct: 0 } as TickerSummary];
    const s = liveHoldings([h("AAA", 100, 100), h("BBB", 1, 200, { type: "short", slPct: 20 })], idx, live, fx, DEFAULT_SETTINGS);
    expect(s.rows[0].holding.symbol).toBe("BBB");
    expect(s.rows[0].status).toBe("sl-hit");
  });
});

describe("新聞、異常波動、財報", () => {
  it("新聞：持股 → 異常波動 → 有訊號的，只要美股、不重複", () => {
    expect(newsTargets(["AAPL", "2330.TW"], ["TSLA", "AAPL"], ["NVDA"], 3)).toEqual(["AAPL", "TSLA", "NVDA"]);
  });
  it("異常波動：|漲跌| ≥ 5%，有即時價用即時價", () => {
    const tk = (symbol: string, changePct: number) => ({ symbol, changePct }) as TickerSummary;
    const live = { B: { symbol: "B", price: 1, prevClose: 1, change: 0, changePct: -6, time: 1 } };
    expect(bigMovers([tk("A", 7), tk("B", 1), tk("C", 2)], live, new Set(["A", "B", "C"]))).toEqual([{ symbol: "A", changePct: 7 }, { symbol: "B", changePct: -6 }]);
  });
  it("daysUntil", () => expect(daysUntil("2026-11-20", "2026-11-17")).toBe(3));
});
