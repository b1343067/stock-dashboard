// 基本面（加碼 B）：看盤頁的基本面卡片、篩選器的基本面條件
// 本機資料可能還沒有 fundamentals 欄位（舊檔），所以用 page.route 補上固定的測試數字
import { expect, test, type Page } from "@playwright/test";
import { trackErrors } from "./helpers";

const FUND = { high52w: 200, low52w: 100, dividendYield: 1.5, dividendTtm: 2, pe: 25, forwardPe: 20, pb: 5, marketCap: 3.2e12, sector: "Technology", industry: null, quoteType: "EQUITY", infoDate: "2026-11-13" };

async function injectTicker(page: Page, symbol: string, fundamentals: object | null) {
  await page.route(`**/data/${symbol}.json`, async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    if (fundamentals) json.fundamentals = fundamentals;
    else delete json.fundamentals;
    await route.fulfill({ response: res, json });
  });
}

test("看盤頁：基本面卡片", async ({ page }) => {
  const t = trackErrors(page);
  await injectTicker(page, "NVDA", FUND);
  await injectTicker(page, "VOO", null);
  await page.goto("/#/NVDA/daily");
  const card = page.locator(".fund-card");
  await expect(card).toContainText("52 週高");
  await expect(card).toContainText("1.50%");
  await expect(card).toContainText("3.20 兆");
  await expect(card).toContainText("Technology");
  await expect(card.locator(".fund-dot")).toHaveCount(1);

  // 沒有基本面的舊資料：顯示提示，不會出錯
  await page.locator(".wl-item", { hasText: "VOO" }).first().click();
  await expect(page.locator(".fund-card")).toContainText("還沒有基本面資料");
  await t.expectNoErrors();
});

test("篩選器：基本面條件不分週期", async ({ page }) => {
  const t = trackErrors(page);
  // 每檔都給同樣的基本面，殖利率 1.5% → 「殖利率高於 1」全部符合、「高於 3」全部不符合
  await page.route("**/data/screener.json", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    for (const x of json.tickers) x.fundamentals = { pe: 25, forwardPe: 20, pb: 5, dividendYield: 1.5, high52w: 200, low52w: 100 };
    await route.fulfill({ response: res, json });
  });
  await page.goto("/#/screener");
  await page.getByRole("button", { name: "清除全部" }).click();
  await page.getByRole("button", { name: "＋ 新增條件" }).click();
  const row = page.locator(".cond-row").first();
  await row.getByLabel("條件", { exact: true }).selectOption("yieldAbove");
  await expect(row.getByLabel("週期")).toHaveCount(0); // 基本面不分日／週／月
  await row.getByLabel("數值").fill("1");
  await expect(page.locator(".cond-summary")).toContainText("殖利率高於 1%");
  await expect(row.locator(".cond-hits")).not.toHaveText("0 檔符合");
  await row.getByLabel("數值").fill("3");
  await expect(row.locator(".cond-hits")).toHaveText("0 檔符合");
  await t.expectNoErrors();
});
