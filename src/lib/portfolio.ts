// 投資組合的核心計算（第三階段）
// 這個檔案只有「純函式」：輸入持股、價格、匯率，輸出損益與提醒。
// 不碰畫面、不碰 localStorage，測試在 portfolio.test.ts。
//
// 幣別規則（修正 #3）：
//   - 每檔持股的「成本」「現價」都用該股票自己的幣別（台股 = 台幣，美股 = 美元）
//   - 加總市值、算比例之前，一律先用匯率換成美元，不能直接把台幣和美元相加

// ---------------------------------------------------------------------------
// 型別
// ---------------------------------------------------------------------------

export type HoldingType = "core" | "short";

export interface Holding {
  id: string;
  symbol: string;
  shares: number;
  /** 平均成本（每股，原幣） */
  cost: number;
  type: HoldingType;
  /** 自訂停利 %（只有短線用；null = 用預設值） */
  tpPct: number | null;
  /** 自訂停損 %（只有短線用；null = 用預設值） */
  slPct: number | null;
}

export interface PortfolioSettings {
  /** 短線部位佔總市值的上限 % */
  shortCapPct: number;
  /** 預設停利 % */
  defaultTpPct: number;
  /** 預設停損 % */
  defaultSlPct: number;
  /** 距離停利／停損多少 % 以內要提醒 */
  alertPct: number;
  /** 總計用哪個幣別顯示 */
  displayCurrency: "USD" | "TWD";
}

export const DEFAULT_SETTINGS: PortfolioSettings = {
  shortCapPct: 30,
  defaultTpPct: 20,
  defaultSlPct: 20,
  alertPct: 5,
  displayCurrency: "USD",
};

/** 一檔股票的報價資訊（來自 index.json） */
export interface Quote {
  price: number;
  currency: string;
  name: string;
  date: string;
}

/** 停利停損狀態 */
export type StopStatus = "none" | "normal" | "tp-near" | "tp-hit" | "sl-near" | "sl-hit";

export interface HoldingRow {
  holding: Holding;
  quote: Quote | null; // null = 不在觀察清單，沒有報價
  currency: string;
  /** 以下原幣 */
  marketValue: number | null;
  costBasis: number;
  pnl: number | null;
  returnPct: number | null;
  /** 以下美元 */
  marketValueUsd: number | null;
  costBasisUsd: number;
  pnlUsd: number | null;
  /** 佔總市值比重 %（美元計） */
  weightPct: number | null;
  /** 短線才有 */
  tpPrice: number | null;
  slPrice: number | null;
  tpPctUsed: number | null;
  slPctUsed: number | null;
  /** 現價距離停利／停損還有幾 %（以現價為基準） */
  toTpPct: number | null;
  toSlPct: number | null;
  status: StopStatus;
}

export interface PortfolioSummary {
  rows: HoldingRow[];
  /** 以下都是美元 */
  totalValueUsd: number;
  totalCostUsd: number;
  totalPnlUsd: number;
  totalReturnPct: number | null;
  coreValueUsd: number;
  shortValueUsd: number;
  /** 短線佔比 %（沒有持股時為 null） */
  shortPct: number | null;
  shortOverCap: boolean;
  /** 沒有報價、沒算進總計的檔數 */
  missingQuotes: number;
  /** 需要注意的短線部位數（接近或已觸及停利停損） */
  alertCount: number;
  /** 有台股但沒有匯率時為 true（台股會被排除在總計外） */
  missingFx: boolean;
}

// ---------------------------------------------------------------------------
// 換匯
// ---------------------------------------------------------------------------

/**
 * 把某幣別的金額換成美元。
 * fx.USDTWD = 1 美元可換幾台幣，所以 台幣 → 美元 要「除以」匯率。
 * 不認得的幣別或沒有匯率時回傳 null（不要亂算）。
 */
export function toUsd(amount: number, currency: string, fx: Record<string, number>): number | null {
  if (currency === "USD") return amount;
  if (currency === "TWD") {
    const rate = fx.USDTWD;
    return rate && rate > 0 ? amount / rate : null;
  }
  return null;
}

/** 美元 → 顯示幣別 */
export function fromUsd(amountUsd: number, currency: "USD" | "TWD", fx: Record<string, number>): number | null {
  if (currency === "USD") return amountUsd;
  const rate = fx.USDTWD;
  return rate && rate > 0 ? amountUsd * rate : null;
}

// ---------------------------------------------------------------------------
// 停利停損
// ---------------------------------------------------------------------------

/**
 * 判斷短線部位的停利停損狀態。
 *   停利價 = 成本 × (1 + 停利%)
 *   停損價 = 成本 × (1 − 停損%)
 *   距離 = |目標價 − 現價| ÷ 現價
 * 現價已經超過停利價 → tp-hit；距離在 alertPct 以內 → tp-near（停損同理）。
 */
