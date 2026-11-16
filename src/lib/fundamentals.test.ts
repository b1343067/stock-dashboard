// 基本面工具的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import { fmtBigMoney, pctFrom, peComment, rangePosition } from "./fundamentals";

describe("rangePosition", () => {
  it("在區間中的位置", () => {
    expect(rangePosition(150, 100, 200)).toBe(0.5);
    expect(rangePosition(100, 100, 200)).toBe(0);
    expect(rangePosition(250, 100, 200)).toBe(1); // 超出區間時夾在 0～1
  });
  it("資料不足 → null", () => {
    expect(rangePosition(150, null, 200)).toBeNull();
    expect(rangePosition(150, 200, 200)).toBeNull();
  });
});

describe("pctFrom", () => {
  it("距離百分比", () => expect(pctFrom(90, 100)).toBeCloseTo(-10));
  it("沒有參考價 → null", () => expect(pctFrom(90, null)).toBeNull());
});

describe("fmtBigMoney", () => {
  it("兆、億、萬", () => {
    expect(fmtBigMoney(3.21e12)).toBe("3.21 兆");
    expect(fmtBigMoney(345_600_000_000)).toBe("3,456 億");
    expect(fmtBigMoney(5e6)).toBe("500 萬");
  });
  it("沒有資料 → —", () => {
    expect(fmtBigMoney(null)).toBe("—");
    expect(fmtBigMoney(0)).toBe("—");
  });
});

describe("peComment", () => {
  it("依區間給說明", () => {
    expect(peComment(null)).toContain("ETF");
    expect(peComment(8)).toContain("偏低");
    expect(peComment(15)).toBe("中等");
    expect(peComment(50)).toContain("很高");
  });
});
