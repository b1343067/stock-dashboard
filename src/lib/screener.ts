// 指標篩選器的核心邏輯（第二階段）
// 這個檔案只有「純函式」：輸入資料和條件，輸出是否符合，不碰畫面也不碰 localStorage，
// 所以可以用 src/lib/screener.test.ts 單獨測試。
//
// 名詞：
//   「根」= 一根 K 棒。日線 1 根 = 1 天、週線 1 根 = 1 週、月線 1 根 = 1 個月。
//   「最近 N 根內」= 包含最新這一根，往前共 N 根。N = 1 代表「就是最新這一根」。

import type { Timeframe } from "./types";

/** 篩選器用的精簡資料（public/data/screener.json 裡的每個週期） */
export interface ScreenerSeries {
  time: string[];
  close: number[];
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

export interface ScreenerTicker {
  symbol: string;
  name: string;
  /** 分類；舊資料可能沒有 */
  category?: string;
  currency: string;
  lastDate: string;
  lastClose: number;
  changePct: number;
  daily: ScreenerSeries;
  weekly: ScreenerSeries;
  monthly: ScreenerSeries;
}

export interface ScreenerData {
  generatedAt: string;
  bars: number;
  tickers: ScreenerTicker[];
}

// ---------------------------------------------------------------------------
// 條件定義
// ---------------------------------------------------------------------------

export type ConditionKind =
  | "rsiAbove"
  | "rsiBelow"
  | "rsiRebound"
  | "macdGolden"
  | "macdDeath"
  | "histShrink"
  | "bbBreakUp"
  | "bbBreakDown"
  | "maAbove"
  | "maBelow";

export type Band = "upper" | "middle" | "lower";
export type MaPeriod = 10 | 20 | 50 | 200;

/**
 * 一個篩選條件。不同種類用到的參數不同：
 *   value：RSI 門檻（rsiAbove / rsiBelow / rsiRebound）
 *   n：最近幾根內（交叉類）或連續幾根（histShrink）
 *   band：布林哪一軌
 *   ma：哪一條均線
 * 沒用到的參數保留也沒關係，切換種類時不會遺失使用者輸入的值。
 */
export interface Condition {
  id: string;
  kind: ConditionKind;
  tf: Timeframe;
  value: number;
  n: number;
  band: Band;
  ma: MaPeriod;
}

export type CombineMode = "and" | "or";

export interface ScreenerPreset {
  name: string;
  mode: CombineMode;
  conditions: Condition[];
}

/** 每種條件在畫面上要顯示哪些參數 */
export const KIND_META: Record<ConditionKind, { label: string; params: ("value" | "n" | "band" | "ma")[] }> = {
  rsiAbove: { label: "RSI 高於", params: ["value"] },
  rsiBelow: { label: "RSI 低於", params: ["value"] },
  rsiRebound: { label: "RSI 從低檔回升", params: ["value", "n"] },
  macdGolden: { label: "MACD 黃金交叉", params: ["n"] },
  macdDeath: { label: "MACD 死亡交叉", params: ["n"] },
  histShrink: { label: "MACD 柱狀體連續縮短", params: ["n"] },
  bbBreakUp: { label: "股價突破布林", params: ["band", "n"] },
  bbBreakDown: { label: "股價跌破布林", params: ["band", "n"] },
  maAbove: { label: "股價站上均線", params: ["ma"] },
  maBelow: { label: "股價跌破均線", params: ["ma"] },
};

export const KIND_ORDER = Object.keys(KIND_META) as ConditionKind[];
export const TF_LABEL: Record<Timeframe, string> = { daily: "日線", weekly: "週線", monthly: "月線" };
export const TF_UNIT: Record<Timeframe, string> = { daily: "天", weekly: "週", monthly: "個月" };
export const BAND_LABEL: Record<Band, string> = { upper: "上軌", middle: "中軌", lower: "下軌" };
export const MA_PERIODS: MaPeriod[] = [10, 20, 50, 200];

/** 參數的合理範圍，畫面輸入框和計算都會用到 */
export const LIMITS = {
  value: { min: 0, max: 100 },
  n: { min: 1, max: 20 },
};

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `c${Date.now().toString(36)}${idCounter}`;
}

/** 建立一個新條件，各種類有合理的預設值 */
export function makeCondition(kind: ConditionKind = "rsiBelow", tf: Timeframe = "daily"): Condition {
  const defaults: Record<ConditionKind, Partial<Condition>> = {
    rsiAbove: { value: 70 },
    rsiBelow: { value: 30 },
    rsiRebound: { value: 30, n: 5 },
    macdGolden: { n: 5 },
    macdDeath: { n: 5 },
    histShrink: { n: 3 },
    bbBreakUp: { band: "upper", n: 3 },
    bbBreakDown: { band: "lower", n: 3 },
    maAbove: { ma: 50 },
    maBelow: { ma: 50 },
  };
  return { id: newId(), kind, tf, value: 30, n: 5, band: "upper", ma: 50, ...defaults[kind] };
}

