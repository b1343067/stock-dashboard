// 多檔走勢比較的計算（純函式，測試在 compare.test.ts）
// 每檔都從「起始日」那天（或之後第一個交易日）算起，換成累積報酬 %，才能放在同一張圖上比較。
// 注意：用各自的原幣計算（台股是台幣報酬），不換匯；網頁上會說明。

import { maxDrawdown, stdev, dailyReturns, TRADING_DAYS } from "./analytics";

export const MAX_COMPARE = 4;

export type Range = "1m" | "3m" | "6m" | "1y" | "3y" | "5y";
export const RANGE_LABEL: Record<Range, string> = { "1m": "1 個月", "3m": "3 個月", "6m": "6 個月", "1y": "1 年", "3y": "3 年", "5y": "5 年" };
const RANGE_MONTHS: Record<Range, number> = { "1m": 1, "3m": 3, "6m": 6, "1y": 12, "3y": 36, "5y": 60 };

/** 從最後一天往回推 N 個月的日期 */
export function rangeStart(lastDate: string, range: Range): string {
  const d = new Date(`${lastDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - RANGE_MONTHS[range]);
  return d.toISOString().slice(0, 10);
}

export interface Normalized {
  time: string[];
  /** 累積報酬 %（第一天 = 0） */
  pct: number[];
}

/** 從 startDate（含）之後的第一個交易日起算累積報酬 % */
export function normalize(time: string[], close: number[], startDate: string): Normalized {
  const i = time.findIndex((t) => t >= startDate);
  if (i < 0) return { time: [], pct: [] };
  const base = close[i];
  return { time: time.slice(i), pct: close.slice(i).map((c) => (c / base - 1) * 100) };
}

export interface CompareStats {
  totalReturn: number; // %
  annVol: number; // %
  maxDrawdown: number; // %（負數）
  start: string;
  end: string;
}

export function compareStats(n: Normalized): CompareStats | null {
  if (n.pct.length < 2) return null;
  const values = n.pct.map((p) => 100 + p); // 換回「淨值」才能算報酬與回撤
  const r = dailyReturns(values);
  return {
    totalReturn: n.pct[n.pct.length - 1],
    annVol: stdev(r) * Math.sqrt(TRADING_DAYS) * 100,
    maxDrawdown: maxDrawdown(values).mdd * 100,
    start: n.time[0],
    end: n.time[n.time.length - 1],
  };
}

/** 網址 #/compare/NVDA,AMD → ["NVDA","AMD"]；去重、轉大寫、最多 4 檔 */
export function parseSymbols(s: string | undefined | null): string[] {
  if (!s) return [];
  const out: string[] = [];
  for (const raw of decodeURIComponent(s).split(",")) {
    const sym = raw.trim().toUpperCase();
    if (sym && !out.includes(sym)) out.push(sym);
  }
  return out.slice(0, MAX_COMPARE);
}
