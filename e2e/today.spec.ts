// 今日總覽（首頁）：持股即時損益、訊號變化（含盤中預估）、新聞、財報
// 本機沒有 Vercel 函式與 Finnhub 金鑰，所以 /api 用 page.route 模擬；也測 /api 失敗時退回收盤資料。
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, trackErrors } from "./helpers";

const now = () => Math.floor(Date.now() / 1000);

/** 在瀏覽器裡放持股（持股只存在 localStorage）：NVDA 核心、TSLA 短線停損 20%（成本 1000 → 一定觸及） */
async function seedHoldings(page: Page) {
  await page.addInitScript(() => {
    const h = [
      { id: "a", symbol: "NVDA", shares: 10, cost: 100, type: "core", tpPct: null, slPct: null },
      { id: "b", symbol: "TSLA", shares: 2, cost: 1000, type: "short", tpPct: null, slPct: 20 },
      { id: "c", symbol: "2330.TW", shares: 1000, cost: 500, type: "core", tpPct: null, slPct: null },
    ];
    localStorage.setItem("stockdash:portfolio:holdings", JSON.stringify(h));
    localStorage.setItem("stockdash:portfolio:isSample", "false");
  });
}

async function mockApi(page: Page) {
  await page.route("**/api/quote**", (r) => {
    const syms = new URL(r.request().url()).searchParams.get("symbols")!.split(",");
    const quotes = Object.fromEntries(
      syms.map((s) => [s, { symbol: s, price: s === "NVDA" ? 200 : 300, prevClose: s === "NVDA" ? 215 : 290, change: 0, changePct: s === "NVDA" ? -6.98 : 3.45, time: now() }]),
    );
    return r.fulfill({ json: { asOf: now(), quotes, failed: [] } });
  });
  await page.route("**/api/news**", (r) =>
    r.fulfill({
      json: {
        items: [
          { id: "1", symbol: "NVDA", headline: "Nvidia shares slide after guidance", source: "Reuters", url: "https://example.com/nvda", datetime: now() - 3600 },
          { id: "2", symbol: "TSLA", headline: "Tesla deliveries update", source: "CNBC", url: "https://example.com/tsla", datetime: now() - 7200 },
        ],
      },
    }),
  );
  await page.route("**/api/earnings**", (r) =>
    r.fulfill({ json: { items: [{ symbol: "NVDA", date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), hour: "amc", epsEstimate: 1 }] } }),
  );
}

test("今日總覽：即時損益、停損排最前、異常波動＋新聞、財報；不下載個股檔案", async ({ page }) => {
  const t = trackErrors(page);
  const tickerFiles: string[] = [];
  page.on("request", (r) => {
    const m = r.url().match(/\/data\/([^/?]+)\.json/);
    if (m && !["index", "screener", "fx", "ml-vol"].includes(m[1])) tickerFiles.push(m[1]); // ml-vol：市場狀態（小檔）
  });
  // 只送代號，不送股數或成本
  const apiUrls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiUrls.push(r.url());
  });
  await seedHoldings(page);
  await mockApi(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "今日總覽" })).toBeVisible();
  await expect(page.getByRole("link", { name: "今日", exact: true }).first()).toHaveAttribute("aria-current", "page");
  const holdings = page.locator(".today-holdings");
  await expect(holdings.locator(".live-badge")).toContainText("最後更新");
  // 停損已觸及的 TSLA 排第一並標示
  await expect(holdings.locator(".lv-row").first()).toContainText("TSLA");
  await expect(holdings.locator(".lv-row").first()).toContainText("已觸及停損");
  // 美股即時、台股收盤
  await expect(holdings.locator(".lv-row", { hasText: "NVDA" }).locator(".lv-tag")).toHaveText("即時");
  await expect(holdings.locator(".lv-row", { hasText: "2330.TW" }).locator(".lv-tag")).toHaveText("收盤");
  await expect(holdings.locator(".stat", { hasText: "今日損益" })).toContainText("%");

  // 異常波動（NVDA −6.98%）附相關新聞；新聞開新分頁
  const mover = page.locator(".mover-box", { hasText: "NVDA" });
  await expect(mover).toContainText("異常波動");
  await expect(mover.getByRole("link", { name: /Nvidia shares slide/ })).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("link", { name: "Tesla deliveries update" })).toBeVisible();

  // 財報提醒
  await expect(page.locator(".earn-list")).toContainText("NVDA");
  await expect(page.locator(".earn-rule")).toContainText("財報前一週不開新倉");

  // 訊號區有兩欄
  await expect(page.locator(".sig-bull .sig-title")).toContainText("偏多");
  await expect(page.locator(".sig-danger .sig-title")).toContainText("危險");

  expect(tickerFiles, "首頁不可下載個股檔案").toEqual([]);
  expect(apiUrls.join(" ")).not.toMatch(/shares|cost|1000/);
  await t.expectNoErrors();
});

