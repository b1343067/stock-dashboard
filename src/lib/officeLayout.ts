// AI 辦公室（首頁）的像素場景：版面資料與純函式（測試在 officeLayout.test.ts），畫圖在 components/office/OfficeScene.tsx。
//
// 視角是「3/4 俯視」（像 RPG 遊戲）：後牆正對畫面、地板從斜上方往下看、人物面向畫面。
// 這種視角的東西都是長方形，比等角容易畫出細節，人物也能畫得比較大（使用者給的參考圖風格，原創繪製）。
//
// 為什麼自己點陣化多邊形：canvas 內建的 fill() 會做反鋸齒，邊緣變模糊；
// 像素畫要「一格一格」的硬邊，所以逐列算出要填的範圍，用 fillRect 填整數像素。
// ⚠️ spans() 只處理凸多邊形；凹的形狀要拆成幾個凸的分別畫。

import type { AiRoleKey } from "./types";
import type { Page } from "./route";

/** 畫布原始大小（像素）；程式會整數倍放大，再由瀏覽器縮到畫面大小 */
export const SCENE_W = 320;
export const SCENE_H = 224;
/** 後牆的範圍：牆面 y 0～WALL_BOTTOM；左右兩側是斜的側牆 */
export const WALL_LEFT = 18;
export const WALL_RIGHT = 302;
export const WALL_TOP = 8;
export const WALL_BOTTOM = 66;

export type Pt = [number, number];

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

/** 固定的「亂數」：同一個輸入永遠得到同一個 0～1 的值（磚塊深淺、木紋位置用，畫面才不會每次不同） */
export function hash01(a: number, b = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export type Action = "typing" | "coffee" | "idle";
export type Hair = "short" | "long" | "bun" | "curly" | "neat";

/**
 * 每個角色的位置與外型。所有人都坐在桌子後面、面向畫面。
 * x：人的中心；desk：桌面上緣的 y（人的上半身露在桌面上）；deskW：桌子寬度。
 * 主管在後牆霓虹招牌下方的大桌子；四位分析師分兩排。
 */
export const SEATS: Record<AiRoleKey, { x: number; desk: number; deskW: number; action: Action; shirt: string; hair: string; style: Hair; glasses?: boolean; monitor: "left" | "right" }> = {
  lead: { x: 160, desk: 90, deskW: 72, action: "coffee", shirt: "--accent-strong", hair: "--office-hair-2", style: "neat", glasses: true, monitor: "right" },
  tech: { x: 70, desk: 132, deskW: 64, action: "typing", shirt: "--s1", hair: "--office-hair-1", style: "short", glasses: true, monitor: "right" },
  news: { x: 250, desk: 132, deskW: 64, action: "typing", shirt: "--s2", hair: "--office-hair-2", style: "long", monitor: "left" },
  fundamental: { x: 104, desk: 182, deskW: 64, action: "coffee", shirt: "--s3", hair: "--office-hair-3", style: "bun", monitor: "left" },
  debate: { x: 216, desk: 182, deskW: 64, action: "idle", shirt: "--s4", hair: "--office-hair-1", style: "curly", monitor: "right" },
};

/** 人的頭頂在桌面上方幾個像素（身體露出 9 + 頭 11 + 頭髮 3） */
export const HEAD_TOP = 24;

/** 名牌位置（畫布寬高的百分比）：頭頂上方 */
export function tagPosition(role: AiRoleKey): { left: number; top: number } {
  const s = SEATS[role];
  return { left: (s.x / SCENE_W) * 100, top: ((s.desk - HEAD_TOP - 3) / SCENE_H) * 100 };
}

/**
 * 辦公室裡可以點的物件 → 網站的各個頁面（取代手機底部導覽列）。
 * at：標籤中心（畫布像素）；hit：點擊範圍 [左, 上, 寬, 高]。
 */
export const NAV_SPOTS: { page: Page; label: string; at: Pt; hit: [number, number, number, number] }[] = [
  { page: "portfolio", label: "組合", at: [40, 15], hit: [24, 16, 34, 66] },
  { page: "chart", label: "看盤", at: [86, 15], hit: [64, 16, 46, 32] },
  { page: "screener", label: "篩選", at: [232, 13], hit: [210, 14, 46, 36] },
  { page: "today", label: "今日", at: [278, 21], hit: [264, 22, 30, 46] },
  { page: "market", label: "市場", at: [24, 52], hit: [0, 20, 18, 66] },
];

/** 物件標籤的位置（百分比，標籤中心） */
export function spotPosition(at: Pt): { left: number; top: number } {
  return { left: (at[0] / SCENE_W) * 100, top: (at[1] / SCENE_H) * 100 };
}
