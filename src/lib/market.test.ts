// 市場總覽計算的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import { breadth, categoryStats, heatIntensity, periodChange, topMovers } from "./market";
import type { TickerSummary } from "./types";

const t = (symbol: string, changePct: number, category?: string, spark?: number[]): TickerSummary => ({
  symbol, name: symbol, currency: "USD", lastDate: "2026-11-13", lastClose: 100, changePct, sample: false, category, spark,
});

const list = [
  t("A", 2, "科技", [100, 110]),
  t("B", -1, "科技", [100, 90]),
  t("C", 0, "金融", [50, 50]),
  t("D", 5, "金融", [80, 100]),
  t("E", -3, undefined, [10]), // spark 不足
];

describe("periodChange", () => {
  it("今日用 changePct、近 30 天用 spark 首尾", () => {
    expect(periodChange(list[0], "day")).toBe(2);
    expect(periodChange(list[0], "month")).toBeCloseTo(10);
    expect(periodChange(list[3], "month")).toBeCloseTo(25);
  });
  it("spark 不足時回傳 null", () => expect(periodChange(list[4], "month")).toBeNull());
});

describe("breadth", () => {
  it("上漲、下跌、平盤家數", () => {
    expect(breadth(list, "day")).toEqual({ up: 2, down: 2, flat: 1, upPct: 40 });
  });
  it("近 30 天略過資料不足的", () => {
    expect(breadth(list, "month")).toMatchObject({ up: 2, down: 1, flat: 1 });
  });
});

describe("topMovers", () => {
  it("漲幅前 n 名，只列有漲的", () => {
    expect(topMovers(list, "day", 5, "up").map((m) => m.ticker.symbol)).toEqual(["D", "A"]);
  });
  it("跌幅前 n 名", () => {
    expect(topMovers(list, "day", 1, "down").map((m) => m.ticker.symbol)).toEqual(["E"]);
  });
});

describe("categoryStats", () => {
  it("等權重平均，依設定檔順序，沒分類的放「其他」", () => {
    const s = categoryStats(list, ["金融", "科技"], "day");
    expect(s.map((c) => c.name)).toEqual(["金融", "科技", "其他"]);
    expect(s[0]).toMatchObject({ avg: 2.5, count: 2, up: 1 });
    expect(s[1].avg).toBeCloseTo(0.5);
  });
});

describe("heatIntensity", () => {
  it("超過上限算最深", () => {
    expect(heatIntensity(1.5, "day")).toBeCloseTo(0.5);
    expect(heatIntensity(-9, "day")).toBe(1);
    expect(heatIntensity(7.5, "month")).toBeCloseTo(0.5);
  });
});
