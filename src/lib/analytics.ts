// 投資組合分析（第四階段）
// 全部是純函式，測試在 analytics.test.ts。
//
// 慣例：
//   - 報酬一律用「日報酬」計算，年化時乘 252（一年約 252 個交易日），波動度乘 √252
//   - 價格一律先換成美元（台股用歷史匯率換算），再算報酬
//   - 無風險利率 rf 是年化小數（例如 0.04 = 4%），換成日利率 = rf / 252
//   - 市場基準 = VOO（S&P 500 ETF）

export const TRADING_DAYS = 252;

export interface PriceSeries {
  time: string[];
  close: number[];
}

// ---------------------------------------------------------------------------
// 基本統計
// ---------------------------------------------------------------------------

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/** 樣本共變異數（除以 n − 1） */
export function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

export function stdev(xs: number[]): number {
  return Math.sqrt(covariance(xs, xs));
}

export function correlation(a: number[], b: number[]): number {
  const d = stdev(a) * stdev(b);
  return d > 0 ? covariance(a, b) / d : NaN;
}

/** 價格 → 日報酬（長度少 1） */
export function dailyReturns(prices: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) r.push(prices[i] / prices[i - 1] - 1);
  return r;
}

/**
 * 最大回撤：從前一個最高點跌下來的最大幅度（負數，例如 -0.25 = -25%）。
 * 同時回傳高點與低點的位置，方便標示在圖上。
 */
export function maxDrawdown(values: number[]): { mdd: number; peakIdx: number; troughIdx: number } {
  let peak = values[0];
  let peakIdx = 0;
  let best = { mdd: 0, peakIdx: 0, troughIdx: 0 };
  for (let i = 1; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
      peakIdx = i;
    }
    const dd = values[i] / peak - 1;
    if (dd < best.mdd) best = { mdd: dd, peakIdx, troughIdx: i };
  }
  return best;
}

// ---------------------------------------------------------------------------
// 資料整理：換匯、對齊日期
// ---------------------------------------------------------------------------

/**
 * 台股價格換成美元：每天的價格 ÷ 當天（或前一個有資料那天）的 USD/TWD。
 * 沒有歷史匯率時退而求其次用最新匯率（固定匯率，會忽略匯率變動，畫面要提示）。
 */
export function convertToUsd(
  s: PriceSeries,
  currency: string,
  fxHistory: PriceSeries | null,
  fxLatest: number | undefined,
): { series: PriceSeries; approx: boolean } | null {
  if (currency === "USD") return { series: s, approx: false };
  if (currency !== "TWD") return null;
  if (fxHistory && fxHistory.time.length > 0) {
    const out: PriceSeries = { time: [], close: [] };
    let j = 0;
    let rate: number | null = null;
    for (let i = 0; i < s.time.length; i++) {
      // 兩邊日期都是排序過的，往前推進找「≤ 當天」的最後一筆匯率
      while (j < fxHistory.time.length && fxHistory.time[j] <= s.time[i]) {
        rate = fxHistory.close[j];
        j++;
      }
      if (rate && rate > 0) {
        out.time.push(s.time[i]);
        out.close.push(s.close[i] / rate);
      }
    }
    return { series: out, approx: false };
  }
  if (fxLatest && fxLatest > 0) {
    return { series: { time: s.time, close: s.close.map((c) => c / fxLatest) }, approx: true };
  }
  return null;
}

export interface Aligned {
  time: string[];
  /** symbol → 價格（和 time 一樣長） */
  prices: Record<string, number[]>;
}

/**
 * 只保留「所有股票都有交易」的日期（取交集）。
 * 台股、美股假日不同，取交集才能逐日比較。
 */
export function alignSeries(series: Record<string, PriceSeries>): Aligned {
  const symbols = Object.keys(series);
  if (symbols.length === 0) return { time: [], prices: {} };
  const maps = symbols.map((s) => {
    const m = new Map<string, number>();
    series[s].time.forEach((t, i) => m.set(t, series[s].close[i]));
    return m;
  });
  const time = series[symbols[0]].time.filter((t) => maps.every((m) => m.has(t))).sort();
  const prices: Record<string, number[]> = {};
  symbols.forEach((s, k) => (prices[s] = time.map((t) => maps[k].get(t)!)));
  return { time, prices };
}

/** 從某個日期開始切片（含該日） */
export function sliceFrom(a: Aligned, startDate: string): Aligned {
  const i = a.time.findIndex((t) => t >= startDate);
  if (i < 0) return { time: [], prices: {} };
  const prices: Record<string, number[]> = {};
  for (const s of Object.keys(a.prices)) prices[s] = a.prices[s].slice(i);
  return { time: a.time.slice(i), prices };
}