test("今日總覽：/api 失敗 → 顯示收盤資料並標示非即時", async ({ page }) => {
  const t = trackErrors(page);
  await seedHoldings(page);
  await page.route("**/api/**", (r) => r.fulfill({ status: 503, json: { error: "not-configured" } }));
  await page.goto("/");
  await expect(page.locator(".live-badge")).toContainText("非即時");
  await expect(page.locator(".lv-tag").first()).toHaveText("收盤");
  await expect(page.getByText("新聞暫時無法取得。")).toBeVisible();
  await t.expectNoErrors();
});

test("今日總覽：這台裝置沒有持股 → 顯示提示，不顯示範例數字", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/");
  await expect(page.locator(".today-holdings")).toContainText("這台裝置還沒有持股資料");
  await expect(page.locator(".today-holdings .lv-row")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "到投資組合輸入或匯入持股 →" })).toBeVisible();
  await t.expectNoErrors();
});

test("今日總覽：盤中預估（即時價當作今天收盤，會觸發突破 MA20）", async ({ page }) => {
  const t = trackErrors(page);
  // 讓 NVDA 最後收盤 99 在 MA20（100）之下；即時價 130 → 預估的今天收盤會站上 MA20
  await page.route("**/data/screener.json", async (r) => {
    const res = await r.fetch();
    const json = await res.json();
    for (const tk of json.tickers) {
      if (tk.symbol !== "NVDA") continue;
      const d = tk.daily;
      d.close[d.close.length - 2] = 98;
      d.ma20[d.ma20.length - 2] = 100;
      d.close[d.close.length - 1] = 99;
      d.ma20[d.ma20.length - 1] = 100;
      tk.lastDate = "2020-01-02"; // 確保即時報價是「新的交易日」
      tk.liveBase = { close: 99, sum10: null, sum20: 1900, sum50: null, sum200: null, sumSq20: null, avgGain: null, avgLoss: null, ema12: null, ema26: null, signal: null };
    }
    await r.fulfill({ response: res, json });
  });
  await page.route("**/api/quote**", (r) => r.fulfill({ json: { quotes: { NVDA: { symbol: "NVDA", price: 130, prevClose: 99, change: 31, changePct: 31, time: now() } } } }));
  await page.goto("/");
  const est = page.locator(".sig-bull .sig-intraday");
  await expect(est).toContainText("盤中預估");
  await expect(est).toContainText("NVDA");
  await expect(est).toContainText("突破 MA20");
  await t.expectNoErrors();
});

test("今日總覽手機版：持股在最上面、一頁滑完、沒有橫向捲軸 @mobile", async ({ page }) => {
  const t = trackErrors(page);
  await seedHoldings(page);
  await mockApi(page);
  await page.goto("/");
  await expect(page.locator(".lv-row").first()).toBeVisible();
  const order = await page.evaluate(() => ["today-holdings", "today-signals", "today-news", "today-earnings"].map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? -1));
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await expectNoHorizontalScroll(page);
  await t.expectNoErrors();
});

test("今日總覽：新聞很多時先顯示 12 則；資料載入後才查新聞、財報（不重複查）", async ({ page }) => {
  const t = trackErrors(page);
  await seedHoldings(page);
  const calls: string[] = [];
  await page.route("**/api/quote**", (r) => r.fulfill({ status: 503, json: {} }));
  await page.route("**/api/news**", (r) => {
    calls.push("news");
    return r.fulfill({ json: { items: Array.from({ length: 20 }, (_, i) => ({ id: String(i), symbol: "TSLA", headline: `Headline ${i}`, source: "CNBC", url: `https://example.com/${i}`, datetime: now() - i * 60 })) } });
  });
  await page.route("**/api/earnings**", (r) => {
    calls.push("earnings");
    return r.fulfill({ json: { items: [] } });
  });
  await page.goto("/");
  await expect(page.locator(".news-item")).toHaveCount(12);
  await page.getByRole("button", { name: "顯示全部 20 則" }).click();
  await expect(page.locator(".news-item")).toHaveCount(20);
  expect(calls.sort()).toEqual(["earnings", "news"]);
  await t.expectNoErrors();
});
