// 讀取 public/data 底下的 JSON。
// 所有讀取都包在 try/catch 裡，失敗時回傳錯誤訊息，讓畫面顯示提示而不是整頁壞掉。

import type { IndexData, SeriesData, TickerData } from "./types";
import type { ScreenerData } from "./screener";
import { validMl, validMlVol, type MlData, type MlVolData } from "./ml";
import { getLang, t } from "./i18n";
import { validateReport, validIndex, type AiIndex } from "./aiReport";
import type { AiReport, AiWeekly } from "./types";
import { validateWeekly, validWeeklyIndex } from "./aiWeekly";
// 只 import 型別：signalStats.ts 會帶進整個篩選器程式，首頁不需要
import type { SignalStatsFile } from "./signalStats";

const DATA_BASE = `${import.meta.env.BASE_URL}data`;

// 簡單快取：同一檔股票切換來切換去時不用重新下載
const tickerCache = new Map<string, Promise<TickerData>>();

async function fetchJson<T>(url: string): Promise<T> {
  // cache: "no-cache" → 每次都向伺服器確認有沒有新版本（資料每天更新）
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(t("讀取失敗（HTTP {0}）：{1}", [res.status, url]));
  return (await res.json()) as T;
}

/**
 * 英文模式：有英文名稱（設定檔的 nameEn）就用英文名稱。
 * 在讀資料這一層統一換掉，畫面上所有顯示 name 的地方都不用改。
 * 快取裡保留原始資料，每次讀取時才換，所以切換語言後重新讀取就會正確。
 */
export function localizeName<T extends { name: string; nameEn?: string }>(x: T): T {
  return getLang() === "en" && x.nameEn ? { ...x, name: x.nameEn } : x;
}

export async function loadIndex(): Promise<IndexData> {
  const data = await fetchJson<IndexData>(`${DATA_BASE}/index.json`);
  if (!Array.isArray(data.tickers)) throw new Error(t("index.json 格式不正確"));
  return { ...data, tickers: data.tickers.map(localizeName) };
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
  return p.then(localizeName);
}

