// 觀察清單的分組與搜尋（純函式，測試在 watchlist.test.ts）

export const UNCATEGORIZED = "其他";

export interface Groupable {
  symbol: string;
  name: string;
  category?: string;
}

export interface Group<T> {
  name: string;
  items: T[];
}

/**
 * 搜尋比對：代號或名稱包含關鍵字就算符合（不分大小寫、忽略前後空白）。
 * 例如「nv」找到 NVDA、「台積」找到 2330.TW 和 TSM（台積電 ADR）。
 */
export function matchesQuery(t: Groupable, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
}

/**
 * 依分類分組，分類順序照設定檔（categories）；
 * 設定檔沒列到的分類（或沒有分類的舊資料）放在最後的「其他」。
 * 有搜尋關鍵字時只留符合的股票，沒有股票的分類不顯示。
 */
export function groupTickers<T extends Groupable>(items: T[], categories: string[] = [], query = ""): Group<T>[] {
  const order = [...categories];
  const map = new Map<string, T[]>();
  for (const t of items) {
    if (!matchesQuery(t, query)) continue;
    const cat = t.category || UNCATEGORIZED;
    if (!order.includes(cat)) order.push(cat);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(t);
  }
  return order.filter((c) => map.has(c)).map((c) => ({ name: c, items: map.get(c)! }));
}

/** 依分類篩選（"all" = 全部） */
export function filterByCategory<T extends Groupable>(items: T[], category: string): T[] {
  if (category === "all") return items;
  return items.filter((t) => (t.category || UNCATEGORIZED) === category);
}
