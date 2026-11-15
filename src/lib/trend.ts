// 短期趨勢外推（修正 #4：原本叫「AI 預測」，其實只是線性回歸外推，改名避免誤導）
//
// 做法：用最近 N 個交易日的收盤價畫一條最適直線（最小平方法），把這條線往後延伸。
// 為了誠實呈現效果，同時拿過去一年做「回測」，
// 和最簡單的方法「明天價格 = 今天價格」（naive）比較誤差。
// 純函式，測試在 trend.test.ts。

/** 最小平方法直線：y = intercept + slope × x，x = 0, 1, 2, … */
export function linearFit(y: number[]): { slope: number; intercept: number } {
  const n = y.length;
  const mx = (n - 1) / 2;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (y[i] - my);
    den += (i - mx) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

/** 用最後 lookback 筆資料，外推之後 horizon 筆。回傳長度 = horizon */
export function extrapolate(closes: number[], lookback: number, horizon: number): number[] {
  const y = closes.slice(-lookback);
  const { slope, intercept } = linearFit(y);
  const lastX = y.length - 1;
  return Array.from({ length: horizon }, (_, k) => intercept + slope * (lastX + k + 1));
}

// ---------------------------------------------------------------------------
// 交易日（預測日期只算交易日，跳過週末與休市日）
// ---------------------------------------------------------------------------

/**
 * 美股（NYSE）休市日。⚠️ 每年要手動補新的一年。
 * 來源：NYSE 公告的休市日（元旦、MLK、總統日、耶穌受難日、陣亡將士、六月節、獨立日、勞動節、感恩節、聖誕節）
 */
const NYSE_HOLIDAYS = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * 從 lastDate 之後，往後數 count 個交易日。
 * 美股跳過週末與 NYSE 休市日；台股只跳過週末（台股休市日每年由證交所公告、不固定，畫面會提示）。
 */
export function nextTradingDays(lastDate: string, count: number, market: "US" | "TW"): string[] {
  const out: string[] = [];
  let d = lastDate;
  while (out.length < count) {
    d = addDays(d, 1);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (market === "US" && NYSE_HOLIDAYS.has(d)) continue;
    out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 歷史準確度：和「明天價格 = 今天價格」比較
// ---------------------------------------------------------------------------

export interface AccuracyStats {
  horizon: number;
  samples: number;
  /** 平均絕對百分比誤差（%） */
  trendMape: number;
  naiveMape: number;
  /** 趨勢外推誤差比 naive 小的比例（%） */
  winRate: number;
  /** 趨勢外推猜對漲跌方向的比例（%）；naive 預測「不變」，沒有方向 */
  directionHit: number;
}

/**
 * 走動式回測：對過去 testDays 個時間點，每次只用「當時以前」的資料做外推，
 * 再和 horizon 天後的實際價格比較。
 */
export function backtestAccuracy(closes: number[], lookback: number, horizon: number, testDays = 250): AccuracyStats | null {
  const lastT = closes.length - 1 - horizon; // 最後一個「有答案可以對」的時間點
  const firstT = Math.max(lookback - 1, lastT - testDays + 1);
  if (lastT < firstT) return null;
  let tErr = 0;
  let nErr = 0;
  let wins = 0;
  let dirHit = 0;
  let dirN = 0;
  let n = 0;
  for (let t = firstT; t <= lastT; t++) {
    const today = closes[t];
    const actual = closes[t + horizon];
    const pred = extrapolate(closes.slice(0, t + 1), lookback, horizon)[horizon - 1];
    const te = Math.abs(pred - actual) / actual;
    const ne = Math.abs(today - actual) / actual;
    tErr += te;
    nErr += ne;
    if (te < ne) wins++;
    if (actual !== today && pred !== today) {
      dirN++;
      if (Math.sign(pred - today) === Math.sign(actual - today)) dirHit++;
    }
    n++;
  }
  return {
    horizon,
    samples: n,
    trendMape: (tErr / n) * 100,
    naiveMape: (nErr / n) * 100,
    winRate: (wins / n) * 100,
    directionHit: dirN ? (dirHit / dirN) * 100 : NaN,
  };
}
