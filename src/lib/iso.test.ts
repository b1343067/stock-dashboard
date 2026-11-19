import { describe, expect, it } from "vitest";
import { project, ROOM, SCENE_H, SCENE_W, SEATS, shade, spans, tagPosition, WALL_H } from "./iso";
import type { AiRoleKey } from "./types";

describe("project", () => {
  it("2:1 等角：x 加 1 格往右下、y 加 1 格往左下、z 往上", () => {
    const [x0, y0] = project(0, 0);
    const [x1, y1] = project(1, 0);
    expect(x1 - x0).toBe(2 * (y1 - y0)); // 2:1
    expect(project(0, 1)).toEqual([x0 - (x1 - x0), y1]);
    expect(project(0, 0, 5)).toEqual([x0, y0 - 5]);
  });
  it("整個房間（含牆）都在畫布裡", () => {
    for (const [x, y, z] of [[0, 0, WALL_H], [ROOM, 0, WALL_H], [0, ROOM, WALL_H], [ROOM, ROOM, 0]] as const) {
      const [sx, sy] = project(x, y, z);
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(SCENE_W);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThanOrEqual(SCENE_H);
    }
  });
});

describe("spans", () => {
  it("正方形：每列寬度相同、整數像素", () => {
    const s = spans([[0, 0], [4, 0], [4, 3], [0, 3]]);
    expect(s).toEqual([[0, 0, 4], [1, 0, 4], [2, 0, 4]]);
  });
  it("菱形：中間最寬、上下變窄", () => {
    const s = spans([[8, 0], [16, 4], [8, 8], [0, 4]]);
    const widths = s.map((r) => r[2]);
    expect(Math.max(...widths)).toBe(widths[3]);
    expect(widths[0]).toBeLessThan(widths[3]);
    expect(s.every((r) => Number.isInteger(r[1]) && Number.isInteger(r[2]))).toBe(true);
  });
  it("面積為 0 時沒有像素", () => {
    expect(spans([[0, 0], [5, 0], [5, 0]])).toEqual([]);
  });
});

describe("shade", () => {
  it("變深、變淺、格式不對原樣回傳", () => {
    expect(shade("#808080", -1)).toBe("#000000");
    expect(shade("#808080", 1)).toBe("#ffffff");
    expect(shade("#ff0000", -0.5)).toBe("#800000");
    expect(shade("rgb(1,2,3)", -0.5)).toBe("rgb(1,2,3)");
  });
});

describe("名牌位置", () => {
  it("手機寬度（約 340px）下五個名牌不會重疊", () => {
    // 名牌約 80×16px（中文 6 字＋狀態點），換算成百分比後兩兩檢查
    const w = 340;
    const h = (w * SCENE_H) / SCENE_W;
    const boxes = (Object.keys(SEATS) as AiRoleKey[]).map((r) => {
      const p = tagPosition(r);
      const cx = (p.left / 100) * w;
      const bottom = (p.top / 100) * h;
      return { r, l: cx - 40, rt: cx + 40, t: bottom - 16, b: bottom };
    });
    for (const a of boxes)
      for (const b of boxes) {
        if (a.r >= b.r) continue;
        const overlap = a.l < b.rt && b.l < a.rt && a.t < b.b && b.t < a.b;
        expect(overlap, `${a.r} 和 ${b.r} 的名牌重疊`).toBe(false);
      }
  });
});
