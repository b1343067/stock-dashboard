// 指標篩選器的核心邏輯（第二階段）
// 這個檔案只有「純函式」：輸入資料和條件，輸出是否符合，不碰畫面也不碰 localStorage，
// 所以可以用 src/lib/screener.test.ts 單獨測試。
//
// 名詞：
//   「根」= 一根 K 棒。日線 1 根 = 1 天、週線 1 根 = 1 週、月線 1 根 = 1 個月。
//   「最近 N 根內」= 包含最新這一根，往前共 N 根。N = 1 代表「就是最新這一根」。

import type { Timeframe } from "./types";
import { t } from "./i18n";

/** 篩選器用的精簡資料（public/data/screener.json 裡的每個週期） */
export interface ScreenerSeries {
  time: string[];
  close: number[];
  /** 成交量（舊的 screener.json 沒有） */
  volume?: number[];
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

/** 篩選器用的基本面（screener.json；舊資料沒有） */
export interface ScreenerFundamentals {
  pe: number | null;
  forwardPe: number | null;
  pb: number | null;
  dividendYield: number | null;
  high52w: number | null;
  low52w: number | null;
}

export interface ScreenerTicker {
  fundamentals?: ScreenerFundamentals;
  symbol: string;
  name: string;
  nameEn?: string;
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
  | "maBelow"
  // 基本面條件（加碼 B）：和日／週／月線無關
  | "peBelow"
  | "yieldAbove"
  | "near52High"
  | "near52Low"
  // 均線交叉、成交量
  | "maCrossUp"
  | "maCrossDown"
  | "volSpike";

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
  /** 均線交叉用的第二條（較長的）均線 */
  ma2: MaPeriod;
}

export type CombineMode = "and" | "or";

export interface ScreenerPreset {
  name: string;
  mode: CombineMode;
  conditions: Condition[];
}

/** 每種條件在畫面上要顯示哪些參數 */
export const KIND_META: Record<
  ConditionKind,
  { label: string; params: ("value" | "n" | "band" | "ma" | "ma2")[]; /** 基本面條件不分週期 */ noTf?: boolean; unit?: string }
> = {
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
  peBelow: { label: "本益比低於", params: ["value"], noTf: true, unit: "倍" },
  yieldAbove: { label: "殖利率高於", params: ["value"], noTf: true, unit: "%" },
  near52High: { label: "接近 52 週高點（差距在）", params: ["value"], noTf: true, unit: "% 以內" },
  near52Low: { label: "接近 52 週低點（差距在）", params: ["value"], noTf: true, unit: "% 以內" },
  maCrossUp: { label: "均線黃金交叉", params: ["ma", "ma2", "n"] },
  maCrossDown: { label: "均線死亡交叉", params: ["ma", "ma2", "n"] },
  volSpike: { label: "成交量放大", params: ["value"], unit: "倍（相對前 20 根平均）" },
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
    peBelow: { value: 20 },
    yieldAbove: { value: 3 },
    near52High: { value: 5 },
    near52Low: { value: 10 },
    maCrossUp: { ma: 50, ma2: 200, n: 5 },
    maCrossDown: { ma: 50, ma2: 200, n: 5 },
    volSpike: { value: 2 },
  };
  return { id: newId(), kind, tf, value: 30, n: 5, band: "upper", ma: 50, ma2: 200, ...defaults[kind] };
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
  return k === 0 ? t("最新一根") : t("{0} {1}前", [k, t(TF_UNIT[tf])]);
}

function bandSeries(s: ScreenerSeries, band: Band) {
  return band === "upper" ? s.bbUpper : band === "middle" ? s.bbMiddle : s.bbLower;
}

