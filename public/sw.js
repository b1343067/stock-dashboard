// Service Worker：讓網站可以「加到手機主畫面」，而且沒網路時也能看上次的資料。
// 不用任何套件，三種快取策略：
//   1. 網頁本身、股價資料（/data/*.json）、AI 報告（/ai/*.json）→「網路優先」：有網路就拿最新的並存一份；沒網路才用存起來的
//      （資料每天更新，不能讓使用者一直看到舊的）
//   2. 打包後的程式與字型（/assets/，檔名含雜湊值，內容不會變）→「快取優先」：下載過就直接用
//   3. 其他（圖示、manifest）→ 先用快取、背景再更新
// 這個檔案本身不能被長時間快取（vercel.json 設定 no-cache），改版後瀏覽器才會拿到新版。

const PAGES = "pages-v3";
const DATA = "data-v3";
const ASSETS = "assets-v3";
const MAX_ASSETS = 80; // 舊版本的程式檔會累積，超過就刪最舊的

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  const keep = [PAGES, DATA, ASSETS];
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !keep.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(fallbackKey ?? request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(fallbackKey ?? request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    const keys = await cache.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(k);
  }
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached ?? fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部網址不處理
  // 即時報價、新聞（Vercel 函式）一律直接走網路、不快取：快取了就不是即時的了。
  // 離線時請求會失敗，今日總覽會退回顯示收盤資料。
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    // 單頁網站：所有頁面都是同一個 index.html（用 "/" 當作存放的鑰匙）
    event.respondWith(networkFirst(req, PAGES, "/"));
  } else if (url.pathname.startsWith("/data/") || url.pathname.startsWith("/ai/")) {
    // AI 報告每天更新，和股價資料一樣要網路優先；去掉查詢參數，同一個檔案只存一份
    event.respondWith(networkFirst(req, DATA, url.origin + url.pathname));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(req));
  }
});
