// 訊號回測：篩選器／Discord 通知的規則，過去出現之後股價怎麼走？
//
// 為什麼要做？網站每天列出「危險訊號」「偏多訊號」，但規則本身準不準沒人驗證過。
// 這裡用過去約 5 年的日線，把每條規則「重播」一遍，統計出現後 5 天、20 天的報酬與上漲機率，
// 再和「隨便哪一天」（基準）比較。結論由數字產生（statVerdict），規則沒用就照實寫沒用。
//
// 重點設計（避免高估）：
// 1. 判斷訊號用和網站完全相同的 evaluateCondition，而且每一天只給它「到當天為止的最近 30 根」，
//    和每天產生的 screener.json 一模一樣 → 不會偷看未來（signalStats.test.ts 竄改未來價格驗證）
// 2. 只算「第一天出現」（昨天不符合、今天符合）：同一個交叉在 n 天內每天都符合，不能算成好幾次
// 3. 進場價用「訊號隔天的收盤價」：通知是隔天早上才送出，不能假設在訊號當天收盤買到
// 4. 只回測日線條件；週線／月線（當週還沒結束的 K 棒會變）與基本面（沒有歷史資料）的規則略過
// 限制：觀察清單是「現在」挑的股票（倖存者偏差，整體偏強），所以一定要和同一批股票的基準比；
// 同一天很多檔一起出現訊號（大盤急跌）時樣本彼此不獨立，次數看起來多、其實資訊沒那麼多。
// 執行：scripts/signal-stats.ts（每天資料更新後）寫 public/data/signal-stats.json。

import { evaluateCondition, KIND_META, type CombineMode, type Condition, type ScreenerSeries, type ScreenerTicker } from "./screener";

/** 每一天給判斷函式看的 K 棒數（和 screener.json 的 bars 相同） */
export const WINDOW = 30;
export const HORIZONS = [5, 20] as const;
/** 少於這個次數就標「樣本太少」，不下結論 */
export const MIN_EVENTS = 30;

export interface StatRule {
  name: string;
  group: "danger" | "bullish" | "preset";
  mode: CombineMode;
  conditions: Condition[];
  /** 只看某個分類（通知規則可以設定）；沒有或 "all" = 全部 */
  category?: string;
}

export interface HorizonStat {
  /** 有算到報酬的次數（太接近最新一天的訊號還看不到 20 天後） */
  n: number;
  /** 平均報酬 %、上漲機率 % */
  avg: number | null;
  win: number | null;
}

export interface RuleStat {
  name: string;
  group: StatRule["group"];
  /** 訊號出現（第一天）的次數 */
  events: number;
  /** 有幾檔股票出現過 */
  symbols: number;
  h5: HorizonStat;
  h20: HorizonStat;
  /** 最近一次出現的日期 */
  lastDate: string | null;
}

export interface SignalStatsFile {
  generatedAt: string;
  /** 回測期間（訊號日期的範圍） */
  from: string | null;
  to: string | null;
  tickers: number;
  baseline: { h5: HorizonStat; h20: HorizonStat };
  rules: RuleStat[];
  /** 無法回測的規則（有週線／月線／基本面條件） */
  skipped: string[];
}

/** 完整日線（個股檔的 daily，欄位導向） */
export type FullSeries = ScreenerSeries;

const KEYS = ["close", "volume", "ma10", "ma20", "ma50", "ma200", "rsi", "macd", "signal", "hist", "bbUpper", "bbMiddle", "bbLower"] as const;

/** 只看到第 end 根為止的最近 WINDOW 根（和每天的 screener.json 一樣） */
export function windowAt(s: FullSeries, end: number, bars = WINDOW): ScreenerSeries {
  const from = Math.max(0, end - bars + 1);
  const out = { time: s.time.slice(from, end + 1) } as ScreenerSeries;
  for (const k of KEYS) {
    const col = s[k];
    if (col) (out as unknown as Record<string, unknown[]>)[k] = (col as unknown[]).slice(from, end + 1);
  }
  return out;
}

/** 規則能不能回測：全部是日線、沒有基本面條件 */
export function backtestable(rule: Pick<StatRule, "conditions">): boolean {
  return rule.conditions.length > 0 && rule.conditions.every((c) => !KIND_META[c.kind]?.noTf && c.tf === "daily");
}

function matchAt(series: FullSeries, end: number, rule: StatRule): boolean {
  const daily = windowAt(series, end);
  // 只有 daily 會被用到（backtestable 已確認），其他欄位給空的就好
  const tk = { symbol: "", name: "", currency: "", lastDate: "", lastClose: 0, changePct: 0, daily, weekly: daily, monthly: daily } as ScreenerTicker;
  const hits = rule.conditions.filter((c) => evaluateCondition(tk, c).matched).length;
  return rule.mode === "and" ? hits === rule.conditions.length : hits > 0;
}

