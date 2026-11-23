import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addWeek, checkWeeklyReport, mondayOf, previousWeek, validateWeekly, weekRange } from "./aiWeekly";

const sample = JSON.parse(readFileSync("public/ai/sample-weekly.json", "utf8"));
const syms = new Set(["VOO", "NVDA", "AMD", "COST"]);

describe("aiWeekly", () => {
  it("日期：週一、上一週", () => {
    expect(mondayOf("2026-11-23")).toBe("2026-11-23"); // 週一
    expect(mondayOf("2026-11-29")).toBe("2026-11-23"); // 週日
    expect(previousWeek("2026-11-23")).toEqual({ week: "2026-11-16", from: "2026-11-16", to: "2026-11-20" });
    expect(weekRange("2026-11-16")).toBe("11/16–11/20");
  });
  it("範例週報格式正確", () => {
    expect(validateWeekly(sample, syms).errors).toEqual([]);
  });
  it("擋下：禁用詞、重點太少、不在觀察清單、week 不是週一", () => {
    const bad = JSON.parse(JSON.stringify(sample));
    bad.week = "2026-11-10";
    bad.points = bad.points.slice(0, 2);
    bad.summary.zh = "建議買進 NVDA";
    bad.sections[0].items[0].refs = [{ symbol: "ZZZZ" }];
    const errs = validateWeekly(bad, syms).errors.join("\n");
    expect(errs).toContain("週一");
    expect(errs).toContain("3～6 點");
    expect(errs).toContain("禁用詞");
    expect(errs).toContain("ZZZZ");
  });
  it("正式週報：不能是範例、basedOn 要在那一週", () => {
    expect(checkWeeklyReport(sample, syms)).toContain("正式週報的 sample 必須是 false");
    const real = { ...sample, sample: false, basedOn: ["2026-11-10", "2026-11-20"] };
    expect(checkWeeklyReport(real, syms).join()).toContain("2026-11-20");
  });
  it("索引：新到舊、同一週覆蓋、超過 12 週刪舊的", () => {
    const weeks = Array.from({ length: 12 }, (_, i) => `2026-0${Math.floor(i / 4) + 1}-${String((i % 4) * 7 + 5).padStart(2, "0")}`);
    const { index, removed } = addWeek({ weeks: [...weeks].reverse() }, "2026-11-16");
    expect(index.weeks[0]).toBe("2026-11-16");
    expect(index.weeks).toHaveLength(12);
    expect(removed).toEqual([weeks[0]]);
    expect(addWeek(index, "2026-11-16").index.weeks).toEqual(index.weeks);
  });
});
