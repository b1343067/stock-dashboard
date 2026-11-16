// 「現在的狀態」卡片的判斷邏輯（純函式，測試在 signals.test.ts）
// 把最新一根 K 棒的指標，轉成白話的狀態標籤，例如「超賣」「空頭排列」。
// 這些只是描述指標狀態，不是買賣建議。

import { lastValid } from "./data";
import type { SeriesData } from "./types";

/** 偏多 = 漲的顏色、偏空 = 跌的顏色、neutral = 灰色（顏色跟著紅漲綠跌設定） */
export type Tone = "bull" | "bear" | "neutral";

export interface StatusItem {
  key: "rsi" | "ma" | "macd" | "bb";
  title: string;
  /** 大字顯示的數值 */
  value: string;
  /** 右上角的狀態標籤 */
  tag: string;
  tone: Tone;
  /** 一句話說明 */
  note: string;
  /** 量表上的位置（0～100），沒有量表時為 null */
  gauge: number | null;
}

const pct = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

export function rsiStatus(rsi: number | null): StatusItem | null {
  if (rsi === null) return null;
  const tag = rsi >= 70 ? "超買" : rsi <= 30 ? "超賣" : "中性";
  // 超買代表漲多了（偏空警訊）、超賣代表跌深了（可能反彈），所以顏色和「漲跌」相反
  const tone: Tone = rsi >= 70 ? "bear" : rsi <= 30 ? "bull" : "neutral";
  const note = rsi >= 70 ? "高於 70，短線漲多" : rsi <= 30 ? "低於 30，短線跌深" : "介於 30～70 之間";
  return { key: "rsi", title: "RSI 14", value: rsi.toFixed(1), tag, tone, note, gauge: Math.max(0, Math.min(100, rsi)) };
}

/**
 * 均線排列：
 *   多頭排列：股價 > MA20 > MA50 > MA200
 *   空頭排列：股價 < MA20 < MA50 < MA200
 *   其他：盤整（均線糾結）
 * 大字顯示「距 MA50 幾 %」，資料不足時退回 MA20。
 */
export function maStatus(close: number, ma20: number | null, ma50: number | null, ma200: number | null): StatusItem | null {
  const ref = ma50 ?? ma20;
  if (ref === null) return null;
  const refName = ma50 !== null ? "50" : "20";
  let tag = "盤整";
  let tone: Tone = "neutral";
  if (ma20 !== null && ma50 !== null && ma200 !== null) {
    if (close > ma20 && ma20 > ma50 && ma50 > ma200) [tag, tone] = ["多頭排列", "bull"];
    else if (close < ma20 && ma20 < ma50 && ma50 < ma200) [tag, tone] = ["空頭排列", "bear"];
  }
  const d = (close / ref - 1) * 100;
  const d200 = ma200 !== null ? `；200 日均線 ${pct((close / ma200 - 1) * 100)}` : "";
  return {
    key: "ma",
    title: "均線位置",
    value: pct(d),
    tag,
    tone: tone === "neutral" ? (d >= 0 ? "bull" : "bear") : tone,
    note: `${d >= 0 ? "高於" : "低於"} ${refName} 日均線${d200}`,
    gauge: null,
  };
}

/** MACD：DIF 在 DEA 之上 = 偏多；柱狀體和前一根比，是放大還是縮小 */
export function macdStatus(macd: number | null, signal: number | null, hist: number | null, prevHist: number | null): StatusItem | null {
  if (macd === null || signal === null || hist === null) return null;
  const bull = macd > signal;
  const trend = prevHist === null ? "" : Math.abs(hist) < Math.abs(prevHist) ? "，柱狀體縮短中" : "，柱狀體放大中";
  return {
    key: "macd",
    title: "MACD",
    value: hist.toFixed(2),
    tag: bull ? "偏多" : "偏空",
    tone: bull ? "bull" : "bear",
    note: `DIF 在 DEA ${bull ? "之上" : "之下"}${trend}`,
    gauge: null,
  };
}

/** 布林 %B：0% = 下軌、50% = 中軌、100% = 上軌；超出範圍代表突破 */
export function bbStatus(close: number, upper: number | null, lower: number | null): StatusItem | null {
  if (upper === null || lower === null || upper <= lower) return null;
  const b = ((close - lower) / (upper - lower)) * 100;
  let tag = "中段";
  let tone: Tone = "neutral";
  if (b > 100) [tag, tone] = ["突破上軌", "bull"];
  else if (b < 0) [tag, tone] = ["跌破下軌", "bear"];
  else if (b >= 80) tag = "接近上軌";
  else if (b <= 20) tag = "接近下軌";
  return {
    key: "bb",
    title: "布林通道 %B",
    value: `${b.toFixed(0)}%`,
    tag,
    tone,
    note: b > 100 || b < 0 ? "收盤價在通道外" : `位於通道${b >= 50 ? "上半部" : "下半部"}`,
    gauge: Math.max(0, Math.min(100, b)),
  };
}

/** 一次算出四張卡片（資料不足的會略過） */
export function computeStatus(s: SeriesData): StatusItem[] {
  const n = s.close.length;
  if (n === 0) return [];
  const i = n - 1;
  const close = s.close[i];
  return [
    rsiStatus(lastValid(s.rsi)),
    maStatus(close, s.ma20[i], s.ma50[i], s.ma200[i]),
    macdStatus(s.macd[i], s.signal[i], s.hist[i], n > 1 ? s.hist[i - 1] : null),
    bbStatus(close, s.bbUpper[i], s.bbLower[i]),
  ].filter((x): x is StatusItem => x !== null);
}
