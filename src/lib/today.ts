// 今日總覽（首頁）的計算：純函式，測試在 today.test.ts；畫面在 pages/TodayPage.tsx
//
//   1. 持股即時損益：持股（瀏覽器）＋ 即時報價（美股，/api/quote）或收盤資料（台股、API 失敗時）
//   2. 今日訊號變化：觀察清單 49 檔「最近 3 根 K 棒內新出現」的訊號（每日收盤資料）
//      ＋「盤中預估」：把即時價當成今天的收盤，重算指標，看會不會觸發訊號
//   3／4. 新聞、財報要查哪些股票

import { computePortfolio, toUsd, type Holding, type HoldingRow, type PortfolioSettings, type Quote, type StopStatus } from "./portfolio";
import { findCrossDown, findCrossUp, type LiveBase, type ScreenerSeries, type ScreenerTicker } from "./screener";
import type { LiveQuote } from "./finnhub";
import type { TickerSummary } from "./types";

// ---------------------------------------------------------------------------
// 盤中預估：用 liveBase 狀態＋即時價，算出「如果現在收盤」的指標
// ---------------------------------------------------------------------------

export interface EstimatedBar {
  close: number;
  ma10: number | null;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  rsi: number | null;
  macd: number | null;
  signal: number | null;
  hist: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
}

/**
 * 公式和 Python（scripts/indicators.py）完全相同，所以收盤後真的算出來會是同一個數字：
 *   MA_N = (前 N−1 根加總 + 價格) ÷ N
 *   RSI：Wilder 平滑 avg = avg × 13/14 + 今天的漲（跌）幅 × 1/14
 *   MACD：EMA = EMA + α × (價格 − EMA)，α = 2 ÷ (天數 + 1)
 *   布林：20 根的平均 ± 2 × 母體標準差
 */
export function estimateBar(base: LiveBase, price: number): EstimatedBar {
  const ma = (sum: number | null, n: number) => (sum === null ? null : (sum + price) / n);
  const ma20 = ma(base.sum20, 20);
  let rsi: number | null = null;
  if (base.avgGain !== null && base.avgLoss !== null && base.close !== null) {
    const d = price - base.close;
    const g = (base.avgGain * 13 + Math.max(d, 0)) / 14;
    const l = (base.avgLoss * 13 + Math.max(-d, 0)) / 14;
    rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  let macd: number | null = null;
  let signal: number | null = null;
  if (base.ema12 !== null && base.ema26 !== null && base.signal !== null) {
    const e12 = base.ema12 + (2 / 13) * (price - base.ema12);
    const e26 = base.ema26 + (2 / 27) * (price - base.ema26);
    macd = e12 - e26;
    signal = base.signal + (2 / 10) * (macd - base.signal);
  }
  let bbUpper: number | null = null;
  let bbLower: number | null = null;
  if (ma20 !== null && base.sumSq20 !== null) {
    const variance = Math.max(0, (base.sumSq20 + price * price) / 20 - ma20 * ma20);
    bbUpper = ma20 + 2 * Math.sqrt(variance);
    bbLower = ma20 - 2 * Math.sqrt(variance);
  }
  return {
    close: price,
    ma10: ma(base.sum10, 10),
    ma20,
    ma50: ma(base.sum50, 50),
    ma200: ma(base.sum200, 200),
    rsi,
    macd,
    signal,
    hist: macd !== null && signal !== null ? macd - signal : null,
    bbUpper,
    bbMiddle: ma20,
    bbLower,
  };
}

/** 在序列後面接上一根（盤中預估的）K 棒 */
export function appendBar(s: ScreenerSeries, bar: EstimatedBar, time: string): ScreenerSeries {
  return {
    ...s,
    time: [...s.time, time],
    close: [...s.close, bar.close],
    ma10: [...s.ma10, bar.ma10],
    ma20: [...s.ma20, bar.ma20],
    ma50: [...s.ma50, bar.ma50],
    ma200: [...s.ma200, bar.ma200],
    rsi: [...s.rsi, bar.rsi],
    macd: [...s.macd, bar.macd],
    signal: [...s.signal, bar.signal],
    hist: [...s.hist, bar.hist],
    bbUpper: [...s.bbUpper, bar.bbUpper],
    bbMiddle: [...s.bbMiddle, bar.bbMiddle],
    bbLower: [...s.bbLower, bar.bbLower],
  };
}

/** 報價時間（Unix 秒）在紐約是哪一天 */
export function nyDate(unixSec: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unixSec * 1000));
}

/**
 * 即時報價是不是「每日資料還沒有的新交易日」。
 * 不是的話（例如收盤後資料已更新、或週末），即時價就等於最後一根收盤，不能再當成新的一根，否則會算出假訊號。
 */
export function isNewSession(quote: LiveQuote, lastDate: string): boolean {
  return quote.time > 0 && nyDate(quote.time) > lastDate;
}

