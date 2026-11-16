// 「現在的狀態」卡片的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import { bbStatus, maStatus, macdStatus, rsiStatus } from "./signals";

describe("RSI", () => {
  it("超賣、超買、中性", () => {
    expect(rsiStatus(24.9)).toMatchObject({ tag: "超賣", tone: "bull", gauge: 24.9 });
    expect(rsiStatus(75)).toMatchObject({ tag: "超買", tone: "bear" });
    expect(rsiStatus(50)).toMatchObject({ tag: "中性", tone: "neutral" });
  });
  it("沒有資料回傳 null", () => expect(rsiStatus(null)).toBeNull());
});

describe("均線排列", () => {
  it("多頭排列：股價 > MA20 > MA50 > MA200", () => {
    expect(maStatus(110, 105, 100, 90)).toMatchObject({ tag: "多頭排列", tone: "bull", value: "+10.0%" });
  });
  it("空頭排列：股價 < MA20 < MA50 < MA200", () => {
    expect(maStatus(162.85, 198.69, 214.63, 203.92)?.tag).toBe("盤整"); // MA50 > MA200，不是完整空頭排列
    expect(maStatus(80, 90, 100, 110)).toMatchObject({ tag: "空頭排列", tone: "bear" });
  });
  it("沒有 MA50 時用 MA20", () => {
    expect(maStatus(110, 100, null, null)?.note).toContain("20 日均線");
  });
});

describe("MACD", () => {
  it("偏多／偏空與柱狀體變化", () => {
    expect(macdStatus(1, 0.5, 0.5, 0.3)).toMatchObject({ tag: "偏多", tone: "bull" });
    expect(macdStatus(1, 0.5, 0.5, 0.3)?.note).toContain("放大");
    expect(macdStatus(-1, -0.5, -0.5, -0.8)?.note).toContain("縮短");
  });
});

describe("布林 %B", () => {
  it("中段、接近、突破", () => {
    expect(bbStatus(100, 110, 90)).toMatchObject({ value: "50%", tag: "中段" });
    expect(bbStatus(91, 110, 90)?.tag).toBe("接近下軌");
    expect(bbStatus(112, 110, 90)).toMatchObject({ tag: "突破上軌", gauge: 100 });
    expect(bbStatus(100, null, 90)).toBeNull();
  });
});