// ---------------------------------------------------------------------------
// 組合分析：Beta、Alpha、CAPM、相關係數
// ---------------------------------------------------------------------------

export interface AssetStats {
  symbol: string;
  weight: number;
  annReturn: number; // 年化平均報酬（算術）
  annVol: number; // 年化波動度
  beta: number;
  alpha: number; // Jensen's Alpha（年化）
  capm: number; // CAPM 預期報酬（年化）
}

export interface SeriesStats {
  annReturn: number;
  annVol: number;
  sharpe: number;
  maxDrawdown: number;
}

export interface AnalysisResult {
  symbols: string[];
  start: string;
  end: string;
  days: number;
  assets: AssetStats[];
  /** 加權 Beta = Σ 權重 × 個股 Beta */
  weightedBeta: number;
  /** 組合的 Jensen's Alpha（年化） */
  alpha: number;
  portfolio: SeriesStats;
  market: SeriesStats;
  /** CAPM 用的市場預期報酬（年化） */
  marketExpected: number;
  rf: number;
  /** 相關係數矩陣（順序同 symbols） */
  corr: number[][];
  /** 年化共變異數矩陣（最佳化用） */
  cov: number[][];
}

function seriesStats(returns: number[], rf: number): SeriesStats {
  const annReturn = mean(returns) * TRADING_DAYS;
  const annVol = stdev(returns) * Math.sqrt(TRADING_DAYS);
  // 用固定權重的報酬累積出淨值曲線，再算最大回撤
  const values = [1];
  for (const r of returns) values.push(values[values.length - 1] * (1 + r));
  return {
    annReturn,
    annVol,
    sharpe: annVol > 0 ? (annReturn - rf) / annVol : NaN,
    maxDrawdown: maxDrawdown(values).mdd,
  };
}

/**
 * Jensen's Alpha（年化）：
 *   α = 平均(Rp − rf) − β × 平均(Rm − rf)，再 × 252
 * 意思是「扣掉承擔市場風險（β）應得的報酬之後，多賺（或少賺）了多少」。
 */
export function jensensAlpha(rp: number[], rm: number[], beta: number, rf: number): number {
  const rfd = rf / TRADING_DAYS;
  return (mean(rp.map((r) => r - rfd)) - beta * mean(rm.map((r) => r - rfd))) * TRADING_DAYS;
}

/**
 * 分析一個組合。
 * @param aligned   已對齊、已換成美元的價格（必須包含 market 那一檔）
 * @param weights   symbol → 權重（加總 = 1）
 * @param market    市場基準代號（VOO）
 * @param rf        無風險利率（年化小數）
 * @param marketExpectedOverride  CAPM 的市場預期報酬；不填就用這段期間 VOO 的歷史年化報酬
 *
 * 注意：這裡的組合報酬假設「每天維持固定權重」，用來描述風險特性；
 *       實際買進持有的結果請看 backtest()。
 */
export function analyze(
  aligned: Aligned,
  weights: Record<string, number>,
  market: string,
  rf: number,
  marketExpectedOverride?: number | null,
): AnalysisResult {
  const symbols = Object.keys(weights);
  const rets: Record<string, number[]> = {};
  for (const s of [...symbols, market]) rets[s] = dailyReturns(aligned.prices[s]);
  const rm = rets[market];
  const varM = covariance(rm, rm);
  const marketStats = seriesStats(rm, rf);
  const marketExpected = marketExpectedOverride ?? marketStats.annReturn;

  const assets: AssetStats[] = symbols.map((s) => {
    const r = rets[s];
    const beta = covariance(r, rm) / varM;
    return {
      symbol: s,
      weight: weights[s],
      annReturn: mean(r) * TRADING_DAYS,
      annVol: stdev(r) * Math.sqrt(TRADING_DAYS),
      beta,
      alpha: jensensAlpha(r, rm, beta, rf),
      // CAPM：E(Ri) = rf + βi × (E(Rm) − rf)
      capm: rf + beta * (marketExpected - rf),
    };
  });

  // 固定權重的組合日報酬
  const rp = rm.map((_, t) => symbols.reduce((acc, s) => acc + weights[s] * rets[s][t], 0));
  const portBeta = covariance(rp, rm) / varM;

  const corr = symbols.map((a) => symbols.map((b) => (a === b ? 1 : correlation(rets[a], rets[b]))));
  const cov = symbols.map((a) => symbols.map((b) => covariance(rets[a], rets[b]) * TRADING_DAYS));

  return {
    symbols,
    start: aligned.time[0],
    end: aligned.time[aligned.time.length - 1],
    days: aligned.time.length,
    assets,
    weightedBeta: assets.reduce((acc, a) => acc + a.weight * a.beta, 0),
    alpha: jensensAlpha(rp, rm, portBeta, rf),
    portfolio: seriesStats(rp, rf),
    market: marketStats,
    marketExpected,
    rf,
    corr,
    cov,
  };
}

