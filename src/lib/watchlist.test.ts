// 觀察清單分組與搜尋的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import { filterByCategory, groupTickers, matchesQuery } from "./watchlist";

const items = [
  { symbol: "NVDA", name: "NVIDIA", category: "科技" },
  { symbol: "TSM", name: "台積電 ADR", category: "科技" },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", category: "大盤與債券" },
  { symbol: "2330.TW", name: "台積電", category: "台股" },
  { symbol: "OLD", name: "舊資料沒有分類" },
];

describe("matchesQuery", () => {
  it("代號、名稱都能搜，不分大小寫", () => {
    expect(matchesQuery(items[0], "nv")).toBe(true);
    expect(matchesQuery(items[0], "  Nvidia ")).toBe(true);
    expect(matchesQuery(items[3], "台積")).toBe(true);
    expect(matchesQuery(items[2], "台積")).toBe(false);
  });
  it("空白關鍵字全部符合", () => expect(matchesQuery(items[0], "  ")).toBe(true));
});

describe("groupTickers", () => {
  it("依設定檔的分類順序分組，沒有分類的放最後「其他」", () => {
    const g = groupTickers(items, ["大盤與債券", "科技", "台股"]);
    expect(g.map((x) => x.name)).toEqual(["大盤與債券", "科技", "台股", "其他"]);
    expect(g[1].items.map((x) => x.symbol)).toEqual(["NVDA", "TSM"]);
  });
  it("搜尋時只留符合的股票，空的分類不顯示", () => {
    const g = groupTickers(items, ["大盤與債券", "科技", "台股"], "台積");
    expect(g.map((x) => x.name)).toEqual(["科技", "台股"]);
    expect(g.flatMap((x) => x.items).map((x) => x.symbol)).toEqual(["TSM", "2330.TW"]);
  });
  it("設定檔沒列到的分類也會出現（接在後面）", () => {
    expect(groupTickers(items, ["台股"]).map((x) => x.name)).toEqual(["台股", "科技", "大盤與債券", "其他"]);
  });
});

describe("filterByCategory", () => {
  it("只留某個分類", () => {
    expect(filterByCategory(items, "科技").map((x) => x.symbol)).toEqual(["NVDA", "TSM"]);
    expect(filterByCategory(items, "其他").map((x) => x.symbol)).toEqual(["OLD"]);
    expect(filterByCategory(items, "all")).toHaveLength(5);
  });
});
