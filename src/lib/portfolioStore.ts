// 投資組合在 localStorage 的讀取（投資組合頁和組合分析頁共用）
// ⚠️ 持股只存在使用者的瀏覽器，不可寫進程式碼或儲存庫。

import { DEFAULT_SETTINGS, sampleHoldings, sanitizeHoldings, sanitizeSettings, type Holding, type PortfolioSettings } from "./portfolio";
import { readStorage } from "./storage";
import { buildLedger, positionsToHoldings, sanitizeTransactions, type Transaction } from "./transactions";

export const KEY_HOLDINGS = "portfolio:holdings";
export const KEY_TX = "portfolio:transactions";
export const KEY_MODE = "portfolio:mode";

/** holdings = 直接輸入持股；transactions = 由交易紀錄計算持股（加碼 C） */
export type PortfolioMode = "holdings" | "transactions";

export function loadMode(): PortfolioMode {
  return readStorage<unknown>(KEY_MODE, "holdings") === "transactions" ? "transactions" : "holdings";
}

export function loadTransactions(): Transaction[] {
  return sanitizeTransactions(readStorage<unknown>(KEY_TX, []))[0];
}

/** 直接存的持股（交易紀錄模式下只用它的「類型、停利停損」設定） */
export function loadStoredHoldings(): { holdings: Holding[]; isSample: boolean } {
  const raw = readStorage<unknown>(KEY_HOLDINGS, null);
  if (raw === null) return { holdings: sampleHoldings(), isSample: true };
  return { holdings: sanitizeHoldings(raw)[0], isSample: readStorage<boolean>(KEY_SAMPLE, false) === true };
}
export const KEY_SETTINGS = "portfolio:settings";
export const KEY_SAMPLE = "portfolio:isSample";

/**
 * 目前生效的持股（組合分析頁用）：
 *   持股模式：第一次打開（沒有任何紀錄）→ 範例持股（修正 #6），之後讀使用者存的
 *   交易紀錄模式：由交易紀錄算出股數與平均成本
 */
export function loadHoldings(): { holdings: Holding[]; isSample: boolean } {
  const stored = loadStoredHoldings();
  if (loadMode() === "transactions") {
    const meta = stored.isSample ? [] : stored.holdings;
    return { holdings: positionsToHoldings(buildLedger(loadTransactions()).positions, meta), isSample: false };
  }
  return stored;
}

export function loadSettings(): PortfolioSettings {
  return sanitizeSettings(readStorage<unknown>(KEY_SETTINGS, DEFAULT_SETTINGS));
}
