// 交易紀錄制投資組合（加碼 C）：純函式，測試在 transactions.test.ts
//
// 為什麼要有交易紀錄？只記「持股＋平均成本」的話，賣掉的部分賺多少（已實現損益）、
// 領了多少股利、真正的年化報酬（考慮每筆錢投入的時間）都算不出來。
//
// 成本算法：移動平均成本法（台灣券商 App 常用）
//   買進：總成本 += 股數 × 價格 + 手續費；平均成本 = 總成本 ÷ 持有股數
//   賣出：已實現損益 = 股數 × 價格 − 手續費／稅 − 股數 × 平均成本；平均成本不變
//   股利：記在「股利」，不影響成本（實領金額，已扣稅）
//
// ⚠️ 交易紀錄和持股一樣只存在使用者的瀏覽器，不可寫進程式碼或儲存庫。

import { guessCurrency, type Holding } from "./portfolio";

export type TxType = "buy" | "sell" | "dividend";

export interface Transaction {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  symbol: string;
  type: TxType;
  /** 買賣股數（股利不用，為 0） */
  shares: number;
  /** 每股成交價（原幣；股利不用） */
  price: number;
  /** 手續費＋交易稅（原幣） */
  fee: number;
  /** 股利實領金額（原幣；買賣不用） */
  amount: number;
}

export const TX_LABEL: Record<TxType, string> = { buy: "買進", sell: "賣出", dividend: "股利" };

export interface Position {
  symbol: string;
  currency: string;
  /** 目前持有股數 */
  shares: number;
  /** 目前持股的總成本（含手續費，原幣） */
  costBasis: number;
  /** 平均成本（每股）；沒有持股時為 0 */
  avgCost: number;
  /** 已實現損益（原幣） */
  realized: number;
  /** 領到的股利合計（原幣） */
  dividends: number;
  /** 付出的手續費＋稅合計（原幣，已含在成本與已實現損益裡，這裡只是給人看） */
  fees: number;
  /** 投入的本金合計（所有買進金額＋手續費） */
  invested: number;
  firstDate: string;
}

export interface LedgerResult {
  positions: Position[];
  /** 給使用者看的警告，例如「賣出股數超過持有」 */
  warnings: string[];
}

/** 浮點數誤差：0.1 + 0.2 這類小誤差視為 0 */
const EPS = 1e-9;

/** 依日期排序（同一天保留輸入順序），買進排在賣出前面，避免同一天先買後賣被當成超賣 */
export function sortTransactions(txs: Transaction[]): Transaction[] {
  const order: Record<TxType, number> = { buy: 0, dividend: 1, sell: 2 };
  return txs
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : order[a.t.type] - order[b.t.type] || a.i - b.i))
    .map((x) => x.t);
}