/** 基本面條件：用 screener.json 的 fundamentals，不看週期 */
function evaluateFundamental(ticker: ScreenerTicker, c: Condition): CondResult {
  const f = ticker.fundamentals;
  const value = clamp(c.value, LIMITS.value.min, LIMITS.value.max);
  if (!f) return { matched: false, detail: t("無基本面資料") };
  const close = ticker.lastClose;
  switch (c.kind) {
    case "peBelow":
      // 沒有本益比（ETF、虧損）一律不符合，避免把虧損公司當成「便宜」
      if (!isNum(f.pe)) return { matched: false, detail: t("無本益比") };
      return { matched: f.pe < value, detail: t("本益比 {0}", [f.pe.toFixed(1)]) };
    case "yieldAbove": {
      const y = isNum(f.dividendYield) ? f.dividendYield : 0;
      return { matched: y > value, detail: t("殖利率 {0}%", [y.toFixed(2)]) };
    }
    case "near52High": {
      if (!isNum(f.high52w) || f.high52w <= 0) return { matched: false, detail: t("無 52 週資料") };
      // 距高點還差幾 %（0 = 就在高點）；四捨五入到 0.01，避免 4.9999…／5.0000…1 這種浮點誤差讓剛好 5% 判斷錯
      const gap = Math.round((1 - close / f.high52w) * 10000) / 100;
      return { matched: gap <= value, detail: gap <= 0 ? t("創 52 週新高") : t("距高點 {0}%", [gap.toFixed(1)]) };
    }
    case "near52Low": {
      if (!isNum(f.low52w) || f.low52w <= 0) return { matched: false, detail: t("無 52 週資料") };
      const gap = Math.round((close / f.low52w - 1) * 10000) / 100; // 比低點高幾 %
      return { matched: gap <= value, detail: gap <= 0 ? t("創 52 週新低") : t("高於低點 {0}%", [gap.toFixed(1)]) };
    }
    default:
      return { matched: false, detail: "" };
  }
}

