// ML 實驗室顯示邏輯的測試。執行：npm test
import { describe, expect, it } from "vitest";
import { dirConclusion, fmtP, pctileLabel, validMl, volConclusion, type MlData } from "./ml";
import { EN } from "./i18n-en";

const dm = (key: string, accuracy: number, vsUp: number, pValue?: number) => ({ key, name: key, accuracy, auc: 0.5, vsUp, pValue }) as MlData["direction"]["models"][number];
const dir = (models: MlData["direction"]["models"]): MlData["direction"] => ({ baseRate: 57.2, models, buyHold: { total: 1, annual: 1, sharpe: 1 }, curves: { time: [], buyHold: [] }, byYear: [], periods: 0 });

describe("方向實驗的結論（由數字決定，不寫死）", () => {
  it("都輸給永遠猜漲 → 說預測不了", () => {
    const c = dirConclusion(dir([dm("up", 57.2, 0), dm("logit", 55.7, -1.5, 0.99), dm("gbm", 53.8, -3.4, 0.99)]));
    expect(c.beat).toBe(false);
    expect(c.key).toContain("沒有任何模型贏過");
    expect(c.args).toEqual([57.2]);
  });
  it("贏一點點但 p 值大 → 說可能只是運氣", () => {
    const c = dirConclusion(dir([dm("up", 57, 0), dm("gbm", 57.5, 0.5, 0.3)]));
    expect(c.beat).toBe(false);
    expect(c.key).toContain("可能只是運氣");
  });
  it("贏而且 p < 0.05 → 說有統計證據（但提醒未來不一定成立）", () => {
    const c = dirConclusion(dir([dm("up", 57, 0), dm("gbm", 60, 3, 0.01), dm("logit", 58, 1, 0.04)]));
    expect(c.beat).toBe(true);
    expect(c.args[0]).toBe("gbm");
    expect(c.key).toContain("未來不一定成立");
  });
});

describe("波動實驗的結論", () => {
  const vm = (key: string, improvement: number) => ({ key, name: key, qlike: 1, mae: 1, improvement }) as MlData["vol"]["models"][number];
  it("最佳模型贏過基準", () => {
    expect(volConclusion({ models: [vm("naive", 0), vm("gbm", 16.7)], best: "gbm", tickers: {}, examples: {} }).args).toEqual(["gbm", 16.7]);
  });
  it("最佳就是基準 → 照實說沒有模型贏", () => {
    expect(volConclusion({ models: [vm("naive", 0), vm("gbm", -3)], best: "naive", tickers: {}, examples: {} }).key).toContain("沒有模型贏過");
  });
});

describe("小工具", () => {
  it("百分位白話", () => {
    expect([pctileLabel(95), pctileLabel(70), pctileLabel(50), pctileLabel(30), pctileLabel(5), pctileLabel(null)]).toEqual(["偏高", "略高", "一般", "略低", "偏低", "—"]);
  });
  it("p 值顯示", () => {
    expect(fmtP(0.0001)).toBe("< 0.001");
    expect(fmtP(0.0456)).toBe("0.046");
    expect(fmtP(undefined)).toBe("—");
  });
  it("ml.json 格式檢查", () => {
    expect(validMl(null)).toBe(false);
    expect(validMl({ vol: { models: [], tickers: {} }, direction: { models: [] } })).toBe(true);
  });
});

describe("結論文字都有英文", () => {
  it("每一種結論", () => {
    const vm = (key: string, improvement: number) => ({ key, name: key, qlike: 1, mae: 1, improvement }) as MlData["vol"]["models"][number];
    const keys = [
      volConclusion({ models: [vm("gbm", 10)], best: "gbm", tickers: {}, examples: {} }).key,
      volConclusion({ models: [vm("naive", 0)], best: "naive", tickers: {}, examples: {} }).key,
      dirConclusion(dir([dm("up", 57, 0), dm("gbm", 50, -7, 0.9)])).key,
      dirConclusion(dir([dm("up", 57, 0), dm("gbm", 58, 1, 0.3)])).key,
      dirConclusion(dir([dm("up", 57, 0), dm("gbm", 60, 3, 0.01)])).key,
    ];
    expect(keys.filter((k) => !(k in EN))).toEqual([]);
  });
});