// ---------------------------------------------------------------------------
// 訊號變化
// ---------------------------------------------------------------------------

export type Tone = "bull" | "danger";

export interface SignalEvent {
  symbol: string;
  /** 中文說明（畫面上用 t() 翻譯） */
  label: string;
  tone: Tone;
  tf: "daily" | "weekly";
  /** 幾根前發生（0 = 最新一根） */
  barsAgo: number;
  /** true = 盤中預估（收盤後才確定） */
  intraday: boolean;
}

type Detector = { label: string; tone: Tone; detect: (s: ScreenerSeries, n: number) => number };
const level = (s: ScreenerSeries, v: number) => s.rsi.map(() => v);

/** 日線要偵測的訊號（使用者指定的清單） */
const DAILY: Detector[] = [
  { label: "MACD 黃金交叉", tone: "bull", detect: (s, n) => findCrossUp(s.macd, s.signal, n) },
  { label: "MACD 死亡交叉", tone: "danger", detect: (s, n) => findCrossDown(s.macd, s.signal, n) },
  { label: "RSI 跌破 30", tone: "danger", detect: (s, n) => findCrossDown(s.rsi, level(s, 30), n) },
  { label: "RSI 回升到 30 以上", tone: "bull", detect: (s, n) => findCrossUp(s.rsi, level(s, 30), n) },
  // 突破 70 = 過熱，放在「危險」：短線漲多，追高風險變大
  { label: "RSI 突破 70（過熱）", tone: "danger", detect: (s, n) => findCrossUp(s.rsi, level(s, 70), n) },
  { label: "突破 MA20", tone: "bull", detect: (s, n) => findCrossUp(s.close, s.ma20, n) },
  { label: "跌破 MA20", tone: "danger", detect: (s, n) => findCrossDown(s.close, s.ma20, n) },
  { label: "突破 MA50", tone: "bull", detect: (s, n) => findCrossUp(s.close, s.ma50, n) },
  { label: "跌破 MA50", tone: "danger", detect: (s, n) => findCrossDown(s.close, s.ma50, n) },
  { label: "突破 MA200", tone: "bull", detect: (s, n) => findCrossUp(s.close, s.ma200, n) },
  { label: "跌破 MA200", tone: "danger", detect: (s, n) => findCrossDown(s.close, s.ma200, n) },
  { label: "突破布林上軌", tone: "bull", detect: (s, n) => findCrossUp(s.close, s.bbUpper, n) },
  { label: "跌破布林下軌", tone: "danger", detect: (s, n) => findCrossDown(s.close, s.bbLower, n) },
];

/** 週線只看 MACD（使用者指定） */
const WEEKLY: Detector[] = [
  { label: "週線 MACD 黃金交叉", tone: "bull", detect: (s, n) => findCrossUp(s.macd, s.signal, n) },
  { label: "週線 MACD 死亡交叉", tone: "danger", detect: (s, n) => findCrossDown(s.macd, s.signal, n) },
];

/** 所有訊號名稱（i18n.test.ts 檢查都有英文） */
export const SIGNAL_LABELS = [...DAILY, ...WEEKLY].map((d) => d.label);

function run(symbol: string, s: ScreenerSeries, defs: Detector[], n: number, tf: "daily" | "weekly", intraday: boolean): SignalEvent[] {
  const out: SignalEvent[] = [];
  for (const d of defs) {
    const k = d.detect(s, n);
    if (k >= 0) out.push({ symbol, label: d.label, tone: d.tone, tf, barsAgo: k, intraday });
  }
  return out;
}

/** 收盤資料：最近 withinBars 根內新出現的訊號（日線＋週線 MACD） */
export function recentEvents(tk: ScreenerTicker, withinBars = 3): SignalEvent[] {
  return [...run(tk.symbol, tk.daily, DAILY, withinBars, "daily", false), ...run(tk.symbol, tk.weekly, WEEKLY, 1, "weekly", false)];
}

/** 盤中預估：把即時價當成今天的收盤，看最新這根會觸發哪些日線訊號 */
export function intradayEvents(tk: ScreenerTicker, quote: LiveQuote): SignalEvent[] {
  if (!tk.liveBase || !isNewSession(quote, tk.lastDate)) return [];
  const extended = appendBar(tk.daily, estimateBar(tk.liveBase, quote.price), nyDate(quote.time));
  return run(tk.symbol, extended, DAILY, 1, "daily", true);
}

/** 排序：持股優先 → 盤中預估 → 越新的越前面 → 代號 */
export function sortEvents(events: SignalEvent[], holdings: Set<string>): SignalEvent[] {
  return [...events].sort(
    (a, b) =>
      Number(holdings.has(b.symbol)) - Number(holdings.has(a.symbol)) ||
      Number(b.intraday) - Number(a.intraday) ||
      a.barsAgo - b.barsAgo ||
      a.symbol.localeCompare(b.symbol),
  );
}

// ---------------------------------------------------------------------------
// 持股即時損益
// ---------------------------------------------------------------------------