/** 切換條件種類時，套用新種類的預設值，但保留時間週期 */
export function changeKind(c: Condition, kind: ConditionKind): Condition {
  return { ...makeCondition(kind, c.tf), id: c.id };
}

/** 把數字限制在範圍內（使用者可能輸入奇怪的值，或從匯入的設定讀到壞資料） */
export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

// ---------------------------------------------------------------------------
// 條件判斷
// ---------------------------------------------------------------------------

/** 判斷結果：matched = 是否符合；detail = 給使用者看的說明（例如「RSI 28.5」「3 天前交叉」） */
export interface CondResult {
  matched: boolean;
  detail: string;
}

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * 在最近 n 根內，找「由下往上穿越」的那一根。
 * 穿越定義：前一根 a <= b，這一根 a > b。
 * 回傳距今幾根（0 = 最新這根），找不到回傳 -1。
 */
export function findCrossUp(a: (number | null)[], b: (number | null)[], n: number): number {
  const last = a.length - 1;
  for (let k = 0; k < n; k++) {
    const i = last - k;
    if (i < 1) break;
    const a0 = a[i - 1], b0 = b[i - 1], a1 = a[i], b1 = b[i];
    if (isNum(a0) && isNum(b0) && isNum(a1) && isNum(b1) && a0 <= b0 && a1 > b1) return k;
  }
  return -1;
}

/** 由上往下穿越：前一根 a >= b，這一根 a < b */
export function findCrossDown(a: (number | null)[], b: (number | null)[], n: number): number {
  const neg = (arr: (number | null)[]) => arr.map((v) => (isNum(v) ? -v : null));
  return findCrossUp(neg(a), neg(b), n);
}

function ago(k: number, tf: Timeframe): string {
  return k === 0 ? "最新一根" : `${k} ${TF_UNIT[tf]}前`;
}

function bandSeries(s: ScreenerSeries, band: Band) {
  return band === "upper" ? s.bbUpper : band === "middle" ? s.bbMiddle : s.bbLower;
}

