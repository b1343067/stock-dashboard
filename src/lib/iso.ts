// AI 辦公室的等角（isometric）像素場景：座標換算、多邊形點陣化、顏色深淺、角色與物件位置
// 這裡只有純函式與版面資料（測試在 iso.test.ts），畫圖在 components/office/OfficeScene.tsx。
//
// 為什麼自己點陣化多邊形：canvas 內建的 fill() 會做反鋸齒，邊緣變模糊；
// 像素畫要「一格一格」的硬邊，所以逐列算出要填的範圍，用 fillRect 填整數像素，
// 再用 CSS image-rendering: pixelated 放大，看起來才像像素畫。
// ⚠️ spans() 只處理凸多邊形；凹的形狀要拆成幾個凸的分別畫。

import type { AiRoleKey } from "./types";
import type { Page } from "./route";

/** 畫布原始大小（像素）；畫面上會等比例放大 */
export const SCENE_W = 400;
export const SCENE_H = 316;
/** 房間大小（格）與牆高（像素） */
export const ROOM = 8;
export const WALL_H = 108;
/** 房間最後面的角落在畫布上的位置；一格 = 往右下 24px、往下 12px（2:1 等角） */
const OX = 200;
const OY = 114;
const TX = 24;
const TY = 12;

export type Pt = [number, number];

/** 房間座標（x 往右下、y 往左下、z 往上；x/y 單位是格、z 是像素）→ 畫布座標 */
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

/** 顏色是不是深色（判斷要畫白天還是夜景） */
export function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.4;
}

export type Facing = "front" | "back";
export type Action = "typing" | "coffee" | "idle";
export type Hair = "short" | "long" | "bun" | "curly" | "neat";

/**
 * 每個角色坐哪裡、面向哪邊、在做什麼、外型。
 * 四位分析師共用一張長桌、面對面坐；主管在右前方自己的桌子，面向畫面。
 * 位置有刻意拉開，手機畫面上名牌才不會互相重疊（iso.test.ts 會檢查）。
 */
export const SEATS: Record<AiRoleKey, { x: number; y: number; facing: Facing; action: Action; shirt: string; hair: string; style: Hair; glasses?: boolean }> = {
  tech: { x: 2.4, y: 2.1, facing: "front", action: "typing", shirt: "--s1", hair: "--office-hair-1", style: "short", glasses: true },
  news: { x: 5.2, y: 2.1, facing: "front", action: "typing", shirt: "--s2", hair: "--office-hair-2", style: "long" },
  fundamental: { x: 2.4, y: 4.5, facing: "back", action: "coffee", shirt: "--s3", hair: "--office-hair-3", style: "bun" },
  debate: { x: 5.2, y: 4.5, facing: "back", action: "idle", shirt: "--s4", hair: "--office-hair-1", style: "curly" },
  lead: { x: 6.9, y: 5.0, facing: "front", action: "coffee", shirt: "--accent-strong", hair: "--office-hair-2", style: "neat", glasses: true },
};

/** 坐著的角色：屁股離地 13px；頭頂離地 = 13 + 身體 12 + 頭 10 + 頭髮 1 */
export const SIT_Z = 13;
export const HEAD_TOP = 36;

/** 名牌位置（畫布寬高的百分比）：頭頂上方 */
export function tagPosition(role: AiRoleKey): { left: number; top: number } {
  const s = SEATS[role];
  const [sx, sy] = project(s.x, s.y);
  return { left: (sx / SCENE_W) * 100, top: ((sy - HEAD_TOP - 3) / SCENE_H) * 100 };
}

/**
 * 辦公室裡可以點的物件 → 網站的各個頁面（取代手機底部導覽列）。
 * at：標籤的位置（房間座標）；hit：點擊範圍（畫布像素 [左, 上, 寬, 高]）。
 */
export const NAV_SPOTS: { page: Page; label: string; icon: string; at: [number, number, number]; hit: [number, number, number, number] }[] = [
  { page: "today", label: "今日", icon: "🚪", at: [6.4, 0, 84], hit: [336, 82, 34, 92] },
  { page: "market", label: "市場", icon: "🏙️", at: [0, 2.9, 104], hit: [74, 22, 116, 120] },
  { page: "chart", label: "看盤", icon: "📈", at: [3.75, 0, 88], hit: [266, 76, 46, 50] },
  { page: "screener", label: "篩選", icon: "📋", at: [1.5, 0, 94], hit: [214, 40, 50, 66] },
  { page: "portfolio", label: "組合", icon: "📚", at: [0.25, 6.8, 70], hit: [16, 128, 54, 84] },
];

/** 物件標籤的位置（百分比，標籤中心） */
export function spotPosition(at: [number, number, number]): { left: number; top: number } {
  const [sx, sy] = project(at[0], at[1], at[2]);
  return { left: (sx / SCENE_W) * 100, top: (sy / SCENE_H) * 100 };
}
