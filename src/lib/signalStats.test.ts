import { describe, expect, it } from "vitest";
import { makeCondition } from "./screener";
import { backtestable, computeSignalStats, forwardReturn, signalDays, statVerdict, verdictText, windowAt, type FullSeries, type RuleStat, type StatRule } from "./signalStats";

/** 假資料：RSI 是週期 40 天的波（每 40 天會跌破 30 一次），收盤價每天 +0.1% */
function series(n = 400): FullSeries {
  const time = Array.from({ length: n }, (_, i) => `2024-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`);
  const close = Array.from({ length: n }, (_, i) => 100 * 1.001 ** i);
  const rsi = Array.from({ length: n }, (_, i) => 50 + 25 * Math.sin((i / 40) * 2 * Math.PI));
  const ma = close.map((c) => c * 0.98);
  const nul = close.map(() => null);
  return { time, close, volume: close.map(() => 1000), ma10: ma, ma20: ma, ma50: ma, ma200: ma, rsi, macd: nul, signal: nul, hist: nul, bbUpper: nul, bbMiddle: nul, bbLower: nul };
}

const rsiLow: StatRule = { name: "RSI 低", group: "danger", mode: "and", conditions: [{ ...makeCondition("rsiBelow", "daily"), value: 30 }] };

describe("signalStats", () => {
  it("windowAt 只看得到當天以前的 30 根", () => {
    const s = series();
    const w = windowAt(s, 100);
    expect(w.close).toHaveLength(30);
    expect(w.time.at(-1)).toBe(s.time[100]);
    expect(w.close.at(-1)).toBe(s.close[100]);
    expect(windowAt(s, 5).close).toHaveLength(6);
  });

  it("只算第一天出現（昨天不符合、今天符合）", () => {
    const s = series();
    const days = signalDays(s, rsiLow);
    // RSI 低於 30 一次會連續好幾天，但只算第一天 → 大約每 40 天一次
    expect(days.length).toBeGreaterThan(5);
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBe(40);
    for (const t of days) {
      expect(s.rsi[t]!).toBeLessThan(30);
      expect(s.rsi[t - 1]!).toBeGreaterThanOrEqual(30);
    }
  });

  it("不偷看未來：竄改某天以後的價格與指標，之前的訊號日期不變", () => {
    const s = series();
    const k = 250;
    const before = signalDays(s, rsiLow).filter((t) => t <= k);
    const bad = { ...s, close: s.close.map((c, i) => (i > k ? c * 3 : c)), rsi: s.rsi.map((r, i) => (i > k ? 5 : r)) };
    expect(signalDays(bad, rsiLow).filter((t) => t <= k)).toEqual(before);
  });

  it("報酬從隔天收盤算起；資料不夠 → null", () => {
    const close = [100, 110, 121, 133.1];
    expect(forwardReturn(close, 0, 2)).toBeCloseTo(21, 5); // 110 → 133.1
    expect(forwardReturn(close, 1, 5)).toBeNull();
  });

  it("統計：次數、平均、上漲機率、基準", () => {
    const s = series();
    const out = computeSignalStats({ tickers: [{ symbol: "AAA", daily: s }], rules: [rsiLow], generatedAt: "x" });
    const r = out.rules[0];
    expect(r.events).toBe(signalDays(s, rsiLow).length);
    expect(r.symbols).toBe(1);
    // 每天都 +0.1%：5 天報酬 ≈ 0.5%、全部上漲
    expect(r.h5.avg).toBeCloseTo(0.5, 1);
    expect(r.h5.win).toBe(100);
    expect(out.baseline.h20.avg).toBeCloseTo(2.02, 1);
    expect(r.h20.n).toBeLessThanOrEqual(r.events);
  });

  it("週線、基本面條件的規則略過", () => {
    const weekly: StatRule = { ...rsiLow, name: "週線", conditions: [makeCondition("macdGolden", "weekly")] };
    const fund: StatRule = { ...rsiLow, name: "基本面", conditions: [makeCondition("peBelow")] };
    expect(backtestable(rsiLow)).toBe(true);
    expect(backtestable(weekly)).toBe(false);
    expect(backtestable(fund)).toBe(false);
    const out = computeSignalStats({ tickers: [{ symbol: "AAA", daily: series() }], rules: [weekly, fund], generatedAt: "x" });
    expect(out.rules).toHaveLength(0);
    expect(out.skipped).toEqual(["週線", "基本面"]);
  });

  it("結論：樣本太少不下結論；差 1 個百分點以上才算有差", () => {
    const base = { h5: { n: 1000, avg: 0.3, win: 55 }, h20: { n: 1000, avg: 1.2, win: 58 } };
    const rule = (avg: number, n = 100, group: RuleStat["group"] = "danger"): RuleStat => ({ name: "x", group, events: n, symbols: 3, h5: { n, avg: 0, win: 50 }, h20: { n, avg, win: 50 }, lastDate: null });
    expect(statVerdict(rule(-5, 10), base)).toBe("few");
    expect(statVerdict(rule(-1), base)).toBe("worse");
    expect(statVerdict(rule(1.5), base)).toBe("same");
    expect(statVerdict(rule(3), base)).toBe("better");
    expect(verdictText(rule(-1), "worse")).toContain("有參考價值");
    expect(verdictText(rule(3), "better")).toContain("嚇出場");
    expect(verdictText(rule(3, 100, "bullish"), "better")).toContain("有參考價值");
  });
});
