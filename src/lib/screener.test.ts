// 篩選器邏輯的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  findCrossDown,
  findCrossUp,
  makeCondition,
  runScreen,
  sanitizeConditions,
  type Condition,
  type ScreenerSeries,
  type ScreenerTicker,
} from "./screener";

/** 建立測試用的資料：只給需要的欄位，其餘補 null */
function series(partial: Partial<ScreenerSeries> & { close: number[] }): ScreenerSeries {
  const n = partial.close.length;
  const nulls = () => Array<number | null>(n).fill(null);
  return {
    time: partial.close.map((_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`),
    ma10: nulls(), ma20: nulls(), ma50: nulls(), ma200: nulls(),
    rsi: nulls(), macd: nulls(), signal: nulls(), hist: nulls(),
    bbUpper: nulls(), bbMiddle: nulls(), bbLower: nulls(),
    ...partial,
  };
}

function ticker(daily: ScreenerSeries): ScreenerTicker {
  return {
    symbol: "TEST", name: "Test", currency: "USD", lastDate: "2026-01-10",
    lastClose: daily.close[daily.close.length - 1], changePct: 0,
    daily, weekly: daily, monthly: daily,
  };
}

const cond = (kind: Condition["kind"], extra: Partial<Condition> = {}): Condition => ({ ...makeCondition(kind), ...extra });

describe("findCrossUp / findCrossDown", () => {
  it("找到最近 n 根內的向上穿越，回傳距今幾根", () => {
    const a = [1, 1, 3, 3, 3];
    const b = [2, 2, 2, 2, 2];
    expect(findCrossUp(a, b, 3)).toBe(2); // 第 2 根（index 2）穿越，距今 2 根
    expect(findCrossUp(a, b, 2)).toBe(-1); // 只看最近 2 根就找不到
  });
  it("剛好相等再往上也算穿越", () => {
    expect(findCrossUp([2, 3], [2, 2], 1)).toBe(0);
  });
  it("遇到 null 不會誤判", () => {
    expect(findCrossUp([null, 3], [2, 2], 1)).toBe(-1);
  });
  it("向下穿越", () => {
    expect(findCrossDown([3, 3, 1], [2, 2, 2], 1)).toBe(0);
    expect(findCrossDown([3, 3, 3], [2, 2, 2], 3)).toBe(-1);
  });
});

describe("RSI 條件", () => {
  const t = ticker(series({ close: [1, 1, 1, 1], rsi: [40, 25, 28, 35] }));
  it("高於／低於", () => {
    expect(evaluateCondition(t, cond("rsiAbove", { value: 30 })).matched).toBe(true);
    expect(evaluateCondition(t, cond("rsiBelow", { value: 30 })).matched).toBe(false);
  });
  it("從 30 以下回升：最近 1 根內符合", () => {
    expect(evaluateCondition(t, cond("rsiRebound", { value: 30, n: 1 })).matched).toBe(true);
  });
  it("回升後又跌回 30 以下就不算", () => {
    const t2 = ticker(series({ close: [1, 1, 1, 1], rsi: [25, 35, 32, 29] }));
    expect(evaluateCondition(t2, cond("rsiRebound", { value: 30, n: 5 })).matched).toBe(false);
  });
  it("RSI 是 null 時不符合，不會出錯", () => {
    const t3 = ticker(series({ close: [1, 1] }));
    expect(evaluateCondition(t3, cond("rsiAbove")).matched).toBe(false);
  });
});

describe("MACD 條件", () => {
  const t = ticker(series({
    close: [1, 1, 1, 1, 1],
    macd: [-1, -0.5, 0.2, 0.3, 0.1],
    signal: [0, 0, 0, 0, 0.2],
    hist: [-1, -0.5, 0.2, 0.3, -0.1],
  }));
  it("黃金交叉：最近 3 根內", () => {
    expect(evaluateCondition(t, cond("macdGolden", { n: 3 })).matched).toBe(true);
    expect(evaluateCondition(t, cond("macdGolden", { n: 2 })).matched).toBe(false);
  });
  it("死亡交叉：最新一根", () => {
    expect(evaluateCondition(t, cond("macdDeath", { n: 1 })).matched).toBe(true);
  });
  it("柱狀體連續縮短（同號、絕對值遞減）", () => {
    const t2 = ticker(series({ close: [1, 1, 1, 1, 1], hist: [5, 6, 4, 3, 1] }));
    expect(evaluateCondition(t2, cond("histShrink", { n: 3 })).matched).toBe(true);
    expect(evaluateCondition(t2, cond("histShrink", { n: 4 })).matched).toBe(false);
  });
  it("柱狀體翻到另一邊就中斷計數", () => {
    const t3 = ticker(series({ close: [1, 1, 1, 1], hist: [3, 2, -1.5, -1] }));
    expect(evaluateCondition(t3, cond("histShrink", { n: 2 })).matched).toBe(false);
    expect(evaluateCondition(t3, cond("histShrink", { n: 1 })).matched).toBe(true);
  });
});

describe("布林與均線條件", () => {
  const t = ticker(series({
    close: [100, 100, 106, 104],
    bbUpper: [105, 105, 105, 105],
    bbMiddle: [100, 100, 100, 100],
    bbLower: [95, 95, 95, 95],
    ma50: [101, 101, 101, 101],
  }));
  it("突破上軌：2 根前發生，最近 3 根內符合、最近 1 根不符合", () => {
    expect(evaluateCondition(t, cond("bbBreakUp", { band: "upper", n: 3 })).matched).toBe(true);
    expect(evaluateCondition(t, cond("bbBreakUp", { band: "upper", n: 1 })).matched).toBe(false);
  });
  it("突破中軌", () => {
    expect(evaluateCondition(t, cond("bbBreakUp", { band: "middle", n: 2 })).matched).toBe(true);
  });
  it("跌破上軌（最新一根從 106 回到 104）", () => {
    expect(evaluateCondition(t, cond("bbBreakDown", { band: "upper", n: 1 })).matched).toBe(true);
  });
  it("站上／跌破均線", () => {
    expect(evaluateCondition(t, cond("maAbove", { ma: 50 })).matched).toBe(true);
    expect(evaluateCondition(t, cond("maBelow", { ma: 50 })).matched).toBe(false);
    expect(evaluateCondition(t, cond("maAbove", { ma: 200 })).matched).toBe(false); // MA200 沒資料
  });
});

describe("runScreen 組合", () => {
  const t = ticker(series({ close: [1, 1], rsi: [50, 50], ma20: [2, 2] }));
  const a = cond("rsiAbove", { value: 40 }); // 符合
  const b = cond("maAbove", { ma: 20 }); // 不符合
  it("AND：全部符合才算", () => {
    expect(runScreen([t], [a, b], "and")[0].matched).toBe(false);
  });
  it("OR：任一符合就算", () => {
    const r = runScreen([t], [a, b], "or")[0];
    expect(r.matched).toBe(true);
    expect(r.hits).toBe(1);
  });
  it("沒有條件時不列出任何股票", () => {
    expect(runScreen([t], [], "and")[0].matched).toBe(false);
  });
});

describe("sanitizeConditions", () => {
  it("丟掉壞資料、修正超出範圍的值", () => {
    const out = sanitizeConditions([
      null,
      { kind: "notAKind" },
      { kind: "rsiAbove", tf: "weekly", value: 999 },
      { kind: "macdGolden", n: -5, tf: "yearly" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "rsiAbove", tf: "weekly", value: 100 });
    expect(out[1]).toMatchObject({ kind: "macdGolden", tf: "daily", n: 1 });
  });
  it("不是陣列時回傳空陣列", () => {
    expect(sanitizeConditions("oops")).toEqual([]);
  });
});
