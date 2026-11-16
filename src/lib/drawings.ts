// K 線畫圖工具的資料（純函式，測試在 drawings.test.ts）
// 畫的線存在瀏覽器（localStorage），每檔股票、每個週期各自一份：
// 日線畫的趨勢線放到週線上，日期對不上，所以只在畫的那個週期顯示。

import type { Timeframe } from "./types";

export interface Point {
  time: string; // YYYY-MM-DD（K 棒的日期）
  price: number;
}

export type Drawing =
  | { id: string; type: "hline"; price: number }
  | { id: string; type: "trend"; p1: Point; p2: Point };

export type DrawMode = "none" | "trend" | "hline";

/** localStorage 的 key：每檔股票、每個週期一份 */
export function drawingKey(symbol: string, tf: Timeframe): string {
  return `drawings:${symbol}:${tf}`;
}

let counter = 0;
export function newId(): string {
  counter += 1;
  return `d${Date.now().toString(36)}${counter}`;
}

/**
 * 處理一次「在圖上點擊」：
 *   水平線模式：直接新增一條水平線
 *   趨勢線模式：第一下記住起點（pending），第二下完成一條線
 * 回傳新的線清單與新的起點狀態。
 */
export function handleClick(
  drawings: Drawing[],
  mode: DrawMode,
  pending: Point | null,
  p: Point,
): { drawings: Drawing[]; pending: Point | null; done: boolean } {
  if (mode === "hline") return { drawings: [...drawings, { id: newId(), type: "hline", price: p.price }], pending: null, done: true };
  if (mode === "trend") {
    if (!pending) return { drawings, pending: p, done: false };
    if (pending.time === p.time) return { drawings, pending, done: false }; // 同一根 K 棒畫不出斜線，等下一下
    // 起點放在比較早的那一邊（圖表要求時間由小到大）
    const [a, b] = pending.time < p.time ? [pending, p] : [p, pending];
    return { drawings: [...drawings, { id: newId(), type: "trend", p1: a, p2: b }], pending: null, done: true };
  }
  return { drawings, pending, done: false };
}

/** 從 localStorage 讀回來時檢查格式 */
export function sanitizeDrawings(raw: unknown): Drawing[] {
  if (!Array.isArray(raw)) return [];
  const isPoint = (x: unknown): x is Point =>
    !!x && typeof (x as Point).time === "string" && /^\d{4}-\d{2}-\d{2}$/.test((x as Point).time) && Number.isFinite((x as Point).price);
  const out: Drawing[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id ? o.id : newId();
    if (o.type === "hline" && Number.isFinite(o.price)) out.push({ id, type: "hline", price: o.price as number });
    else if (o.type === "trend" && isPoint(o.p1) && isPoint(o.p2) && o.p1.time !== o.p2.time) {
      const [a, b] = o.p1.time < o.p2.time ? [o.p1, o.p2] : [o.p2, o.p1];
      out.push({ id, type: "trend", p1: a, p2: b });
    }
  }
  return out.slice(0, 50); // 最多 50 條，避免畫太多拖慢圖表
}
