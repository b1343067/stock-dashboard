// ML 實驗室（public/data/ml.json，由 scripts/ml_lab.py 每天產生）的型別與顯示用的判斷
// 結論文字一律從數字產生，不寫死：如果哪天模型贏了，頁面就會照實寫贏了。測試在 ml.test.ts。

import { t } from "./i18n";

export interface VolModel {
  key: "naive" | "ewma" | "har" | "gbm";
  name: string;
  /** QLIKE（越小越好） */
  qlike: number;
  /** 平均絕對誤差（年化波動的百分點） */
  mae: number;
  /** QLIKE 比基準（過去 20 天）少了幾 % */
  improvement: number;
}

export interface VolTicker {
  date: string;
  /** 預測的年化波動 % */
  predAnn: number;
  /** 未來 5 天常見的漲跌範圍（±1 個標準差，%） */
  range5: number;
  naiveAnn: number;
  /** 這個預測在這檔股票近一年是第幾百分位 */
  pctile: number | null;
  /** 這檔實際用的模型（最佳模型在這檔輸給基準時改用 naive） */
  model: VolModel["key"];
  /** 這檔在測試期，最佳模型比基準好多少 %（負的 = 比較差） */
  improvement: number | null;
}

export interface DirModel {
  key: "up" | "trend" | "logit" | "gbm";
  name: string;
  accuracy: number;
  auc: number;
  /** 準確率比「永遠猜漲」多幾個百分點 */
  vsUp: number;
  /** 單尾 t 檢定：是否真的比永遠猜漲好（越小越可信；< 0.05 才算有證據） */
  pValue?: number;
  strategy?: PerfStats;
}

export interface PerfStats {
  total: number | null;
  annual: number | null;
  sharpe: number | null;
}

export interface MlData {
  generatedAt: string;
  horizon: number;
  symbols: number;
  samples: number;
  trainStart: string;
  testStart: string;
  testEnd: string;
  refitEvery: number;
  cost: number;
  features: { vol: string[]; direction: string[] };
  vol: {
    models: VolModel[];
    best: VolModel["key"];
    tickers: Record<string, VolTicker>;
    examples: Record<string, { time: string[]; actual: number[]; naive: number[]; best: number[] }>;
  };
  direction: {
    baseRate: number;
    models: DirModel[];
    buyHold: PerfStats;
    curves: { time: string[]; buyHold: number[] } & Record<string, number[] | string[]>;
    byYear: ({ year: number; baseRate: number } & Record<string, number>)[];
    periods: number;
  };
}

/** ml-vol.json：看盤頁卡片用的小檔（每檔的預測＋模型名稱） */
export interface MlVolData {
  generatedAt: string;
  horizon: number;
  models: { key: VolModel["key"]; name: string }[];
  tickers: Record<string, VolTicker>;
}

export function validMlVol(d: unknown): d is MlVolData {
  const o = d as MlVolData;
  return !!o && Array.isArray(o.models) && typeof o.tickers === "object" && o.tickers !== null;
}

/** 檢查 ml.json 的基本結構（壞掉或舊格式就當作沒有資料，頁面顯示提示） */
export function validMl(d: unknown): d is MlData {
  const o = d as MlData;
  return !!o && Array.isArray(o.vol?.models) && typeof o.vol?.tickers === "object" && Array.isArray(o.direction?.models);
}

/** 百分位 → 白話（中文原文，畫面用 t() 翻譯） */
export function pctileLabel(p: number | null): string {
  if (p === null) return "—";
  if (p >= 80) return "偏高";
  if (p >= 60) return "略高";
  if (p > 40) return "一般";
  if (p > 20) return "略低";
  return "偏低";
}

/** 波動實驗的結論：最佳模型、比基準好多少（回傳 t() 的 key 與參數） */
export function volConclusion(vol: MlData["vol"]): { key: string; args: (string | number)[] } {
  const best = vol.models.find((m) => m.key === vol.best);
  if (!best || best.key === "naive" || best.improvement <= 0) {
    return { key: "這段期間沒有模型贏過「過去 20 天的波動」這個基準。", args: [] };
  }
  return { key: "最佳的是「{0}」：預測誤差（QLIKE）比基準少 {1}%。波動確實有規律可以預測。", args: [t(best.name), best.improvement] };
}

/**
 * 方向實驗的結論。判斷標準：準確率高於「永遠猜漲」而且 p < 0.05 才算「有證據贏」。
 * 只贏一點點但 p 值大，可能只是運氣，結論會說清楚。
 */
export function dirConclusion(dir: MlData["direction"]): { key: string; args: (string | number)[]; beat: boolean } {
  const contenders = dir.models.filter((m) => m.key !== "up");
  const winners = contenders.filter((m) => m.vsUp > 0 && (m.pValue ?? 1) < 0.05);
  if (winners.length > 0) {
    const w = winners.reduce((a, b) => (b.vsUp > a.vsUp ? b : a));
    return { key: "「{0}」的準確率比「永遠猜漲」高 {1} 個百分點（p = {2}），有統計證據。但只是這段期間的結果，未來不一定成立。", args: [t(w.name), w.vsUp, fmtP(w.pValue)], beat: true };
  }
  const best = contenders.reduce((a, b) => (b.accuracy > a.accuracy ? b : a), contenders[0]);
  if (best && best.vsUp > 0) {
    return { key: "「{0}」的準確率比「永遠猜漲」高 {1} 個百分點，但 p = {2}，差距可能只是運氣，不能說模型有用。", args: [t(best.name), best.vsUp, fmtP(best.pValue)], beat: false };
  }
  return { key: "沒有任何模型贏過「永遠猜漲」（這段期間 {0}% 的時候是漲的）。股價的漲跌方向，用過去的價格與指標預測不了。", args: [dir.baseRate], beat: false };
}

/** p 值顯示：太小的寫 < 0.001 */
export function fmtP(p: number | undefined): string {
  if (p === undefined) return "—";
  return p < 0.001 ? "< 0.001" : p.toFixed(3);
}
