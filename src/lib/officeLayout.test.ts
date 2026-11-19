import { describe, expect, it } from "vitest";
import { hash01, isDarkColor, NAV_SPOTS, SCENE_H, SCENE_W, SEATS, shade, spans, spotPosition, tagPosition } from "./officeLayout";
import type { AiRoleKey } from "./types";

describe("spans", () => {
  it("正方形：每列寬度相同、整數像素", () => {
    expect(spans([[0, 0], [4, 0], [4, 3], [0, 3]])).toEqual([[0, 0, 4], [1, 0, 4], [2, 0, 4]]);
  });
  it("梯形：上窄下寬", () => {
    const s = spans([[4, 0], [12, 0], [16, 8], [0, 8]]);
    expect(s[0][2]).toBeLessThan(s.at(-1)![2]);
    expect(s.every((r) => Number.isInteger(r[1]) && Number.isInteger(r[2]))).toBe(true);
  });
  it("面積為 0 時沒有像素", () => {
    expect(spans([[0, 0], [5, 0], [5, 0]])).toEqual([]);
  });
});

describe("顏色工具", () => {
  it("shade 變深變淺、格式不對原樣回傳", () => {
    expect(shade("#808080", -1)).toBe("#000000");
    expect(shade("#808080", 1)).toBe("#ffffff");
    expect(shade("#ff0000", -0.5)).toBe("#800000");
    expect(shade("rgb(1,2,3)", -0.5)).toBe("rgb(1,2,3)");
  });
  it("深色牆面畫夜景", () => {
    expect(isDarkColor("#2b2f3d")).toBe(true);
    expect(isDarkColor("#dfe3ea")).toBe(false);
  });
  it("hash01 固定、在 0～1 之間", () => {
    expect(hash01(3, 4)).toBe(hash01(3, 4));
    for (let i = 0; i < 50; i++) {
      const v = hash01(i, i * 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("版面", () => {
  it("座位、桌子都在畫布裡", () => {
    for (const s of Object.values(SEATS)) {
      expect(s.x - s.deskW / 2).toBeGreaterThanOrEqual(0);
      expect(s.x + s.deskW / 2).toBeLessThanOrEqual(SCENE_W);
      expect(s.desk + 24).toBeLessThanOrEqual(SCENE_H);
    }
  });
  it("手機寬度（約 360px）下角色名牌、物件標籤都不重疊，也不超出畫面", () => {
    const w = 360;
    const h = (w * SCENE_H) / SCENE_W;
    // 角色名牌約 72×15px（9px 字），底部對齊頭頂；物件標籤約 46×16px，置中
    const boxes = [
      ...(Object.keys(SEATS) as AiRoleKey[]).map((r) => {
        const p = tagPosition(r);
        const cx = (p.left / 100) * w;
        const bottom = (p.top / 100) * h;
        return { id: r, l: cx - 36, r: cx + 36, t: bottom - 15, b: bottom };
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