export interface LiveRow extends HoldingRow {
  /** 這一列的價格是不是即時的（否則是每日收盤） */
  isLive: boolean;
  prevClose: number | null;
  /** 今日漲跌（原幣，每股）與 % */
  dayChange: number | null;
  dayChangePct: number | null;
  /** 今日損益（美元） */
  dayPnlUsd: number | null;
}

export interface LiveSummary {
  rows: LiveRow[];
  totalValueUsd: number;
  dayPnlUsd: number;
  dayPnlPct: number | null;
  unrealizedUsd: number;
  unrealizedPct: number | null;
  liveCount: number;
  missing: number;
}

/** 停利停損越緊急越前面：已觸及 → 接近 → 其他（依市值） */
const URGENCY: Record<StopStatus, number> = { "tp-hit": 0, "sl-hit": 0, "sl-near": 1, "tp-near": 1, normal: 2, none: 2 };

export function liveHoldings(
  holdings: Holding[],
  index: TickerSummary[],
  live: Record<string, LiveQuote>,
  fx: Record<string, number>,
  settings: PortfolioSettings,
): LiveSummary {
  const bySymbol = new Map(index.map((tk) => [tk.symbol, tk]));
  const quotes: Record<string, Quote> = {};
  const prev: Record<string, number | null> = {};
  for (const h of holdings) {
    const tk = bySymbol.get(h.symbol);
    const lq = live[h.symbol];
    if (lq) {
      quotes[h.symbol] = { price: lq.price, currency: tk?.currency ?? "USD", name: tk?.name ?? h.symbol, date: nyDate(lq.time) };
      prev[h.symbol] = lq.prevClose;
    } else if (tk) {
      quotes[h.symbol] = { price: tk.lastClose, currency: tk.currency, name: tk.name, date: tk.lastDate };
      // 收盤資料的「昨收」從漲跌幅反推
      prev[h.symbol] = Number.isFinite(tk.changePct) ? tk.lastClose / (1 + tk.changePct / 100) : null;
    }
  }
  const summary = computePortfolio(holdings, quotes, fx, settings);
  let dayPnlUsd = 0;
  const rows: LiveRow[] = summary.rows.map((r) => {
    const p = prev[r.holding.symbol] ?? null;
    const price = r.quote?.price ?? null;
    const dayChange = p !== null && price !== null ? price - p : null;
    const dayUsd = dayChange === null ? null : toUsd(dayChange * r.holding.shares, r.currency, fx);
    if (dayUsd !== null) dayPnlUsd += dayUsd;
    return {
      ...r,
      isLive: !!live[r.holding.symbol],
      prevClose: p,
      dayChange,
      dayChangePct: dayChange !== null && p ? (dayChange / p) * 100 : null,
      dayPnlUsd: dayUsd,
    };
  });
  rows.sort((a, b) => URGENCY[a.status] - URGENCY[b.status] || (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0));
  const startValue = summary.totalValueUsd - dayPnlUsd;
  return {
    rows,
    totalValueUsd: summary.totalValueUsd,
    dayPnlUsd,
    dayPnlPct: startValue > 0 ? (dayPnlUsd / startValue) * 100 : null,
    unrealizedUsd: summary.totalPnlUsd,
    unrealizedPct: summary.totalReturnPct,
    liveCount: rows.filter((r) => r.isLive).length,
    missing: summary.missingQuotes,
  };
}

// ---------------------------------------------------------------------------
// 新聞、財報、異常波動
// ---------------------------------------------------------------------------

const isUs = (s: string) => !/\.TWO?$/i.test(s);

/** 單日漲跌超過這個 % 標示「異常波動」 */
export const BIG_MOVE_PCT = 5;

/** 要查新聞的股票：持股 → 異常波動 → 有新訊號的，只有美股（Finnhub 免費版沒有台股新聞），最多 max 檔 */
export function newsTargets(holdings: string[], bigMovers: string[], signalSymbols: string[], max = 20): string[] {
  const out: string[] = [];
  for (const s of [...holdings, ...bigMovers, ...signalSymbols]) if (isUs(s) && !out.includes(s)) out.push(s);
  return out.slice(0, max);
}

/** 今日漲跌超過 5% 的股票（有即時價用即時價） */
export function bigMovers(tickers: TickerSummary[], live: Record<string, LiveQuote>, symbols: Set<string>): { symbol: string; changePct: number }[] {
  const out: { symbol: string; changePct: number }[] = [];
  for (const tk of tickers) {
    if (!symbols.has(tk.symbol)) continue;
    const pct = live[tk.symbol]?.changePct ?? tk.changePct;
    if (Number.isFinite(pct) && Math.abs(pct) >= BIG_MOVE_PCT) out.push({ symbol: tk.symbol, changePct: pct });
  }
  return out.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}

/** 距今天幾天（財報提醒用；today 是使用者當地的 YYYY-MM-DD） */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}
