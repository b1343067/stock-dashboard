// 價格提醒的共用狀態：頁首的鈴鐺、上方通知、提醒面板、看盤頁都讀同一份。
// 用 useSyncExternalStore：任何一個地方改了，其他地方會自動更新；另一個分頁改了也會同步。

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { needsRsi, sanitizeAlerts, type PriceAlert, type Quote } from "./alerts";
import { lastValid, loadScreener } from "./data";
import { readStorage, writeStorage } from "./storage";
import type { IndexData } from "./types";

const KEY = "alerts:list";
let cache: PriceAlert[] | null = null;
const listeners = new Set<() => void>();

function getAlerts(): PriceAlert[] {
  if (cache === null) cache = sanitizeAlerts(readStorage<unknown>(KEY, []));
  return cache;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  // 另一個分頁改了提醒 → 重新讀
  const onStorage = (e: StorageEvent) => {
    if (e.key === `stockdash:${KEY}`) {
      cache = null;
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function setAlerts(next: PriceAlert[]): void {
  cache = next;
  writeStorage(KEY, next);
  listeners.forEach((l) => l());
}

export function useAlerts(): PriceAlert[] {
  return useSyncExternalStore(subscribe, getAlerts, getAlerts);
}

/**
 * 每檔股票檢查提醒用的最新數值。
 * 價格、漲跌來自 index.json；只有在有 RSI 提醒時，才另外下載 screener.json 取得 RSI。
 */
export function useAlertQuotes(index: IndexData | null, alerts: PriceAlert[]): Record<string, Quote> {
  const wantRsi = needsRsi(alerts);
  const [rsi, setRsi] = useState<Record<string, number | null> | null>(null);

  useEffect(() => {
    if (!wantRsi || rsi) return;
    let cancelled = false;
    loadScreener()
      .then((d) => {
        if (cancelled) return;
        const m: Record<string, number | null> = {};
        for (const t of d.tickers) m[t.symbol] = lastValid(t.daily.rsi);
        setRsi(m);
      })
      .catch(() => {
        /* 讀不到 RSI 就只是 RSI 提醒顯示「沒有資料」，不影響其他功能 */
      });
    return () => {
      cancelled = true;
    };
  }, [wantRsi, rsi]);

  return useMemo(() => {
    const q: Record<string, Quote> = {};
    for (const t of index?.tickers ?? []) {
      q[t.symbol] = { close: t.lastClose, changePct: t.changePct, date: t.lastDate, rsi: rsi ? rsi[t.symbol] : undefined };
    }
    return q;
  }, [index, rsi]);
}
