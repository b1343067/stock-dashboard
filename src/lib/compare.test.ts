// 多檔比較的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import { compareStats, normalize, parseSymbols, rangeStart } from "./compare";

describe("normalize", () => {
  const time = ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"];
  const close = [100, 110, 99, 121];
  it("從起始日起算，第一天 = 0%", () => {
    expect(normalize(time, close, "2026-01-01").pct).toEqual([0, expect.closeTo(10), expect.closeTo(-1), expect.closeTo(21)]);
  });
  it("起始日不是交易日 → 從之後第一個交易日開始", () => {
    const n = normalize(time, close, "2026-01-03");
    expect(n.time[0]).toBe("2026-01-05");
    expect(n.pct[0]).toBe(0);
    expect(n.pct[2]).toBeCloseTo(10);
  });
  it("起始日在資料之後 → 空的", () => expect(normalize(time, close, "2027-01-01").pct).toEqual([]));
});

describe("compareStats", () => {
  it("報酬、最大回撤", () => {
    const s = compareStats(normalize(["a", "b", "c"], [100, 120, 90], "a"))!;
    expect(s.totalReturn).toBeCloseTo(-10);
    expect(s.maxDrawdown).toBeCloseTo(-25);
  });
  it("資料不足回傳 null", () => expect(compareStats({ time: ["a"], pct: [0] })).toBeNull());
});

describe("其他", () => {
  it("rangeStart 往回推月份", () => {
    expect(rangeStart("2026-11-13", "1y")).toBe("2025-11-13");
    expect(rangeStart("2026-11-13", "3m")).toBe("2026-08-13");
  });
  it("parseSymbols：去重、大寫、最多 4 檔", () => {
    expect(parseSymbols("nvda,AMD,,nvda,tsm,voo,qqq")).toEqual(["NVDA", "AMD", "TSM", "VOO"]);
    expect(parseSymbols("0050.TW%2CVOO")).toEqual(["0050.TW", "VOO"]);
    expect(parseSymbols(undefined)).toEqual([]);
  });
});
