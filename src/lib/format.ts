// 數字格式化：金額、百分比、帶正負號

const SYMBOL: Record<string, string> = { USD: "US$", TWD: "NT$" };

/** 金額，例如 fmtMoney(1234.5, "USD") → "US$1,234.50"；台幣預設不顯示小數 */
export function fmtMoney(v: number | null | undefined, currency: string, digits?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const d = digits ?? (currency === "TWD" ? 0 : 2);
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${v < 0 ? "-" : ""}${SYMBOL[currency] ?? ""}${s}`;
}

/** 帶正負號的金額，例如 "+US$12.30" */
export function fmtSignedMoney(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return (v > 0 ? "+" : "") + fmtMoney(v, currency);
}

/** 百分比，signed = true 時正數加 "+" */
export function fmtPct(v: number | null | undefined, digits = 2, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${signed && v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

/** 一般數字（股數、價格） */
export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** 依紅漲綠跌設定，回傳漲跌的 CSS class */
export function pnlClass(v: number | null | undefined, redUp: boolean): string {
  if (!v) return "";
  return v > 0 === redUp ? "num-red" : "num-green";
}
