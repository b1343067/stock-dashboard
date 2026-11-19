import { describe, expect, it } from "vitest";
import { isDarkColor, NAV_SPOTS, project, ROOM, SCENE_H, SCENE_W, SEATS, shade, spans, spotPosition, tagPosition, WALL_H } from "./iso";
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

describe("isDarkColor", () => {
  it("深色牆面畫夜景", () => {
    expect(isDarkColor("#2b2f3d")).toBe(true);
    expect(isDarkColor("#dfe3ea")).toBe(false);
  });
});

describe("名牌與物件標籤位置", () => {
  it("手機寬度（約 360px）下角色名牌、物件標籤都不重疊，也不超出畫面", () => {
    const w = 360;
    const h = (w * SCENE_H) / SCENE_W;
    // 角色名牌約 64×14px（9px 字），底部對齊頭頂；物件標籤約 46×16px，置中
    const boxes = [
      ...(Object.keys(SEATS) as AiRoleKey[]).map((r) => {
        const p = tagPosition(r);
        const cx = (p.left / 100) * w;
        const bottom = (p.top / 100) * h;
        return { id: r, l: cx - 32, r: cx + 32, t: bottom - 14, b: bottom };
      }),
      ...NAV_SPOTS.map((s) => {
        const p = spotPosition(s.at);
        const cx = (p.left / 100) * w;
        const cy = (p.top / 100) * h;
        return { id: s.page, l: cx - 23, r: cx + 23, t: cy - 8, b: cy + 8 };
      }),
    ];
    for (const a of boxes) {
      expect(a.l, `${a.id} 超出左邊`).toBeGreaterThanOrEqual(0);
      expect(a.r, `${a.id} 超出右邊`).toBeLessThanOrEqual(w);
      expect(a.t, `${a.id} 超出上面`).toBeGreaterThanOrEqual(0);
      for (const b of boxes) {
        if (a.id >= b.id) continue;
        const overlap = a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
        expect(overlap, `${a.id} 和 ${b.id} 重疊`).toBe(false);
      }
    }
  });
  it("五個頁面都有入口", () => {
    expect(NAV_SPOTS.map((s) => s.page).sort()).toEqual(["chart", "market", "portfolio", "screener", "today"]);
  });
});
