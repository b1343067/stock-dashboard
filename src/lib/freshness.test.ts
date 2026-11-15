// 資料新鮮度檢查的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import { checkFreshness, missedWeekdays } from "./freshness";

describe("missedWeekdays", () => {
  it("週五的資料、週一早上看（台灣時間週二 06:00 前）→ 沒有落後", () => {
    expect(missedWeekdays("2026-11-13", "2026-11-16")).toBe(0);
  });
  it("週五的資料、下週三 → 落後週一、週二兩天", () => {
    expect(missedWeekdays("2026-11-13", "2026-11-18")).toBe(2);
  });
  it("跨過週末不算", () => {
    expect(missedWeekdays("2026-11-12", "2026-11-18")).toBe(3); // 11-12 週四 → 週五、週一、週二
  });
  it("同一天為 0", () => {
    expect(missedWeekdays("2026-11-13", "2026-11-13")).toBe(0);
  });
});

describe("checkFreshness", () => {
  it("取所有股票中最新的日期", () => {
    const f = checkFreshness(["2026-11-10", "2026-11-13", "bad"], new Date("2026-11-16T22:30:00Z"))!;
    expect(f.latestDate).toBe("2026-11-13");
    expect(f.stale).toBe(false);
  });
  it("落後 3 個平日以上視為過期", () => {
    const f = checkFreshness(["2026-11-13"], new Date("2026-11-19T12:00:00Z"))!;
    expect(f.missed).toBe(3);
    expect(f.stale).toBe(true);
  });
  it("沒有資料時回傳 null", () => {
    expect(checkFreshness([])).toBeNull();
  });
});
