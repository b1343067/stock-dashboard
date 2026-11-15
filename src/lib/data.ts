// 讀取 public/data 底下的 JSON。
// 所有讀取都包在 try/catch 裡，失敗時回傳錯誤訊息，讓畫面顯示提示而不是整頁壞掉。

import type { IndexData, SeriesData, TickerData } from "./types";

const DATA_BASE = `${import.meta.env.BASE_URL}data`;

// 簡單快取：同一檔股票切換來切換去時不用重新下載
const tickerCache = new Map<string, Promise<TickerData>>();

async function fetchJson<T>(url: string): Promise<T> {
  // cache: "no-cache" → 每次都向伺服器確認有沒有新版本（資料每天更新）
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`讀取失敗（HTTP ${res.status}）：${url}`);
  return (await res.json()) as T;
}

export async function loadIndex(): Promise<IndexData> {
  const data = await fetchJson<IndexData>(`${DATA_BASE}/index.json`);
  if (!Array.isArray(data.tickers)) throw new Error("index.json 格式不正確");
  return data;
}

export function loadTicker(symbol: string): Promise<TickerData> {
  let p = tickerCache.get(symbol);
  if (!p) {
    p = fetchJson<TickerData>(`${DATA_BASE}/${encodeURIComponent(symbol)}.json`).then((d) => {
      validateTicker(d);
      return d;
    });
    // 失敗的話從快取移除，下次可以重試
    p.catch(() => tickerCache.delete(symbol));
    tickerCache.set(symbol, p);
  }
  return p;
}

/** 基本檢查：確認必要欄位存在、長度一致，避免畫圖時才出錯 */
function validateTicker(d: TickerData): void {
  for (const tf of ["daily", "weekly", "monthly"] as const) {
    const s: SeriesData | undefined = d[tf];
    if (!s || !Array.isArray(s.time) || s.time.length === 0) {
      throw new Error(`${d.symbol ?? "?"} 缺少 ${tf} 資料`);
    }
    if (s.close.length !== s.time.length) {
      throw new Error(`${d.symbol} 的 ${tf} 資料長度不一致`);
    }
  }
}

/** 取得陣列最後一個「不是 null」的值 */
export function lastValid(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}