/** 基本檢查：確認必要欄位存在、長度一致，避免畫圖時才出錯 */
function validateTicker(d: TickerData): void {
  for (const tf of ["daily", "weekly", "monthly"] as const) {
    const s: SeriesData | undefined = d[tf];
    if (!s || !Array.isArray(s.time) || s.time.length === 0) {
      throw new Error(t("{0} 缺少 {1} 資料", [d.symbol ?? "?", tf]));
    }
    if (s.close.length !== s.time.length) {
      throw new Error(t("{0} 的 {1} 資料長度不一致", [d.symbol, tf]));
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

// ---- 第二階段：篩選器資料 ----

let screenerPromise: Promise<ScreenerData> | null = null;

/** 讀取 public/data/screener.json（每檔股票各週期最近 30 根的指標） */
export function loadScreener(): Promise<ScreenerData> {
  if (!screenerPromise) {
    screenerPromise = fetchJson<ScreenerData>(`${DATA_BASE}/screener.json`).then((d) => {
      if (!Array.isArray(d.tickers)) throw new Error(t("screener.json 格式不正確"));
      return d;
    });
    screenerPromise.catch(() => (screenerPromise = null)); // 失敗可重試
  }
  return screenerPromise.then((d) => ({ ...d, tickers: d.tickers.map(localizeName) }));
}

// ---- 第四階段：歷史匯率 ----

let fxPromise: Promise<Record<string, { time: string[]; close: number[] }> | null> | null = null;

/**
 * 讀取 public/data/fx.json（USD/TWD 歷史匯率）。
 * 這個檔案是第四階段才加的，舊的部署可能還沒有 → 回傳 null，分析頁改用最新匯率近似。
 */
export function loadFxHistory(): Promise<Record<string, { time: string[]; close: number[] }> | null> {
  if (!fxPromise) {
    fxPromise = fetchJson<Record<string, { time: string[]; close: number[] }>>(`${DATA_BASE}/fx.json`).catch(() => null);
  }
  return fxPromise;
}

// ---- ML 實驗室（scripts/ml_lab.py 產生）----
// 沒有檔案、格式不對都回傳 null：頁面顯示「還沒有 ML 結果」，不會壞
let mlPromise: Promise<MlData | null> | null = null;

export function loadMl(): Promise<MlData | null> {
  if (!mlPromise) {
    mlPromise = fetchJson<unknown>(`${DATA_BASE}/ml.json`)
      .then((d) => (validMl(d) ? d : null))
      .catch(() => null);
  }
  return mlPromise;
}

let mlVolPromise: Promise<MlVolData | null> | null = null;

/** 看盤頁的波動預測卡片用（小檔，只有每檔的預測） */
export function loadMlVol(): Promise<MlVolData | null> {
  if (!mlVolPromise) {
    mlVolPromise = fetchJson<unknown>(`${DATA_BASE}/ml-vol.json`)
      .then((d) => (validMlVol(d) ? d : null))
      .catch(() => null);
  }
  return mlVolPromise;
}

let signalStatsPromise: Promise<SignalStatsFile | null> | null = null;

/** 訊號回測結果（篩選器頁展開「這些訊號過去準不準」時才載入）；沒有檔案或格式不對 → null */
export function loadSignalStats(): Promise<SignalStatsFile | null> {
  if (!signalStatsPromise) {
    signalStatsPromise = fetchJson<unknown>(`${DATA_BASE}/signal-stats.json`)
      .then((d) => {
        const o = d as SignalStatsFile;
        return o && Array.isArray(o.rules) && o.baseline?.h20 && Array.isArray(o.skipped) ? o : null;
      })
      .catch(() => null);
  }
  return signalStatsPromise;
}

// ---- AI 投研辦公室（首頁）----
// public/ai/index.json 列出有哪些日期的報告（排程任務每天發布，新的在前）；
// 還沒有任何正式報告時顯示範例報告（sample-report.json，畫面會標「範例報告」）。
// 讀不到或格式不對都回傳 null：辦公室畫面照樣顯示（大家「休假中」），不會壞。
const AI_BASE = `${import.meta.env.BASE_URL}ai`;
let aiIndexPromise: Promise<AiIndex | null> | null = null;
const aiReportCache = new Map<string, Promise<AiReport | null>>();

export function loadAiIndex(): Promise<AiIndex | null> {
  if (!aiIndexPromise) {
    aiIndexPromise = fetchJson<unknown>(`${AI_BASE}/index.json`)
      .then((d) => (validIndex(d) ? d : null))
      .catch(() => null);
  }
  return aiIndexPromise;
}

function loadReportFile(path: string): Promise<AiReport | null> {
  let p = aiReportCache.get(path);
  if (!p) {
    p = fetchJson<unknown>(`${AI_BASE}/${path}`)
      .then((d) => validateReport(d).report)
      .catch(() => null);
    aiReportCache.set(path, p);
  }
  return p;
}

/** 指定日期的報告；不指定 = 最新一份（沒有正式報告時用範例） */
export async function loadAiReport(date?: string): Promise<AiReport | null> {
  if (date) return loadReportFile(`reports/${encodeURIComponent(date)}.json`);
  const index = await loadAiIndex();
  return index && index.dates.length > 0 ? loadReportFile("latest.json") : loadReportFile("sample-report.json");
}

// ---- AI 週報（每週一整理上週的每日報告；public/ai/weekly/）----
let aiWeeklyPromise: Promise<AiWeekly | null> | null = null;

/** 最新一份週報；還沒有正式週報時用範例（sample-weekly.json，畫面標「範例」）；讀不到或格式不對 → null */
export function loadAiWeekly(): Promise<AiWeekly | null> {
  if (!aiWeeklyPromise) {
    aiWeeklyPromise = (async () => {
      const idx = await fetchJson<unknown>(`${AI_BASE}/weekly/index.json`).catch(() => null);
      const path = validWeeklyIndex(idx) && idx.weeks.length > 0 ? `weekly/${encodeURIComponent(idx.weeks[0])}.json` : "sample-weekly.json";
      const d = await fetchJson<unknown>(`${AI_BASE}/${path}`).catch(() => null);
      return validateWeekly(d).weekly;
    })();
  }
  return aiWeeklyPromise;
}
