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
/**
 * 基本面（加碼 B，scripts/fundamentals.py 產生）。舊的資料檔沒有這個欄位。
 * 52 週高低、殖利率每天從日線算；本益比等來自 Yahoo，抓不到時沿用上次（infoDate 是那次的日期）。
 * ETF 沒有本益比、產業等欄位 → null。
 */
export interface Fundamentals {
  high52w: number | null;
  low52w: number | null;
  /** 近 12 個月殖利率（%），例如 1.35 = 1.35% */
  dividendYield: number | null;
  /** 近 12 個月每股配息合計（原幣） */
  dividendTtm: number | null;
  pe: number | null;
  forwardPe: number | null;
  pb: number | null;
  /** 市值（原幣） */
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  /** "EQUITY"、"ETF" 等 */
  quoteType: string | null;
  infoDate: string | null;
}

export interface TickerData {
  /** 基本面；舊資料可能沒有 */
  fundamentals?: Fundamentals;
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
  /** 分類（來自 config/watchlist.json 的 groups）；舊資料可能沒有 */
  category?: string;
  lastDate: string;
  lastClose: number;
  changePct: number;
  sample: boolean;
  /** 最近 30 天收盤價（迷你走勢線）；舊資料可能沒有 */
  spark?: number[];
}

/** public/data/index.json */
export interface IndexData {
  generatedAt: string;
  sample: boolean;
  fx: Record<string, number>; // 例如 { USDTWD: 32.1 }
  /** 無風險利率（年化小數，例如 0.0425）；舊資料可能沒有 */
  riskFree?: number | null;
  /** 分類順序（依設定檔）；舊資料可能沒有 */
  categories?: string[];
  tickers: TickerSummary[];
}

/** 可以疊加在 K 線上的指標 */
// ma*、bb 疊在 K 線上；macd、rsi 是下方另外展開的窗格（預設收起來）
export type OverlayKey = "ma10" | "ma20" | "ma50" | "ma200" | "bb" | "macd" | "rsi";