/** 訊號「第一天出現」的位置（昨天不符合、今天符合）；只用到當天以前的資料 */
export function signalDays(daily: FullSeries, rule: StatRule): number[] {
  const out: number[] = [];
  const start = firstIndex(daily);
  let prev = start > 0 ? matchAt(daily, start - 1, rule) : false;
  for (let t = start; t < daily.close.length; t++) {
    const now = matchAt(daily, t, rule);
    if (now && !prev) out.push(t);
    prev = now;
  }
  return out;
}

/** 訊號日 t 之後 h 天的報酬 %：隔天收盤進場、再過 h 天收盤出場；資料不夠 → null */
export function forwardReturn(close: number[], t: number, h: number): number | null {
  const a = close[t + 1];
  const b = close[t + 1 + h];
  if (!(a > 0) || !(b > 0)) return null;
  return (b / a - 1) * 100;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function summarize(values: number[]): HorizonStat {
  if (values.length === 0) return { n: 0, avg: null, win: null };
  const sum = values.reduce((a, b) => a + b, 0);
  return { n: values.length, avg: r2(sum / values.length), win: r2((values.filter((v) => v > 0).length / values.length) * 100) };
}

/** 判斷從哪一根開始：要有完整的 30 根視窗，而且 200 日線已經有值（否則很多條件一開始都算不出來） */
function firstIndex(s: FullSeries): number {
  const k = s.ma200.findIndex((v) => v !== null);
  return Math.max(WINDOW - 1, k < 0 ? s.close.length : k);
}

export function computeSignalStats(input: { tickers: { symbol: string; category?: string; daily: FullSeries }[]; rules: StatRule[]; generatedAt: string }): SignalStatsFile {
  const usable = input.tickers.filter((t) => t.daily && t.daily.close.length > WINDOW + 25);
  // 基準：同一批股票、同一段期間的每一天
  const base5: number[] = [];
  const base20: number[] = [];
  let from: string | null = null;
  let to: string | null = null;
  for (const { daily } of usable) {
    const start = firstIndex(daily);
    for (let t = start; t < daily.close.length; t++) {
      const time = daily.time[t];
      if (!from || time < from) from = time;
      if (!to || time > to) to = time;
      const a = forwardReturn(daily.close, t, 5);
      const b = forwardReturn(daily.close, t, 20);
      if (a !== null) base5.push(a);
      if (b !== null) base20.push(b);
    }
  }

  const skipped: string[] = [];
  const rules: RuleStat[] = [];
  for (const rule of input.rules) {
    if (!backtestable(rule)) {
      skipped.push(rule.name);
      continue;
    }
    const r5: number[] = [];
    const r20: number[] = [];
    let events = 0;
    let lastDate: string | null = null;
    const syms = new Set<string>();
    const pool = !rule.category || rule.category === "all" ? usable : usable.filter((t) => t.category === rule.category);
    for (const { symbol, daily } of pool) {
      for (const t of signalDays(daily, rule)) {
        events++;
        syms.add(symbol);
        if (!lastDate || daily.time[t] > lastDate) lastDate = daily.time[t];
        const a = forwardReturn(daily.close, t, 5);
        const b = forwardReturn(daily.close, t, 20);
        if (a !== null) r5.push(a);
        if (b !== null) r20.push(b);
      }
    }
    rules.push({ name: rule.name, group: rule.group, events, symbols: syms.size, h5: summarize(r5), h20: summarize(r20), lastDate });
  }
  return { generatedAt: input.generatedAt, from, to, tickers: usable.length, baseline: { h5: summarize(base5), h20: summarize(base20) }, rules, skipped };
}

export type Verdict = "few" | "better" | "worse" | "same";

/**
 * 白話結論（用 20 天）：和基準比，平均報酬差超過 1 個百分點才算有差別。
 * 危險訊號「之後比平常差」= 警告有參考價值；偏多訊號「之後比平常好」= 有參考價值。
 */
export function statVerdict(rule: RuleStat, base: SignalStatsFile["baseline"]): Verdict {
  if (rule.h20.n < MIN_EVENTS || rule.h20.avg === null || base.h20.avg === null) return "few";
  const diff = rule.h20.avg - base.h20.avg;
  if (diff > 1) return "better";
  if (diff < -1) return "worse";
  return "same";
}

/** 結論文字（中文原文，顯示時用 t() 翻譯） */
export function verdictText(rule: RuleStat, v: Verdict): string {
  if (v === "few") return "樣本太少，先不下結論";
  if (v === "same") return "之後的表現和平常差不多";
  const useful = (rule.group === "danger" && v === "worse") || (rule.group !== "danger" && v === "better");
  if (v === "better") return useful ? "之後表現比平常好，有參考價值" : "之後反而比平常好（容易嚇出場）";
  return useful ? "之後表現比平常差，警訊有參考價值" : "之後反而比平常差";
}

/** 依名稱找規則的統計（Discord、AI 素材用） */
export function statOf(file: SignalStatsFile | null, name: string): RuleStat | null {
  return file?.rules.find((r) => r.name === name) ?? null;
}