// ---------------------------------------------------------------------------
// 夏普值最佳化
// ---------------------------------------------------------------------------

export interface OptimizeResult {
  ok: boolean;
  /** 不能最佳化時的原因 */
  reason?: string;
  weights: number[];
  expReturn: number;
  vol: number;
  sharpe: number;
}

/** 組合的預期報酬、波動度、夏普值 */
export function portfolioPerf(w: number[], mu: number[], cov: number[][], rf: number) {
  const expReturn = w.reduce((a, wi, i) => a + wi * mu[i], 0);
  let v = 0;
  for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) v += w[i] * w[j] * cov[i][j];
  const vol = Math.sqrt(Math.max(v, 0));
  return { expReturn, vol, sharpe: vol > 0 ? (expReturn - rf) / vol : NaN };
}

/**
 * 把任意向量「投影」回可行範圍：每個權重介於 [lo, hi]，總和 = 1。
 * 做法：找一個常數 τ，讓 clip(v − τ, lo, hi) 的總和剛好等於 1（二分搜尋）。
 */
export function projectToBox(v: number[], lo: number, hi: number): number[] {
  let a = Math.min(...v) - hi - 1;
  let b = Math.max(...v) - lo + 1;
  const total = (t: number) => v.reduce((s, x) => s + Math.min(hi, Math.max(lo, x - t)), 0);
  for (let k = 0; k < 100; k++) {
    const m = (a + b) / 2;
    if (total(m) > 1) a = m;
    else b = m;
  }
  const t = (a + b) / 2;
  return v.map((x) => Math.min(hi, Math.max(lo, x - t)));
}

/**
 * 在權重限制 [lo, hi]、總和 = 1 之下，找夏普值最高的權重。
 * 方法：投影梯度上升（往夏普值變大的方向走一小步，再投影回可行範圍），
 *       從幾個不同起點出發，取最好的結果，避免卡在局部解。
 */
export function maxSharpe(mu: number[], cov: number[][], rf: number, lo = 0.05, hi = 0.45, start?: number[]): OptimizeResult {
  const n = mu.length;
  const fail = (reason: string): OptimizeResult => ({ ok: false, reason, weights: [], expReturn: NaN, vol: NaN, sharpe: NaN });
  if (n * lo > 1 + 1e-9 || n * hi < 1 - 1e-9) {
    return fail(`權重限制 ${lo * 100}%～${hi * 100}% 下，至少需要 ${Math.ceil(1 / hi)} 檔、最多 ${Math.floor(1 / lo)} 檔股票（目前 ${n} 檔）`);
  }
  if (mu.every((m) => m - rf <= 0)) {
    return fail("所有股票的預期超額報酬都 ≤ 0（市場預期報酬低於無風險利率），夏普值最佳化沒有意義。可以調整「市場預期報酬」再試。");
  }

  const sharpeOf = (w: number[]) => portfolioPerf(w, mu, cov, rf).sharpe;
  const gradient = (w: number[]) => {
    const { expReturn, vol } = portfolioPerf(w, mu, cov, rf);
    const covW = cov.map((row) => row.reduce((a, c, j) => a + c * w[j], 0));
    // d/dw [(wμ − rf) / σ] = μ/σ − (wμ − rf)·Σw/σ³
    return mu.map((m, i) => m / vol - ((expReturn - rf) * covW[i]) / vol ** 3);
  };

  const starts: number[][] = [Array(n).fill(1 / n)];
  if (start && start.length === n) starts.push(projectToBox(start, lo, hi));
  for (let i = 0; i < n; i++) starts.push(projectToBox(mu.map((_, j) => (j === i ? 1 : 0)), lo, hi));

  let best = starts[0];
  let bestS = -Infinity;
  for (let w of starts) {
    w = projectToBox(w, lo, hi);
    let s = sharpeOf(w);
    let step = 0.05;
    for (let iter = 0; iter < 2000 && step > 1e-7; iter++) {
      const g = gradient(w);
      const next = projectToBox(w.map((wi, i) => wi + step * g[i]), lo, hi);
      const ns = sharpeOf(next);
      if (ns > s + 1e-12) {
        w = next;
        s = ns;
        step *= 1.2;
      } else {
        step /= 2; // 走太大步反而變差，縮小步伐
      }
    }
    if (s > bestS) {
      bestS = s;
      best = w;
    }
  }
  return { ok: true, weights: best, ...portfolioPerf(best, mu, cov, rf) };
}