export function stopStatus(price: number, tpPrice: number, slPrice: number, alertPct: number): StopStatus {
  if (price >= tpPrice) return "tp-hit";
  if (price <= slPrice) return "sl-hit";
  const toTp = ((tpPrice - price) / price) * 100;
  const toSl = ((price - slPrice) / price) * 100;
  // 兩邊都接近時（停利停損設很窄），提醒比較近的那一邊
  if (toTp <= alertPct && toTp <= toSl) return "tp-near";
  if (toSl <= alertPct) return "sl-near";
  if (toTp <= alertPct) return "tp-near";
  return "normal";
}

// ---------------------------------------------------------------------------
// 主計算
// ---------------------------------------------------------------------------

export function computePortfolio(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  fx: Record<string, number>,
  settings: PortfolioSettings,
): PortfolioSummary {
  const rows: HoldingRow[] = holdings.map((h) => {
    const quote = quotes[h.symbol] ?? null;
    const currency = quote?.currency ?? guessCurrency(h.symbol);
    const costBasis = h.shares * h.cost;
    const costBasisUsd = toUsd(costBasis, currency, fx) ?? 0;

    let marketValue: number | null = null;
    let pnl: number | null = null;
    let returnPct: number | null = null;
    let marketValueUsd: number | null = null;
    let pnlUsd: number | null = null;
    if (quote) {
      marketValue = h.shares * quote.price;
      pnl = marketValue - costBasis;
      returnPct = h.cost > 0 ? (quote.price / h.cost - 1) * 100 : null;
      marketValueUsd = toUsd(marketValue, currency, fx);
      pnlUsd = toUsd(pnl, currency, fx);
    }

    let tpPrice: number | null = null;
    let slPrice: number | null = null;
    let tpPctUsed: number | null = null;
    let slPctUsed: number | null = null;
    let toTpPct: number | null = null;
    let toSlPct: number | null = null;
    let status: StopStatus = "none";
    if (h.type === "short" && h.cost > 0) {
      tpPctUsed = h.tpPct ?? settings.defaultTpPct;
      slPctUsed = h.slPct ?? settings.defaultSlPct;
      tpPrice = h.cost * (1 + tpPctUsed / 100);
      slPrice = h.cost * (1 - slPctUsed / 100);
      if (quote) {
        toTpPct = ((tpPrice - quote.price) / quote.price) * 100;
        toSlPct = ((quote.price - slPrice) / quote.price) * 100;
        status = stopStatus(quote.price, tpPrice, slPrice, settings.alertPct);
      }
    }

    return {
      holding: h,
      quote,
      currency,
      marketValue,
      costBasis,
      pnl,
      returnPct,
      marketValueUsd,
      costBasisUsd,
      pnlUsd,
      weightPct: null, // 下面算完總市值再補
      tpPrice,
      slPrice,
      tpPctUsed,
      slPctUsed,
      toTpPct,
      toSlPct,
      status,
    };
  });

  // 只有「有報價、也換得成美元」的持股才算進總計
  const valued = rows.filter((r) => r.marketValueUsd !== null);
  const totalValueUsd = sum(valued.map((r) => r.marketValueUsd!));
  const totalCostUsd = sum(valued.map((r) => r.costBasisUsd));
  const totalPnlUsd = totalValueUsd - totalCostUsd;
  const coreValueUsd = sum(valued.filter((r) => r.holding.type === "core").map((r) => r.marketValueUsd!));
  const shortValueUsd = totalValueUsd - coreValueUsd;
  const shortPct = totalValueUsd > 0 ? (shortValueUsd / totalValueUsd) * 100 : null;

  for (const r of rows) {
    r.weightPct = r.marketValueUsd !== null && totalValueUsd > 0 ? (r.marketValueUsd / totalValueUsd) * 100 : null;
  }

  return {
    rows,
    totalValueUsd,
    totalCostUsd,
    totalPnlUsd,
    totalReturnPct: totalCostUsd > 0 ? (totalPnlUsd / totalCostUsd) * 100 : null,
    coreValueUsd,
    shortValueUsd,
    shortPct,
    shortOverCap: shortPct !== null && shortPct > settings.shortCapPct,
    missingQuotes: rows.filter((r) => r.quote === null).length,
    alertCount: rows.filter((r) => r.status !== "none" && r.status !== "normal").length,
    missingFx: rows.some((r) => r.quote !== null && r.marketValueUsd === null),
  };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** 沒有報價時，用代號猜幣別（.TW / .TWO 結尾 = 台股） */
export function guessCurrency(symbol: string): string {
  return /\.TWO?$/i.test(symbol) ? "TWD" : "USD";
}

// ---------------------------------------------------------------------------
// 讀取／匯入驗證
// ---------------------------------------------------------------------------

let idCounter = 0;
export function newHoldingId(): string {
  idCounter += 1;
  return `h${Date.now().toString(36)}${idCounter}`;
}

const posNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const pct = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1000 ? v : null;

/**
 * 檢查持股資料（從 localStorage 或匯入的檔案讀來的），格式錯誤的那筆就丟掉。
 * 回傳 [有效持股, 被丟掉的筆數]
 */
export function sanitizeHoldings(raw: unknown): [Holding[], number] {
  if (!Array.isArray(raw)) return [[], 0];
  const out: Holding[] = [];
  let dropped = 0;
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const symbol = typeof o.symbol === "string" ? o.symbol.trim().toUpperCase() : "";
    const shares = posNum(o.shares);
    const cost = posNum(o.cost);
    if (!symbol || symbol.length > 20 || shares === null || cost === null) {
      dropped++;
      continue;
    }
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : newHoldingId(),
      symbol,
      shares,
      cost,
      type: o.type === "short" ? "short" : "core",
      tpPct: pct(o.tpPct),
      // 停損不能 ≥ 100%（停損價會變成 0 或負數）
      slPct: (pct(o.slPct) ?? 100) < 100 ? (o.slPct as number) : null,
    });
  }
  return [out, dropped];
}

