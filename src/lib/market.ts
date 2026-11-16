// 市場總覽的計算（純函式，測試在 market.test.ts）
// 全部只用 index.json 已經有的資料（最新漲跌、最近 30 天收盤），不用另外下載各股檔案。

import type { TickerSummary } from "./types";

/** 「今日」用最新一天漲跌；「近 30 天」用 30 天前到現在的漲跌 */
export type Period = "day" | "month";

/** 某一檔在指定期間的漲跌幅（%）；資料不足回傳 null */
export function periodChange(t: TickerSummary, period: Period): number | null {
  if (period === "day") return Number.isFinite(t.changePct) ? t.changePct : null;
  const s = t.spark;
  if (!s || s.length < 2 || !(s[0] > 0)) return null;
  return (s[s.length - 1] / s[0] - 1) * 100;
}

export interface Breadth {
  up: number;
  down: number;
  flat: number;
  /** 上漲家數佔比（%），沒有資料時為 null */
  upPct: number | null;
}

/** 市場寬度：上漲、下跌、平盤各幾檔（|漲跌| < 0.005% 視為平盤） */
export function breadth(tickers: TickerSummary[], period: Period): Breadth {
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const t of tickers) {
    const c = periodChange(t, period);
    if (c === null) continue;
    if (c > 0.005) up++;
    else if (c < -0.005) down++;
    else flat++;
  }
  const n = up + down + flat;
  return { up, down, flat, upPct: n ? (up / n) * 100 : null };
}

export interface Mover {
  ticker: TickerSummary;
  change: number;
}

/** 漲幅（或跌幅）前 n 名 */
export function topMovers(tickers: TickerSummary[], period: Period, n: number, direction: "up" | "down"): Mover[] {
  const list = tickers
    .map((ticker) => ({ ticker, change: periodChange(ticker, period) }))
    .filter((m): m is Mover => m.change !== null);
  list.sort((a, b) => (direction === "up" ? b.change - a.change : a.change - b.change));
  // 「漲幅前幾名」只列真的有漲的；跌幅同理
  return list.filter((m) => (direction === "up" ? m.change > 0 : m.change < 0)).slice(0, n);
}

export interface CategoryStat {
  name: string;
  /** 平均漲跌幅（%，等權重平均） */
  avg: number;
  count: number;
  up: number;
  members: Mover[];
}

/** 各分類的平均漲跌（等權重），依設定檔的分類順序；沒有分類的歸到「其他」 */
export function categoryStats(tickers: TickerSummary[], categories: string[], period: Period): CategoryStat[] {
  const map = new Map<string, Mover[]>();
  for (const ticker of tickers) {
    const change = periodChange(ticker, period);
    if (change === null) continue;
    const c = ticker.category || "其他";
    if (!map.has(c)) map.set(c, []);
    map.get(c)!.push({ ticker, change });
  }
  const order = [...categories, ...[...map.keys()].filter((c) => !categories.includes(c))];
  return order
    .filter((c) => map.has(c))
    .map((name) => {
      const members = map.get(name)!;
      const avg = members.reduce((a, m) => a + m.change, 0) / members.length;
      return { name, avg, count: members.length, up: members.filter((m) => m.change > 0).length, members };
    });
}

/**
 * 熱力圖格子的顏色深淺（0～1）：漲跌幅越大越深。
 * 用 cap（今日 3%、近 30 天 15%）當作「最深」，超過的也算最深，避免一檔暴漲讓其他格子都變淡。
 */
export function heatIntensity(change: number, period: Period): number {
  const cap = period === "day" ? 3 : 15;
  return Math.min(1, Math.abs(change) / cap);
}