/** 判斷單一條件 */
export function evaluateCondition(ticker: ScreenerTicker, c: Condition): CondResult {
  const s = ticker[c.tf];
  if (!s || s.close.length === 0) return { matched: false, detail: "無資料" };
  const last = s.close.length - 1;
  const n = clamp(Math.round(c.n), LIMITS.n.min, LIMITS.n.max);
  const value = clamp(c.value, LIMITS.value.min, LIMITS.value.max);
  const rsi = s.rsi[last];

  switch (c.kind) {
    case "rsiAbove":
      if (!isNum(rsi)) return { matched: false, detail: "RSI 無資料" };
      return { matched: rsi > value, detail: `RSI ${rsi.toFixed(1)}` };

    case "rsiBelow":
      if (!isNum(rsi)) return { matched: false, detail: "RSI 無資料" };
      return { matched: rsi < value, detail: `RSI ${rsi.toFixed(1)}` };

    case "rsiRebound": {
      // 最近 n 根內 RSI 由「低於門檻」穿越到「門檻以上」，而且現在仍在門檻以上
      const level = s.rsi.map(() => value);
      const k = findCrossUp(s.rsi, level, n);
      const stillAbove = isNum(rsi) && rsi >= value;
      if (k >= 0 && stillAbove) return { matched: true, detail: `${ago(k, c.tf)}回升，RSI ${rsi.toFixed(1)}` };
      return { matched: false, detail: isNum(rsi) ? `RSI ${rsi.toFixed(1)}` : "RSI 無資料" };
    }

    case "macdGolden": {
      const k = findCrossUp(s.macd, s.signal, n);
      return { matched: k >= 0, detail: k >= 0 ? `${ago(k, c.tf)}交叉` : "未交叉" };
    }

    case "macdDeath": {
      const k = findCrossDown(s.macd, s.signal, n);
      return { matched: k >= 0, detail: k >= 0 ? `${ago(k, c.tf)}交叉` : "未交叉" };
    }

    case "histShrink": {
      // 連續 n 根：每一根的柱狀體絕對值都比前一根小，而且正負號相同（沒有翻到另一邊）
      let count = 0;
      for (let i = last; i >= 1; i--) {
        const h1 = s.hist[i], h0 = s.hist[i - 1];
        if (!isNum(h1) || !isNum(h0)) break;
        if (Math.sign(h1) !== Math.sign(h0) || h1 === 0) break;
        if (Math.abs(h1) < Math.abs(h0)) count++;
        else break;
      }
      const side = isNum(s.hist[last]) ? (s.hist[last]! > 0 ? "正值柱" : "負值柱") : "";
      return { matched: count >= n, detail: count > 0 ? `${side}已連續縮短 ${count} 根` : "未縮短" };
    }

    case "bbBreakUp":
    case "bbBreakDown": {
      const band = bandSeries(s, c.band);
      const k = c.kind === "bbBreakUp" ? findCrossUp(s.close, band, n) : findCrossDown(s.close, band, n);
      return { matched: k >= 0, detail: k >= 0 ? `${ago(k, c.tf)}${c.kind === "bbBreakUp" ? "突破" : "跌破"}` : "未發生" };
    }

    case "maAbove":
    case "maBelow": {
      const ma = s[`ma${c.ma}` as const][last];
      const close = s.close[last];
      if (!isNum(ma)) return { matched: false, detail: `MA${c.ma} 無資料` };
      const diff = (close / ma - 1) * 100;
      const detail = `距 MA${c.ma} ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
      return { matched: c.kind === "maAbove" ? close > ma : close < ma, detail };
    }
  }
}

export interface ScreenResult {
  ticker: ScreenerTicker;
  matched: boolean;
  /** 每個條件的結果，順序和 conditions 一樣 */
  results: CondResult[];
  /** 符合的條件數 */
  hits: number;
}

/** 用一組條件篩選所有股票。沒有條件時全部視為不符合（避免空條件列出全部造成誤會）。 */
export function runScreen(data: ScreenerTicker[], conditions: Condition[], mode: CombineMode): ScreenResult[] {
  return data.map((ticker) => {
    const results = conditions.map((c) => evaluateCondition(ticker, c));
    const hits = results.filter((r) => r.matched).length;
    const matched = conditions.length > 0 && (mode === "and" ? hits === conditions.length : hits > 0);
    return { ticker, matched, results, hits };
  });
}

/** 把條件轉成一句中文，例如「日線 RSI 低於 30」 */
export function describeCondition(c: Condition): string {
  const tf = TF_LABEL[c.tf];
  const within = c.n === 1 ? "（最新一根）" : `（最近 ${c.n} ${TF_UNIT[c.tf]}內）`;
  switch (c.kind) {
    case "rsiAbove":
      return `${tf} RSI 高於 ${c.value}`;
    case "rsiBelow":
      return `${tf} RSI 低於 ${c.value}`;
    case "rsiRebound":
      return `${tf} RSI 從 ${c.value} 以下回升${within}`;
    case "macdGolden":
      return `${tf} MACD 黃金交叉${within}`;
    case "macdDeath":
      return `${tf} MACD 死亡交叉${within}`;
    case "histShrink":
      return `${tf} MACD 柱狀體連續縮短 ${c.n} 根`;
    case "bbBreakUp":
      return `${tf} 股價突破布林${BAND_LABEL[c.band]}${within}`;
    case "bbBreakDown":
      return `${tf} 股價跌破布林${BAND_LABEL[c.band]}${within}`;
    case "maAbove":
      return `${tf} 股價站上 MA${c.ma}`;
    case "maBelow":
      return `${tf} 股價跌破 MA${c.ma}`;
  }
}

/**
 * 檢查從 localStorage 讀回來的條件是否完整，壞掉的就丟掉、缺的欄位補預設值。
 * （使用者可能手動改過 localStorage，或是舊版本存的格式不同）
 */
export function sanitizeConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return [];
  const out: Condition[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Partial<Condition>;
    if (!o.kind || !(o.kind in KIND_META)) continue;
    const tf: Timeframe = o.tf === "weekly" || o.tf === "monthly" ? o.tf : "daily";
    const base = makeCondition(o.kind, tf);
    out.push({
      ...base,
      value: typeof o.value === "number" ? clamp(o.value, LIMITS.value.min, LIMITS.value.max) : base.value,
      n: typeof o.n === "number" ? clamp(Math.round(o.n), LIMITS.n.min, LIMITS.n.max) : base.n,
      band: o.band === "upper" || o.band === "middle" || o.band === "lower" ? o.band : base.band,
      ma: MA_PERIODS.includes(o.ma as MaPeriod) ? (o.ma as MaPeriod) : base.ma,
    });
  }
  return out;
}

export function sanitizePresets(raw: unknown): ScreenerPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is ScreenerPreset => !!p && typeof p === "object" && typeof (p as ScreenerPreset).name === "string")
    .map((p) => ({
      name: p.name.slice(0, 40),
      mode: p.mode === "or" ? "or" : "and",
      conditions: sanitizeConditions(p.conditions),
    }));
}

/** 內建範例組合（不能刪除，使用者可以載入後修改再另存） */
export const BUILTIN_PRESETS: ScreenerPreset[] = [
  {
    name: "超賣反彈",
    mode: "and",
    conditions: [makeCondition("rsiRebound", "daily"), { ...makeCondition("macdGolden", "daily"), n: 10 }],
  },
  {
    name: "多頭排列（站上 20／50／200 日線）",
    mode: "and",
    conditions: [
      { ...makeCondition("maAbove", "daily"), ma: 20 },
      { ...makeCondition("maAbove", "daily"), ma: 50 },
      { ...makeCondition("maAbove", "daily"), ma: 200 },
    ],
  },
  {
    name: "過熱警示（RSI>70 或突破布林上軌）",
    mode: "or",
    conditions: [makeCondition("rsiAbove", "daily"), { ...makeCondition("bbBreakUp", "daily"), band: "upper", n: 3 }],
  },
  {
    name: "週線轉強",
    mode: "and",
    conditions: [{ ...makeCondition("macdGolden", "weekly"), n: 4 }, { ...makeCondition("maAbove", "weekly"), ma: 20 }],
  },
];