/** 把所有交易依序套用，算出每檔股票目前的部位 */
export function buildLedger(txs: Transaction[], currencyOf: (s: string) => string = guessCurrency): LedgerResult {
  const map = new Map<string, Position>();
  const warnings: string[] = [];
  for (const t of sortTransactions(txs)) {
    let p = map.get(t.symbol);
    if (!p) {
      p = { symbol: t.symbol, currency: currencyOf(t.symbol), shares: 0, costBasis: 0, avgCost: 0, realized: 0, dividends: 0, fees: 0, invested: 0, firstDate: t.date };
      map.set(t.symbol, p);
    }
    if (t.type === "buy") {
      const cost = t.shares * t.price + t.fee;
      p.shares += t.shares;
      p.costBasis += cost;
      p.invested += cost;
      p.fees += t.fee;
    } else if (t.type === "sell") {
      let n = t.shares;
      if (n > p.shares + EPS) {
        warnings.push(`${t.date} ${t.symbol} 賣出 ${t.shares} 股，但當時只持有 ${round(p.shares)} 股（以持有股數計算）`);
        n = p.shares;
      }
      if (n <= EPS) continue;
      const avg = p.shares > 0 ? p.costBasis / p.shares : 0;
      // 只賣掉一部分時，手續費依比例分攤（超賣的部分不算）
      const fee = t.fee * (n / t.shares);
      p.realized += n * t.price - fee - n * avg;
      p.costBasis -= n * avg;
      p.shares -= n;
      p.fees += fee;
      if (p.shares < EPS) {
        p.shares = 0;
        p.costBasis = 0; // 全部賣光，清掉殘留的浮點誤差
      }
    } else {
      p.dividends += t.amount;
    }
    p.avgCost = p.shares > 0 ? p.costBasis / p.shares : 0;
  }
  return { positions: [...map.values()], warnings };
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * 交易紀錄 → 持股清單（給原本的投資組合計算、組合分析頁用）。
 * 持股類型（核心／短線）和停利停損沿用「同代號的舊持股設定」，沒有就當核心。
 */
export function positionsToHoldings(positions: Position[], meta: Holding[] = []): Holding[] {
  return positions
    .filter((p) => p.shares > EPS)
    .map((p) => {
      const m = meta.find((h) => h.symbol === p.symbol);
      return {
        id: m?.id ?? `pos-${p.symbol}`, // 固定的 id：每次重算都一樣，編輯時才找得到
        symbol: p.symbol,
        shares: round(p.shares),
        cost: round(p.avgCost),
        type: m?.type ?? "core",
        tpPct: m?.tpPct ?? null,
        slPct: m?.slPct ?? null,
      };
    });
}

// ---------------------------------------------------------------------------
// XIRR：考慮「每筆錢投入多久」的年化報酬
// ---------------------------------------------------------------------------

export interface CashFlow {
  date: string;
  /** 投入為負、拿回來為正 */
  amount: number;
}

const DAY = 86_400_000;
const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY / 365;

/**
 * 找出年化報酬率 r，讓所有現金流折現到第一天的總和 = 0：
 *   Σ amount_i ÷ (1 + r)^(距第一天的年數_i) = 0
 * 先用牛頓法（快），失敗再用二分法（一定會收斂）。
 * 現金流全部同號（只有投入沒有回收）或期間太短（< 1 天）→ null。
 */
export function xirr(flows: CashFlow[]): number | null {
  const fs = flows.filter((f) => Number.isFinite(f.amount) && f.amount !== 0 && !Number.isNaN(Date.parse(f.date)));
  if (fs.length < 2) return null;
  if (!fs.some((f) => f.amount > 0) || !fs.some((f) => f.amount < 0)) return null;
  const t0 = fs.reduce((m, f) => (f.date < m ? f.date : m), fs[0].date);
  const ts = fs.map((f) => yearsBetween(t0, f.date));
  if (Math.max(...ts) < 1 / 365) return null;
  const npv = (r: number) => fs.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, ts[i]), 0);
  const dnpv = (r: number) => fs.reduce((s, f, i) => s - (ts[i] * f.amount) / Math.pow(1 + r, ts[i] + 1), 0);

  let r = 0.1;
  for (let k = 0; k < 50; k++) {
    const v = npv(r);
    const d = dnpv(r);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  // 二分法：在 -99.99% ～ 1,000,000% 之間找符號改變的地方
  let lo = -0.9999;
  let hi = 10_000;
  let flo = npv(lo);
  if (!Number.isFinite(flo) || flo * npv(hi) > 0) return null;
  for (let k = 0; k < 300; k++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-12) return mid;
    if (fm * flo < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/**
 * 某些交易的現金流（原幣）：買進 −(股數×價格＋費用)、賣出 +(股數×價格−費用)、股利 +金額，
 * 最後加上「今天把剩下的股票照現價賣掉」的市值（endValue，在 endDate）。
 */
export function cashFlows(txs: Transaction[], endValue: number, endDate: string): CashFlow[] {
  const out: CashFlow[] = txs.map((t) => ({
    date: t.date,
    amount: t.type === "buy" ? -(t.shares * t.price + t.fee) : t.type === "sell" ? t.shares * t.price - t.fee : t.amount,
  }));
  if (endValue > 0) out.push({ date: endDate, amount: endValue });
  return out;
}

// ---------------------------------------------------------------------------
// 每檔與整體的報酬摘要
// ---------------------------------------------------------------------------

export interface PositionStats extends Position {
  price: number | null;
  marketValue: number | null;
  unrealized: number | null;
  /** 總損益 = 已實現 + 未實現 + 股利 */
  totalPnl: number | null;
  /** 總損益 ÷ 投入本金 */
  totalReturnPct: number | null;
  xirr: number | null;
}

/** 每檔股票的完整報酬（原幣）。prices：代號 → 最新收盤 */
export function positionStats(txs: Transaction[], ledger: LedgerResult, prices: Record<string, number>, endDate: string): PositionStats[] {
  return ledger.positions.map((p) => {
    const price = prices[p.symbol] ?? null;
    const marketValue = price === null ? (p.shares > EPS ? null : 0) : p.shares * price;
    const unrealized = marketValue === null ? null : marketValue - p.costBasis;
    const totalPnl = unrealized === null ? null : p.realized + unrealized + p.dividends;
    const flows = marketValue === null ? null : cashFlows(txs.filter((t) => t.symbol === p.symbol), marketValue, endDate);
    return {
      ...p,
      price,
      marketValue,
      unrealized,
      totalPnl,
      totalReturnPct: totalPnl === null || p.invested <= 0 ? null : (totalPnl / p.invested) * 100,
      xirr: flows ? xirr(flows) : null,
    };
  });
}

/** 匯率查表：某天的 USD/TWD（找那天或之前最近的一天；沒有歷史就用最新匯率） */
export function fxAt(history: { time: string[]; close: number[] } | null | undefined, date: string, latest: number | undefined): number | null {
  if (history && history.time.length) {
    let lo = 0;
    let hi = history.time.length - 1;
    if (date < history.time[0]) return history.close[0];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (history.time[mid] <= date) lo = mid;
      else hi = mid - 1;
    }
    return history.close[lo];
  }
  return latest && latest > 0 ? latest : null;
}

export interface TxTotals {
  /** 以下美元 */
  realizedUsd: number;
  dividendsUsd: number;
  unrealizedUsd: number;
  totalPnlUsd: number;
  investedUsd: number;
  /** 整體 XIRR（美元現金流；台股每筆依當天匯率換算） */
  xirr: number | null;
  /** 沒有報價、沒算進總計的代號 */
  missing: string[];
}

/**
 * 整體摘要（美元）。台股每筆現金流依「交易當天」的匯率換算，
 * 已實現、股利也依當天匯率；未實現與市值用最新匯率。
 */
export function totals(
  txs: Transaction[],
  stats: PositionStats[],
  fxHistory: { time: string[]; close: number[] } | null | undefined,
  latestFx: number | undefined,
  endDate: string,
): TxTotals {
  const usd = (amount: number, currency: string, date: string): number | null => {
    if (currency === "USD") return amount;
    if (currency !== "TWD") return null;
    const rate = date === endDate ? (latestFx ?? fxAt(fxHistory, date, latestFx)) : fxAt(fxHistory, date, latestFx);
    return rate ? amount / rate : null;
  };
  const missing = stats.filter((s) => s.marketValue === null).map((s) => s.symbol);
  const ok = new Set(stats.filter((s) => s.marketValue !== null).map((s) => s.symbol));
  const cur = new Map(stats.map((s) => [s.symbol, s.currency]));
  let realizedUsd = 0;
  let dividendsUsd = 0;
  let investedUsd = 0;
  const flows: CashFlow[] = [];

  // 已實現損益要依「每筆賣出當天」換算，所以重新走一次帳（每次賣出的損益）
  const perSell = realizedBySale(txs);
  for (const t of txs) {
    if (!ok.has(t.symbol)) continue;
    const c = cur.get(t.symbol) ?? guessCurrency(t.symbol);
    const [f] = cashFlows([t], 0, endDate);
    const fu = usd(f.amount, c, t.date);
    if (fu === null) continue;
    flows.push({ date: t.date, amount: fu });
    if (t.type === "buy") investedUsd += -fu;
    if (t.type === "dividend") dividendsUsd += fu;
    if (t.type === "sell") realizedUsd += usd(perSell.get(t.id) ?? 0, c, t.date) ?? 0;
  }
  let unrealizedUsd = 0;
  let valueUsd = 0;
  for (const s of stats) {
    if (s.marketValue === null) continue;
    valueUsd += usd(s.marketValue, s.currency, endDate) ?? 0;
    unrealizedUsd += usd(s.unrealized ?? 0, s.currency, endDate) ?? 0;
  }
  if (valueUsd > 0) flows.push({ date: endDate, amount: valueUsd });
  return {
    realizedUsd,
    dividendsUsd,
    unrealizedUsd,
    totalPnlUsd: realizedUsd + dividendsUsd + unrealizedUsd,
    investedUsd,
    xirr: xirr(flows),
    missing,
  };
}

/** 每一筆賣出各自的已實現損益（原幣），key = 交易 id */
export function realizedBySale(txs: Transaction[]): Map<string, number> {
  const out = new Map<string, number>();
  const bySymbol = new Map<string, Transaction[]>();
  for (const t of txs) bySymbol.set(t.symbol, [...(bySymbol.get(t.symbol) ?? []), t]);
  for (const list of bySymbol.values()) {
    const sorted = sortTransactions(list);
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      if (t.type !== "sell") continue;
      // 算到這筆之前與之後的已實現差額，就是這筆的損益
      const before = buildLedger(sorted.slice(0, i)).positions[0]?.realized ?? 0;
      const after = buildLedger(sorted.slice(0, i + 1)).positions[0]?.realized ?? 0;
      out.set(t.id, after - before);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 讀取驗證、範例
// ---------------------------------------------------------------------------

let counter = 0;
export function newTxId(): string {
  counter += 1;
  return `t${Date.now().toString(36)}${counter}`;
}

const nonNeg = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** 從 localStorage 或匯入檔讀回來時檢查格式，壞掉的丟掉。回傳 [有效, 丟掉幾筆] */
export function sanitizeTransactions(raw: unknown): [Transaction[], number] {
  if (!Array.isArray(raw)) return [[], 0];
  const out: Transaction[] = [];
  let dropped = 0;
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const symbol = typeof o.symbol === "string" ? o.symbol.trim().toUpperCase() : "";
    const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && !Number.isNaN(Date.parse(o.date)) ? o.date : null;
    const type: TxType | null = o.type === "buy" || o.type === "sell" || o.type === "dividend" ? o.type : null;
    const shares = nonNeg(o.shares) ?? 0;
    const price = nonNeg(o.price) ?? 0;
    const fee = nonNeg(o.fee) ?? 0;
    const amount = nonNeg(o.amount) ?? 0;
    const valid =
      symbol && symbol.length <= 20 && date && type && (type === "dividend" ? amount > 0 : shares > 0 && price > 0);
    if (!valid) {
      dropped++;
      continue;
    }
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : newTxId(),
      date: date!,
      symbol,
      type: type!,
      shares: type === "dividend" ? 0 : shares,
      price: type === "dividend" ? 0 : price,
      fee,
      amount: type === "dividend" ? amount : 0,
    });
  }
  return [out, dropped];
}