/** 判斷單一條件 */
export function evaluateCondition(ticker: ScreenerTicker, c: Condition): CondResult {
  if (KIND_META[c.kind].noTf) return evaluateFundamental(ticker, c);
  const s = ticker[c.tf];
  if (!s || s.close.length === 0) return { matched: false, detail: t("無資料") };
  const last = s.close.length - 1;
  const n = clamp(Math.round(c.n), LIMITS.n.min, LIMITS.n.max);
  const value = clamp(c.value, LIMITS.value.min, LIMITS.value.max);
  const rsi = s.rsi[last];

  switch (c.kind) {
    case "rsiAbove":
      if (!isNum(rsi)) return { matched: false, detail: t("RSI 無資料") };
      return { matched: rsi > value, detail: `RSI ${rsi.toFixed(1)}` };

    case "rsiBelow":
      if (!isNum(rsi)) return { matched: false, detail: t("RSI 無資料") };
      return { matched: rsi < value, detail: `RSI ${rsi.toFixed(1)}` };

    case "rsiRebound": {
      // 最近 n 根內 RSI 由「低於門檻」穿越到「門檻以上」，而且現在仍在門檻以上
      const level = s.rsi.map(() => value);
      const k = findCrossUp(s.rsi, level, n);
      const stillAbove = isNum(rsi) && rsi >= value;
      if (k >= 0 && stillAbove) return { matched: true, detail: t("{0}回升，RSI {1}", [ago(k, c.tf), rsi.toFixed(1)]) };
      return { matched: false, detail: isNum(rsi) ? `RSI ${rsi.toFixed(1)}` : t("RSI 無資料") };
    }

    case "macdGolden": {
      const k = findCrossUp(s.macd, s.signal, n);
      return { matched: k >= 0, detail: k >= 0 ? t("{0}交叉", [ago(k, c.tf)]) : t("未交叉") };
    }

    case "macdDeath": {
      const k = findCrossDown(s.macd, s.signal, n);
      return { matched: k >= 0, detail: k >= 0 ? t("{0}交叉", [ago(k, c.tf)]) : t("未交叉") };
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
      const side = isNum(s.hist[last]) ? (s.hist[last]! > 0 ? t("正值柱") : t("負值柱")) : "";
      return { matched: count >= n, detail: count > 0 ? t("{0}已連續縮短 {1} 根", [side, count]) : t("未縮短") };
    }

    case "bbBreakUp":
    case "bbBreakDown": {
      const band = bandSeries(s, c.band);
      const k = c.kind === "bbBreakUp" ? findCrossUp(s.close, band, n) : findCrossDown(s.close, band, n);
      return { matched: k >= 0, detail: k >= 0 ? (c.kind === "bbBreakUp" ? t("{0}突破", [ago(k, c.tf)]) : t("{0}跌破", [ago(k, c.tf)])) : t("未發生") };
    }

    case "maAbove":
    case "maBelow": {
      const ma = s[`ma${c.ma}` as const][last];
      const close = s.close[last];
      if (!isNum(ma)) return { matched: false, detail: t("MA{0} 無資料", [c.ma]) };
      const diff = (close / ma - 1) * 100;
      const detail = t("距 MA{0} {1}{2}%", [c.ma, diff >= 0 ? "+" : "", diff.toFixed(1)]);
      return { matched: c.kind === "maAbove" ? close > ma : close < ma, detail };
    }
    case "maCrossUp":
    case "maCrossDown": {
      // 短均線由下往上（黃金交叉）或由上往下（死亡交叉）穿越長均線，例如 MA50 穿越 MA200
      if (c.ma === c.ma2) return { matched: false, detail: t("兩條均線相同") };
      const a = s[`ma${c.ma}` as const];
      const b = s[`ma${c.ma2}` as const];
      const k = c.kind === "maCrossUp" ? findCrossUp(a, b, n) : findCrossDown(a, b, n);
      return { matched: k >= 0, detail: k >= 0 ? t("{0}交叉", [ago(k, c.tf)]) : t("未交叉") };
    }

    case "volSpike": {
      // 最新一根的成交量 ÷ 前 20 根的平均（不含最新這根，否則爆量會把平均拉高）
      const v = s.volume;
      if (!v || v.length < 21) return { matched: false, detail: t("無成交量資料") };
      const prev = v.slice(-21, -1);
      const avg = prev.reduce((x, y) => x + y, 0) / prev.length;
      if (!(avg > 0)) return { matched: false, detail: t("無成交量資料") };
      // 倍數四捨五入到 0.01，避免剛好 2 倍時因浮點誤差判斷錯
      const ratio = Math.round((v[v.length - 1] / avg) * 100) / 100;
      const min = value > 0 ? value : 2;
      return { matched: ratio >= min, detail: t("成交量 {0} 倍", [ratio.toFixed(2)]) };
    }
    default:
      return { matched: false, detail: "" };
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
  const tf = t(TF_LABEL[c.tf]);
  const within = c.n === 1 ? t("（最新一根）") : t("（最近 {0} {1}內）", [c.n, t(TF_UNIT[c.tf])]);
  switch (c.kind) {
    case "rsiAbove":
      return t("{0} RSI 高於 {1}", [tf, c.value]);
    case "rsiBelow":
      return t("{0} RSI 低於 {1}", [tf, c.value]);
    case "rsiRebound":
      return t("{0} RSI 從 {1} 以下回升{2}", [tf, c.value, within]);
    case "macdGolden":
      return t("{0} MACD 黃金交叉{1}", [tf, within]);
    case "macdDeath":
      return t("{0} MACD 死亡交叉{1}", [tf, within]);
    case "histShrink":
      return t("{0} MACD 柱狀體連續縮短 {1} 根", [tf, c.n]);
    case "bbBreakUp":
      return t("{0} 股價突破布林{1}{2}", [tf, t(BAND_LABEL[c.band]), within]);
    case "bbBreakDown":
      return t("{0} 股價跌破布林{1}{2}", [tf, t(BAND_LABEL[c.band]), within]);
    case "maAbove":
      return t("{0} 股價站上 MA{1}", [tf, c.ma]);
    case "maBelow":
      return t("{0} 股價跌破 MA{1}", [tf, c.ma]);
    case "peBelow":
      return t("本益比低於 {0} 倍", [c.value]);
    case "yieldAbove":
      return t("殖利率高於 {0}%", [c.value]);
    case "near52High":
      return t("距 52 週高點 {0}% 以內", [c.value]);
    case "near52Low":
      return t("距 52 週低點 {0}% 以內", [c.value]);
    case "maCrossUp":
      return t("{0} MA{1} 向上穿越 MA{2}{3}", [tf, c.ma, c.ma2, within]);
    case "maCrossDown":
      return t("{0} MA{1} 向下跌破 MA{2}{3}", [tf, c.ma, c.ma2, within]);
    case "volSpike":
      return t("{0} 成交量達前 20 根平均的 {1} 倍以上", [tf, c.value]);
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
      ma2: MA_PERIODS.includes(o.ma2 as MaPeriod) ? (o.ma2 as MaPeriod) : base.ma2,
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
    name: "高殖利率且本益比合理",
    mode: "and",
    conditions: [makeCondition("yieldAbove"), makeCondition("peBelow")],
  },
  {
    name: "長線黃金交叉（50 日線穿越 200 日線）",
    mode: "and",
    conditions: [{ ...makeCondition("maCrossUp", "daily"), n: 10 }],
  },
  {
    name: "爆量上漲（成交量 2 倍且站上 20 日線）",
    mode: "and",
    conditions: [makeCondition("volSpike", "daily"), { ...makeCondition("maAbove", "daily"), ma: 20 }],
  },
  {
    name: "週線轉強",
    mode: "and",
    conditions: [{ ...makeCondition("macdGolden", "weekly"), n: 4 }, { ...makeCondition("maAbove", "weekly"), ma: 20 }],
  },
];