export function sanitizeSettings(raw: unknown): PortfolioSettings {
  const o = (raw ?? {}) as Partial<PortfolioSettings>;
  const inRange = (v: unknown, min: number, max: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : d;
  return {
    shortCapPct: inRange(o.shortCapPct, 0, 100, DEFAULT_SETTINGS.shortCapPct),
    defaultTpPct: inRange(o.defaultTpPct, 0.1, 999, DEFAULT_SETTINGS.defaultTpPct),
    defaultSlPct: inRange(o.defaultSlPct, 0.1, 99.9, DEFAULT_SETTINGS.defaultSlPct),
    alertPct: inRange(o.alertPct, 0, 50, DEFAULT_SETTINGS.alertPct),
    displayCurrency: o.displayCurrency === "TWD" ? "TWD" : "USD",
  };
}

// ---------------------------------------------------------------------------
// 匯出／匯入檔案格式
// ---------------------------------------------------------------------------

export const EXPORT_VERSION = 1;

export interface PortfolioFile {
  app: "stock-dashboard";
  version: number;
  exportedAt: string;
  holdings: Holding[];
  settings: PortfolioSettings;
}

export function buildExport(holdings: Holding[], settings: PortfolioSettings, now = new Date()): PortfolioFile {
  return { app: "stock-dashboard", version: EXPORT_VERSION, exportedAt: now.toISOString(), holdings, settings };
}

/** 解析匯入的檔案內容。格式不對會丟出中文錯誤訊息。 */
export function parseImport(text: string): { holdings: Holding[]; settings: PortfolioSettings; dropped: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("檔案不是有效的 JSON");
  }
  // 也接受「只有持股陣列」的簡單格式
  const obj = Array.isArray(data) ? { holdings: data } : (data as Partial<PortfolioFile>);
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.holdings)) {
    throw new Error("找不到持股資料（holdings）");
  }
  const [holdings, dropped] = sanitizeHoldings(obj.holdings);
  if (holdings.length === 0 && obj.holdings.length > 0) throw new Error("檔案裡的持股格式都不正確");
  // 重新產生 id，避免和現有資料衝突
  return {
    holdings: holdings.map((h) => ({ ...h, id: newHoldingId() })),
    settings: sanitizeSettings((obj as Partial<PortfolioFile>).settings),
    dropped,
  };
}

// ---------------------------------------------------------------------------
// 範例持股（修正 #6：預設持倉改成範例資料，不放任何真實持股）
// ---------------------------------------------------------------------------

/** 明顯是範例的數字，只是讓第一次打開的人看得到畫面長什麼樣子 */
export function sampleHoldings(): Holding[] {
  const h = (symbol: string, shares: number, cost: number, type: HoldingType, tpPct: number | null = null, slPct: number | null = null): Holding => ({
    id: newHoldingId(),
    symbol,
    shares,
    cost,
    type,
    tpPct,
    slPct,
  });
  return [
    h("VOO", 10, 500, "core"),
    h("MSFT", 5, 400, "core"),
    h("0050.TW", 1000, 80, "core"),
    h("NVDA", 20, 140, "short", 25, 15),
    h("TSLA", 5, 350, "short"),
    h("PLTR", 10, 180, "short"),
  ];
}
