// 網址路由的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import { chartHref, compareHref, parseHash } from "./route";

describe("parseHash", () => {
  it("剛打開網站（沒有 hash）→ 市場總覽", () => {
    for (const h of ["", "#", "#/", "#/today"]) expect(parseHash(h).page).toBe("today");
    expect(parseHash("#/market").page).toBe("market");
    expect(parseHash("#/lab").page).toBe("lab");
    expect(parseHash("#/office").page).toBe("office");
  });
  it("看盤頁：代號與週期", () => {
    expect(parseHash("#/NVDA/weekly")).toEqual({ page: "chart", symbol: "NVDA", timeframe: "weekly" });
    expect(parseHash("#/0050.TW/abc")).toEqual({ page: "chart", symbol: "0050.TW", timeframe: "daily" });
  });
  it("沒有代號的看盤頁（之後會選第一檔）", () => {
    expect(parseHash("#//daily")).toEqual({ page: "chart", symbol: null, timeframe: "daily" });
  });
  it("其他頁面", () => {
    expect(parseHash("#/screener").page).toBe("screener");
    expect(parseHash("#/portfolio").page).toBe("portfolio");
    expect(parseHash("#/analysis").page).toBe("analysis");
  });
  it("chartHref 和 parseHash 互相對應（含特殊字元）", () => {
    expect(parseHash(chartHref("BRK-B", "monthly"))).toEqual({ page: "chart", symbol: "BRK-B", timeframe: "monthly" });
  });
  it("比較頁", () => {
    expect(parseHash(compareHref(["NVDA", "0050.TW"]))).toEqual({ page: "compare", symbol: "NVDA,0050.TW", timeframe: "daily" });
    expect(parseHash("#/compare")).toEqual({ page: "compare", symbol: null, timeframe: "daily" });
  });
});
