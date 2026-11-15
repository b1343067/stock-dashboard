// 投資組合在 localStorage 的讀取（投資組合頁和組合分析頁共用）
// ⚠️ 持股只存在使用者的瀏覽器，不可寫進程式碼或儲存庫。

import { DEFAULT_SETTINGS, sampleHoldings, sanitizeHoldings, sanitizeSettings, type Holding, type PortfolioSettings } from "./portfolio";
import { readStorage } from "./storage";

export const KEY_HOLDINGS = "portfolio:holdings";
export const KEY_SETTINGS = "portfolio:settings";
export const KEY_SAMPLE = "portfolio:isSample";

/**
 * 第一次打開（localStorage 沒有任何持股紀錄）→ 範例持股（修正 #6）
 * 之後就讀使用者自己存的。
 */
export function loadHoldings(): { holdings: Holding[]; isSample: boolean } {
  const raw = readStorage<unknown>(KEY_HOLDINGS, null);
  if (raw === null) return { holdings: sampleHoldings(), isSample: true };
  return { holdings: sanitizeHoldings(raw)[0], isSample: readStorage<boolean>(KEY_SAMPLE, false) === true };
}

export function loadSettings(): PortfolioSettings {
  return sanitizeSettings(readStorage<unknown>(KEY_SETTINGS, DEFAULT_SETTINGS));
}
