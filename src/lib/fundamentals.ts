// 基本面卡片用的小工具（純函式，測試在 fundamentals.test.ts）

/** 收盤價在 52 週區間的位置：0 = 在最低點、1 = 在最高點；資料不足回傳 null */
export function rangePosition(close: number, low: number | null, high: number | null): number | null {
  if (low === null || high === null || !Number.isFinite(close) || high <= low) return null;
  return Math.min(1, Math.max(0, (close - low) / (high - low)));
}

/** 距離某個價位幾 %（例如距 52 週高點 -12.3%） */
export function pctFrom(close: number, ref: number | null): number | null {
  if (ref === null || !(ref > 0) || !Number.isFinite(close)) return null;
  return (close / ref - 1) * 100;
}

/** 市值用中文單位：1.2 兆、3,456 億；太小的用「萬」 */
export function fmtBigMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)} 兆`;
  if (v >= 1e8) return `${Math.round(v / 1e8).toLocaleString("zh-TW")} 億`;
  return `${Math.round(v / 1e4).toLocaleString("zh-TW")} 萬`;
}

/**
 * 本益比的白話說明。門檻只是粗略參考（不同產業差很多），所以文字刻意保守。
 */
export function peComment(pe: number | null): string {
  if (pe === null) return "沒有本益比（ETF 或虧損中）";
  if (pe < 10) return "偏低：股價相對獲利便宜，也可能是市場不看好";
  if (pe < 20) return "中等";
  if (pe < 35) return "偏高：市場預期未來會成長";
  return "很高：股價包含很多成長預期";
}
