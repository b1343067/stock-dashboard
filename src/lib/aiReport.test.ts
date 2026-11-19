import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { doneCount, findForbidden, pick, reportStale, validateReport } from "./aiReport";
import type { AiReport } from "./types";

const sample = JSON.parse(readFileSync("public/ai/sample-report.json", "utf8")) as AiReport;
const watch = JSON.parse(readFileSync("config/watchlist.json", "utf8")) as { groups: { tickers: { symbol: string }[] }[] };
const symbols = new Set(watch.groups.flatMap((g) => g.tickers.map((t) => t.symbol)));
const clone = (): AiReport => JSON.parse(JSON.stringify(sample));

describe("validateReport", () => {
  it("範例報告通過檢查（含觀察清單檢查）", () => {
    const r = validateReport(sample, symbols);
    expect(r.errors).toEqual([]);
    expect(r.report?.sample).toBe(true);
    expect(doneCount(sample)).toBe(5);
  });

  it("不是物件、缺少 roles 都判定無效", () => {
    expect(validateReport(null).report).toBeNull();
    expect(validateReport({ ...clone(), roles: undefined }).report).toBeNull();
  });

  it("擋下買賣建議與目標價", () => {
    const r = clone();
    r.roles.tech.sections[0].items[0].text.zh = "NVDA 建議買進";
    const res = validateReport(r);
    expect(res.report).toBeNull();
    expect(res.errors.join()).toContain("禁用詞");
  });

  it("字數與點數上限", () => {
    const r = clone();
    r.roles.tech.summary.zh = "字".repeat(61);
    r.roles.lead.points = r.roles.lead.points!.slice(0, 2);
    const res = validateReport(r);
    expect(res.errors.some((e) => e.includes("超過 60 字"))).toBe(true);
    expect(res.errors.some((e) => e.includes("今日重點"))).toBe(true);
  });

  it("提到觀察清單以外的股票（可能是持股）要擋下", () => {
    const r = clone();
    r.roles.tech.sections[0].items[0].refs = [{ symbol: "MYSECRET" }];
    expect(validateReport(r, symbols).errors.join()).toContain("不在觀察清單");
  });

  it("休假中的角色不用檢查內容；狀態錯誤要擋", () => {
    const r = clone();
    r.roles.news = { status: "off", dataDate: null, summary: { zh: "", en: "" }, sections: [] };
    expect(validateReport(r).errors).toEqual([]);
    (r.roles.news as { status: string }).status = "busy";
    expect(validateReport(r).report).toBeNull();
  });

  it("沒有 zh 或 en 要擋", () => {
    const r = clone();
    r.roles.fundamental.summary = { zh: "只有中文", en: "" };
    expect(validateReport(r).report).toBeNull();
  });
});

describe("findForbidden", () => {
  it("英文 sell-off 是新聞用語，不算建議", () => {
    expect(findForbidden("Tech sell-off deepens")).toBeNull();
    expect(findForbidden("market selloff")).toBeNull();
    expect(findForbidden("We think you should sell")).toBe("sell");
    expect(findForbidden("Buy the dip")).toBe("Buy");
    expect(findForbidden("price target raised")).toBe("price target");
    expect(findForbidden("營收成長")).toBeNull();
  });
});

describe("reportStale / pick", () => {
  it("落後 3 個平日以上算過期", () => {
    expect(reportStale(sample, "2026-11-19")).toBe(false);
    expect(reportStale(sample, "2026-11-24")).toBe(true); // 11/19、20、23 三個平日沒更新
    expect(reportStale({ ...sample, dataDates: { us: null, tw: null, news: null } }, "2026-11-19")).toBe(true);
  });
  it("依語言取文字", () => {
    expect(pick({ zh: "中", en: "en" }, "en")).toBe("en");
    expect(pick({ zh: "中", en: "en" }, "zh")).toBe("中");
  });
});