/** 從匯出檔讀交易紀錄與模式（檔案格式由 portfolio.ts 的 parseImport 先檢查過） */
export function parseTransactionsFile(text: string): { transactions: Transaction[]; dropped: number; mode: "holdings" | "transactions" | null } {
  try {
    const o = JSON.parse(text) as { transactions?: unknown; mode?: unknown };
    const [transactions, dropped] = sanitizeTransactions(o?.transactions);
    // 重新產生 id，避免和現有資料衝突
    const mode = o?.mode === "transactions" || o?.mode === "holdings" ? o.mode : null;
    return { transactions: transactions.map((t) => ({ ...t, id: newTxId() })), dropped, mode };
  } catch {
    return { transactions: [], dropped: 0, mode: null };
  }
}

/** 範例交易（明顯是隨意設定的數字，不是任何人的真實交易） */
export function sampleTransactions(): Transaction[] {
  const t = (date: string, symbol: string, type: TxType, shares: number, price: number, fee = 0, amount = 0): Transaction => ({
    id: newTxId(),
    date,
    symbol,
    type,
    shares,
    price,
    fee,
    amount,
  });
  return [
    t("2023-03-01", "VOO", "buy", 10, 360, 1),
    t("2024-01-15", "VOO", "buy", 5, 430, 1),
    t("2024-03-27", "VOO", "dividend", 0, 0, 0, 25),
    t("2023-06-01", "0050.TW", "buy", 1000, 120, 171),
    t("2024-07-18", "0050.TW", "dividend", 0, 0, 0, 3000),
    t("2023-09-01", "NVDA", "buy", 20, 48, 1),
    t("2024-06-10", "NVDA", "sell", 10, 120, 1),
  ];
}