// ---------------------------------------------------------------------------
// 回測（修正 #5：從起始日用設定權重「買進持有」，不用今天的權重回推）
// ---------------------------------------------------------------------------

export interface BacktestStats {
  totalReturn: number;
  cagr: number;
  annVol: number;
  sharpe: number;
  maxDrawdown: number;
  mddPeak: string;
  mddTrough: string;
  finalValue: number;
}

/**
 * 買進持有：在起始日用 initial 元依權重買進，之後不再調整（不再平衡）。
 * 每檔股數 = 權重 × 初始金額 ÷ 起始日價格；之後每天的淨值 = Σ 股數 × 當天價格。
 */
export function buyAndHold(aligned: Aligned, weights: Record<string, number>, initial = 10000): number[] {
  const symbols = Object.keys(weights).filter((s) => weights[s] > 0);
  const shares: Record<string, number> = {};
  for (const s of symbols) shares[s] = (weights[s] * initial) / aligned.prices[s][0];
  return aligned.time.map((_, t) => symbols.reduce((acc, s) => acc + shares[s] * aligned.prices[s][t], 0));
}

export function backtestStats(time: string[], values: number[], rf: number): BacktestStats {
  const r = dailyReturns(values);
  const first = values[0];
  const last = values[values.length - 1];
  const days = (Date.parse(time[time.length - 1]) - Date.parse(time[0])) / 86_400_000;
  const years = days / 365.25;
  const annReturn = mean(r) * TRADING_DAYS;
  const annVol = stdev(r) * Math.sqrt(TRADING_DAYS);
  const dd = maxDrawdown(values);
  return {
    totalReturn: last / first - 1,
    // 年化報酬（CAGR）：期間太短（不到 3 個月）時年化沒有意義
    cagr: years >= 0.25 ? (last / first) ** (1 / years) - 1 : NaN,
    annVol,
    sharpe: annVol > 0 ? (annReturn - rf) / annVol : NaN,
    maxDrawdown: dd.mdd,
    mddPeak: time[dd.peakIdx],
    mddTrough: time[dd.troughIdx],
    finalValue: last,
  };
}

// ---------------------------------------------------------------------------
// 效率前緣（用隨機組合模擬）
// ---------------------------------------------------------------------------

/** 固定種子的亂數（同樣的資料每次畫出來都一樣，測試也可以重現） */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimPoint {
  vol: number;
  ret: number;
  sharpe: number;
}

/**
 * 在權重限制 [lo, hi] 內隨機產生 n 組權重，算出每組的預期報酬與波動。
 * 隨機權重：先抽指數分佈再正規化（各種組合比較平均地分散），再投影回限制範圍內。
 */
export function simulatePortfolios(mu: number[], cov: number[][], rf: number, n: number, lo = 0.05, hi = 0.45, seed = 42): SimPoint[] {
  const k = mu.length;
  if (k === 0 || k * lo > 1 + 1e-9 || k * hi < 1 - 1e-9) return [];
  const rand = seededRandom(seed);
  const pts: SimPoint[] = [];
  for (let i = 0; i < n; i++) {
    const raw = mu.map(() => -Math.log(1 - rand()));
    const sum = raw.reduce((a, b) => a + b, 0);
    const w = projectToBox(raw.map((x) => x / sum), lo, hi);
    const p = portfolioPerf(w, mu, cov, rf);
    pts.push({ vol: p.vol, ret: p.expReturn, sharpe: p.sharpe });
  }
  return pts;
}

/**
 * 效率前緣（近似）：把波動度切成 bins 段，每段取報酬最高的點，
 * 再只保留「報酬隨波動遞增」的點——同樣風險下報酬最高的組合連成的線。
 */
export function frontierEnvelope(points: SimPoint[], bins = 40): SimPoint[] {
  if (points.length === 0) return [];
  const minV = Math.min(...points.map((p) => p.vol));
  const maxV = Math.max(...points.map((p) => p.vol));
  const width = (maxV - minV) / bins || 1;
  const best: (SimPoint | undefined)[] = Array(bins + 1).fill(undefined);
  for (const p of points) {
    const b = Math.min(bins, Math.floor((p.vol - minV) / width));
    if (!best[b] || p.ret > best[b]!.ret) best[b] = p;
  }
  const out: SimPoint[] = [];
  for (const p of best) {
    if (!p) continue;
    // 只保留往右上走的點（最低風險點左下方的「低效率」部分不算前緣）
    if (out.length === 0 || p.ret > out[out.length - 1].ret) out.push(p);
  }
  return out;
}
