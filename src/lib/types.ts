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
  /** 英文名稱（設定檔有填才有；英文模式顯示用） */
  nameEn?: string;
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
  /** 英文名稱（設定檔有填才有） */
  nameEn?: string;
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

// ---------------------------------------------------------------------------
// AI 投研辦公室（#/office）：每日 AI 分析報告的格式
// 範例：public/ai/sample-report.json；驗證：src/lib/aiReport.ts 的 validateReport
// ⚠️ 報告只能使用公開資料（觀察清單、config/notify.json），不可以出現任何持股；
//    不可以給買進／賣出建議或目標價（驗證函式會擋下禁用詞）
// ---------------------------------------------------------------------------

/** 中英文各一份（網站依語言設定顯示其中一個） */
export interface LocalText {
  zh: string;
  en: string;
}

/** 報告裡的一點；refs 是提到的股票（網站會做成連結，漲跌依紅漲綠跌設定上色） */
export interface ReportItem {
  text: LocalText;
  refs?: { symbol: string; changePct?: number }[];
}

export interface ReportSection {
  heading: LocalText;
  items: ReportItem[];
}

export type AiRoleKey = "tech" | "news" | "fundamental" | "debate" | "lead";

export interface AiRoleReport {
  /** done = 今天有寫報告；off = 休假中（沒有報告） */
  status: "done" | "off";
  /** 這段報告使用的資料日期（YYYY-MM-DD） */
  dataDate: string | null;
  /** 一句話摘要 */
  summary: LocalText;
  sections: ReportSection[];
  /** 多空辯論專用：偏多理由、偏空理由 */
  bull?: ReportItem[];
  bear?: ReportItem[];
  /** 主管專用：今日重點 3～5 點 */
  points?: ReportItem[];
}

export interface AiReport {
  version: 1;
  /** true = 範例報告（畫面會清楚標示） */
  sample: boolean;
  /** 報告日期（台灣時間的當天） */
  date: string;
  generatedAt: string;
  /** 各資料來源的日期：美股收盤、台股收盤、新聞 */
  dataDates: { us: string | null; tw: string | null; news: string | null };
  /** 資料過期時的說明（超過 3 個交易日沒更新）；沒有過期為 null */
  staleNote: LocalText | null;
  roles: Record<AiRoleKey, AiRoleReport>;
}

/**
 * AI 週報（每週一的排程任務整理上週的每日報告；驗證：src/lib/aiWeekly.ts 的 validateWeekly）
 * 範例：public/ai/sample-weekly.json；正式：public/ai/weekly/<週一日期>.json
 */
export interface AiWeekly {
  version: 1;
  sample: boolean;
  /** 涵蓋的那一週的週一（YYYY-MM-DD，也是檔名） */
  week: string;
  /** 整理了哪幾天的每日報告 */
  basedOn: string[];
  generatedAt: string;
  /** 一句話總結這一週 */
  summary: LocalText;
  /** 本週重點 3～6 點 */
  points: ReportItem[];
  /** 其他段落（例如本週市場、技術面變化、新聞主題、下週觀察），最多 4 段 */
  sections: ReportSection[];
}
