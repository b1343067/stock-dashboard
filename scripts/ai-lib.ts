// AI 報告腳本共用的小工具（讀檔、觀察清單代號、台灣日期）

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(__dirname, "..");
export const DATA = join(ROOT, "public", "data");
export const AI = join(ROOT, "public", "ai");

export function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** 先寫暫存檔再改名，避免寫到一半的壞檔案 */
export function writeJsonAtomic(path: string, data: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, path);
}

/** 觀察清單的所有代號（報告只能提到這些股票） */
export function watchlistSymbols(): Set<string> {
  const w = readJson<{ groups?: { tickers: { symbol: string }[] }[]; tickers?: { symbol: string }[] }>(join(ROOT, "config", "watchlist.json"));
  const list = w?.groups ? w.groups.flatMap((g) => g.tickers) : (w?.tickers ?? []);
  return new Set(list.map((t) => t.symbol));
}

/** 台灣時間的今天（YYYY-MM-DD） */
export function taipeiToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}
