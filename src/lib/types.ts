// 資料格式定義：對應 Python 腳本（scripts/indicators.py）輸出的 JSON。
// 如果改了 Python 的輸出欄位，這裡也要一起改。

/** K 線週期：日線、週線、月線 */
export type Timeframe = "daily" | "weekly" | "monthly";

/** 某個週期的所有資料。每個欄位都是「同樣長度的陣列」，第 i 筆對應 time[i]。 */
export interface SeriesData {
  time: string[]; // "YYYY-MM-DD"
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  ma10: (number | null)[];
  ma20: (number | null)[];
  ma50: (number | null)[];
  ma200: (number | null)[];
  rsi: (number | null)[];
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
  bbUpper: (number | null)[];
  bbMiddle: (number | null)[];
  bbLower: (number | null)[];
}

/** public/data/<代號>.json */
export interface TickerData {
  symbol: string;
  name: string;
  currency: "USD" | "TWD" | string;
  sample: boolean;
  lastDate: string;
  lastClose: number;
  changePct: number;
  daily: SeriesData;
  weekly: SeriesData;
  monthly: SeriesData;
}

/** index.json 裡每檔股票的摘要 */
export interface TickerSummary {
  symbol: string;
  name: string;
  currency: string;
  lastDate: string;
  lastClose: number;
  changePct: number;
  sample: boolean;
}

/** public/data/index.json */
export interface IndexData {
  generatedAt: string;
  sample: boolean;
  fx: Record<string, number>; // 例如 { USDTWD: 32.1 }
  /** 無風險利率（年化小數，例如 0.0425）；舊資料可能沒有 */
  riskFree?: number | null;
  tickers: TickerSummary[];
}

/** 可以疊加在 K 線上的指標 */
export type OverlayKey = "ma10" | "ma20" | "ma50" | "ma200" | "bb";
