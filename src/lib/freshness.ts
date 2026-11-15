// 資料新鮮度檢查：如果 GitHub Actions 連續好幾天抓不到資料，
// 網站會默默顯示舊價格，所以在這裡算出「落後幾個交易日」，太久就在頁首提醒。

/** 把 "YYYY-MM-DD" 轉成 UTC 午夜的時間戳 */
function utcDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * 計算 lastDate 之後、today 之前，中間有幾個平日（週一到週五）。
 * 例如最新資料是週五，今天是下週三 → 中間有週一、週二 → 2。
 * 國定假日不扣除，所以門檻要留一點寬鬆。
 */
export function missedWeekdays(lastDate: string, today: string): number {
  const DAY = 86_400_000;
  let count = 0;
  for (let t = utcDay(lastDate) + DAY; t < utcDay(today); t += DAY) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/** 落後 3 個平日以上視為過期（容許一兩天的國定假日） */
export const STALE_THRESHOLD = 3;

export interface Freshness {
  latestDate: string;
  missed: number;
  stale: boolean;
}

/**
 * @param dates  每檔股票的最新資料日期
 * @param now    現在時間（測試時可以傳固定值）
 */
export function checkFreshness(dates: string[], now: Date = new Date()): Freshness | null {
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (valid.length === 0) return null;
  const latestDate = valid[valid.length - 1];
  const today = now.toISOString().slice(0, 10); // 用 UTC 日期，和美股收盤日一致
  const missed = missedWeekdays(latestDate, today);
  return { latestDate, missed, stale: missed >= STALE_THRESHOLD };
}
