// AI 辦公室的等角（isometric）像素場景：座標換算、多邊形點陣化、顏色深淺、角色位置
// 這裡只有純函式（測試在 iso.test.ts），畫圖在 components/office/OfficeScene.tsx。
//
// 為什麼自己點陣化多邊形：canvas 內建的 fill() 會做反鋸齒，邊緣變模糊；
// 像素畫要「一格一格」的硬邊，所以逐列算出要填的範圍，用 fillRect 填整數像素，
// 再用 CSS image-rendering: pixelated 放大，看起來才像像素畫。

import type { AiRoleKey } from "./types";

/** 畫布原始大小（像素）；畫面上會等比例放大 */
export const SCENE_W = 292;
export const SCENE_H = 214;
/** 房間大小（格）與牆高（像素） */
export const ROOM = 10;
export const WALL_H = 64;
/** 房間最後面的角落在畫布上的位置；一格 = 往右下 13px、往下 6.5px（2:1 等角）
 *  格子刻意小一點：角色是固定像素大小，格子小 → 畫布小 → 放大倍數大，角色看起來比較大 */
const OX = 146;
const OY = 72;
const TX = 13;
const TY = 6.5;

export type Pt = [number, number];

/** 房間座標（x 往右下、y 往左下、z 往上，x/y 單位是格、z 是像素）→ 畫布座標 */
export function project(x: number, y: number, z = 0): Pt {
  return [OX + (x - y) * TX, OY + (x + y) * TY - z];
}

/**
 * 凸多邊形點陣化：回傳每一列要填的 [y, x, 寬度]。
 * 用像素中心（+0.5）判斷，四捨五入到整數，邊緣才不會有半透明像素。
 */
export function spans(pts: Pt[]): [number, number, number][] {
  const ys = pts.map((p) => p[1]);
  const out: [number, number, number][] = [];
  for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
    const yc = y + 0.5;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= yc && yc < y2) || (y2 <= yc && yc < y1)) {
        const x = x1 + ((yc - y1) * (x2 - x1)) / (y2 - y1);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
    const x0 = Math.round(lo);
    const x1 = Math.round(hi);
    if (x1 > x0) out.push([y, x0, x1 - x0]);
  }
  return out;
}

/** 顏色變深（amt < 0，混黑色）或變淺（amt > 0，混白色）；只接受 #rrggbb */
export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const target = amt < 0 ? 0 : 255;
  const k = Math.min(1, Math.abs(amt));
  const ch = (v: number) => Math.round(v + (target - v) * k);
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export type Facing = "front" | "back";
export type Action = "typing" | "coffee" | "idle";

/**
 * 每個角色坐哪裡、面向哪邊、在做什麼、衣服與髮色（CSS 變數）。
 * 四位分析師共用一張長桌、面對面坐；主管在右前方自己的桌子，面向畫面。
 * 位置有刻意拉開，手機畫面上名牌才不會互相重疊（iso.test.ts 會檢查）。
 */
export const SEATS: Record<AiRoleKey, { x: number; y: number; facing: Facing; action: Action; shirt: string; hair: string }> = {
  tech: { x: 3.0, y: 3.4, facing: "front", action: "typing", shirt: "--s1", hair: "--office-hair-1" },
  news: { x: 6.4, y: 3.4, facing: "front", action: "typing", shirt: "--s2", hair: "--office-hair-2" },
  fundamental: { x: 3.0, y: 5.8, facing: "back", action: "coffee", shirt: "--s3", hair: "--office-hair-3" },
  debate: { x: 6.4, y: 5.8, facing: "back", action: "idle", shirt: "--s4", hair: "--office-hair-1" },
  lead: { x: 9.0, y: 6.4, facing: "front", action: "coffee", shirt: "--accent-strong", hair: "--office-hair-2" },
};

/** 坐著的角色：屁股離地 10px、頭頂再往上 19px（身體 10、頭 8、頭髮 1） */
export const SIT_Z = 10;
export const HEAD_TOP = 29;

/** 名牌位置（畫布寬高的百分比）：頭頂上方 */
export function tagPosition(role: AiRoleKey): { left: number; top: number } {
  const s = SEATS[role];
  const [sx, sy] = project(s.x, s.y);
  return { left: (sx / SCENE_W) * 100, top: ((sy - HEAD_TOP - 3) / SCENE_H) * 100 };
}
