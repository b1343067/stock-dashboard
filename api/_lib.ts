// Vercel 函式共用的小工具（檔名以 _ 開頭：Vercel 不會把它當成一個網址）
//
// 快取分兩層，避免超過 Finnhub 免費額度（每分鐘 60 次）：
//   1. 函式內的記憶體快取：同一台伺服器在幾十秒內重複查同一檔，不再打 Finnhub
//   2. Vercel CDN 快取（Cache-Control: s-maxage）：同一個網址在有效時間內直接由 CDN 回應，連函式都不會執行

/** 從環境變數讀金鑰（Vercel → Settings → Environment Variables 的 FINNHUB_API_KEY）。只在伺服器端執行 */
export function getKey(): string | null {
  const k = process.env.FINNHUB_API_KEY?.trim();
  return k ? k : null;
}

const store = new Map<string, { at: number; value: Promise<unknown> }>();

/** 記憶體快取：ttl 毫秒內同一個 key 直接用上次的結果（失敗的結果不快取，下次會重試） */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: now, value });
  value.catch(() => store.delete(key));
  // 避免記憶體無限成長：太多就清掉最舊的一半
  if (store.size > 500) for (const k of [...store.keys()].slice(0, 250)) store.delete(k);
  return value;
}

/** JSON 回應。cdnSeconds > 0 時讓 Vercel CDN 快取（瀏覽器本身不快取，才拿得到新資料） */
export function json(body: unknown, status = 200, cdnSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cdnSeconds > 0 ? `public, max-age=0, s-maxage=${cdnSeconds}, stale-while-revalidate=${cdnSeconds}` : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** 沒設定金鑰時的回應：網頁會退回顯示收盤資料 */
export const notConfigured = () => json({ error: "not-configured" }, 503);
