// 價格提醒的判斷邏輯（純函式，測試在 alerts.test.ts）
// 提醒只存在使用者的瀏覽器（localStorage），每次打開網站時拿最新資料檢查一次。
// 網站是靜態的、沒有後端，所以沒辦法在你沒打開網站時推播通知。

export type AlertKind = "priceAbove" | "priceBelow" | "changeUp" | "changeDown" | "rsiAbove" | "rsiBelow";

export interface PriceAlert {
  id: string;
  symbol: string;
  kind: AlertKind;
  value: number;
  /** true = 每個新的交易日只要條件成立就再提醒；false = 提醒一次後停用 */
  repeat: boolean;
  createdAt: string;
  /** 使用者按「知道了」時的資料日期（同一天不再重複提醒） */
  ackDate: string | null;
  /** 只提醒一次的提醒，被確認後停用 */
  disabled: boolean;
}

export const KIND_META: Record<AlertKind, { label: string; unit: string; needsRsi: boolean }> = {
  priceAbove: { label: "收盤價漲到", unit: "以上", needsRsi: false },
  priceBelow: { label: "收盤價跌到", unit: "以下", needsRsi: false },
  changeUp: { label: "單日漲幅達", unit: "% 以上", needsRsi: false },
  changeDown: { label: "單日跌幅達", unit: "% 以上", needsRsi: false },
  rsiAbove: { label: "RSI 高於", unit: "", needsRsi: true },
  rsiBelow: { label: "RSI 低於", unit: "", needsRsi: true },
};
export const KIND_ORDER = Object.keys(KIND_META) as AlertKind[];

/** 檢查提醒時需要的最新數值 */
export interface Quote {
  close: number;
  changePct: number;
  /** 最新日線 RSI；沒有載入時為 undefined */
  rsi?: number | null;
  date: string;
}

export interface AlertResult {
  /** 條件是否成立 */
  met: boolean;
  /** 目前的數值（顯示用） */
  current: number | null;
}

export function evaluateAlert(a: PriceAlert, q: Quote | undefined): AlertResult {
  if (!q) return { met: false, current: null };
  switch (a.kind) {
    case "priceAbove":
      return { met: q.close >= a.value, current: q.close };
    case "priceBelow":
      return { met: q.close <= a.value, current: q.close };
    case "changeUp":
      return { met: q.changePct >= a.value, current: q.changePct };
    case "changeDown":
      // 使用者輸入的是「跌幅 3%」，跌 3% 以上 = changePct ≤ -3
      return { met: q.changePct <= -Math.abs(a.value), current: q.changePct };
    case "rsiAbove":
    case "rsiBelow": {
      const r = q.rsi;
      if (r === undefined || r === null) return { met: false, current: null };
      return { met: a.kind === "rsiAbove" ? r >= a.value : r <= a.value, current: r };
    }
  }
}

/** 白話描述，例如「TSLA 收盤價漲到 400 以上」 */
export function describeAlert(a: PriceAlert): string {
  const m = KIND_META[a.kind];
  const v = a.kind.startsWith("change") ? Math.abs(a.value) : a.value;
  return `${a.symbol} ${m.label} ${v}${m.unit ? ` ${m.unit}`.replace(" %", "%") : ""}`;
}

export type AlertState = "triggered" | "watching" | "acknowledged" | "disabled" | "noData";

/**
 * 提醒目前的狀態：
 *   triggered    條件成立、而且這個資料日還沒按「知道了」→ 要通知
 *   acknowledged 條件成立，但這個資料日已經確認過
 *   watching     條件還沒成立
 *   disabled     只提醒一次的提醒已經確認過，停用了
 *   noData       沒有這檔股票的資料（例如已從觀察清單刪除）
 */
export function alertState(a: PriceAlert, q: Quote | undefined): AlertState {
  if (a.disabled) return "disabled";
  if (!q) return "noData";
  const { met, current } = evaluateAlert(a, q);
  if (current === null) return "noData";
  if (!met) return "watching";
  return a.ackDate === q.date ? "acknowledged" : "triggered";
}

/** 按「知道了」：記下資料日；只提醒一次的就停用 */
export function acknowledge(alerts: PriceAlert[], ids: string[], dateBySymbol: Record<string, string>): PriceAlert[] {
  return alerts.map((a) =>
    ids.includes(a.id) ? { ...a, ackDate: dateBySymbol[a.symbol] ?? a.ackDate, disabled: !a.repeat } : a,
  );
}

let counter = 0;
export function newAlert(symbol: string, kind: AlertKind, value: number, repeat = false, now = new Date()): PriceAlert {
  counter += 1;
  return {
    id: `a${now.getTime().toString(36)}${counter}`,
    symbol: symbol.trim().toUpperCase(),
    kind,
    value,
    repeat,
    createdAt: now.toISOString(),
    ackDate: null,
    disabled: false,
  };
}

/** 從 localStorage 讀回來時檢查格式，壞掉的丟掉 */
export function sanitizeAlerts(raw: unknown): PriceAlert[] {
  if (!Array.isArray(raw)) return [];
  const out: PriceAlert[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Partial<PriceAlert>;
    if (typeof o.symbol !== "string" || !o.symbol.trim()) continue;
    if (!o.kind || !(o.kind in KIND_META)) continue;
    if (typeof o.value !== "number" || !Number.isFinite(o.value)) continue;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : newAlert(o.symbol, o.kind, o.value).id,
      symbol: o.symbol.trim().toUpperCase(),
      kind: o.kind,
      value: o.value,
      repeat: o.repeat === true,
      createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date(0).toISOString(),
      ackDate: typeof o.ackDate === "string" ? o.ackDate : null,
      disabled: o.disabled === true,
    });
  }
  return out;
}

/** 是否需要載入 RSI 資料（有 RSI 提醒、而且沒停用） */
export function needsRsi(alerts: PriceAlert[]): boolean {
  return alerts.some((a) => !a.disabled && KIND_META[a.kind].needsRsi);
}
