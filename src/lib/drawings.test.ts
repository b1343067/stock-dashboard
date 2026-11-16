// 畫圖工具的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import { drawingKey, handleClick, sanitizeDrawings } from "./drawings";

const p = (time: string, price: number) => ({ time, price });

describe("handleClick", () => {
  it("水平線：點一下就完成", () => {
    const r = handleClick([], "hline", null, p("2026-11-13", 150));
    expect(r.done).toBe(true);
    expect(r.drawings[0]).toMatchObject({ type: "hline", price: 150 });
  });
  it("趨勢線：第一下記起點、第二下完成，時間自動由小到大", () => {
    const r1 = handleClick([], "trend", null, p("2026-11-13", 160));
    expect(r1).toMatchObject({ done: false, pending: { time: "2026-11-13" } });
    const r2 = handleClick(r1.drawings, "trend", r1.pending, p("2026-10-01", 200));
    expect(r2.done).toBe(true);
    expect(r2.pending).toBeNull();
    expect(r2.drawings[0]).toMatchObject({ type: "trend", p1: { time: "2026-10-01", price: 200 }, p2: { time: "2026-11-13", price: 160 } });
  });
  it("同一根 K 棒點兩下不會產生線", () => {
    const r = handleClick([], "trend", p("2026-11-13", 1), p("2026-11-13", 2));
    expect(r.drawings).toHaveLength(0);
    expect(r.done).toBe(false);
  });
  it("沒有選工具時點擊不做事", () => expect(handleClick([], "none", null, p("2026-11-13", 1)).drawings).toEqual([]));
});

describe("sanitizeDrawings", () => {
  it("丟掉壞資料、修正順序", () => {
    const out = sanitizeDrawings([
      { type: "hline", price: 100 },
      { type: "hline", price: "x" },
      { type: "trend", p1: p("2026-02-01", 1), p2: p("2026-01-01", 2) },
      { type: "trend", p1: p("bad", 1), p2: p("2026-01-01", 2) },
      null,
    ]);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ p1: { time: "2026-01-01" }, p2: { time: "2026-02-01" } });
  });
  it("key 依股票與週期分開", () => expect(drawingKey("NVDA", "weekly")).toBe("drawings:NVDA:weekly"));
});
