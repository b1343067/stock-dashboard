// 觀察清單：分類分組、搜尋、按需載入
import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, trackErrors } from "./helpers";

test("首頁只載入總表和目前選的那一檔，不會一次載入全部", async ({ page }) => {
  const t = trackErrors(page);
  const requested: string[] = [];
  page.on("request", (r) => {
    const m = r.url().match(/\/data\/([^?]+)/);
    if (m) requested.push(decodeURIComponent(m[1]));
  });
  await page.goto("/#/VOO/daily");
  await expect(page.locator(".chart-canvas canvas").first()).toBeVisible();
  // ml-vol.json：波動預測卡片用的小檔（每檔一行預測，幾 KB）
  expect(requested.filter((f) => f !== "ml-vol.json").sort()).toEqual(["VOO.json", "index.json"]);

  // 點另一檔才載入那一檔
  await page.locator(".wl-item", { hasText: "NVDA" }).click();
  await expect(page.locator(".quote-symbol")).toHaveText("NVDA");
  expect(requested).toContain("NVDA.json");
  expect(requested.filter((f) => !["index.json", "VOO.json", "NVDA.json", "ml-vol.json"].includes(f))).toEqual([]);
  await t.expectNoErrors();
});

test("依分類分組、可以收合，搜尋代號或名稱", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/VOO/daily");
  const heads = page.locator(".wl-group-head");
  await expect(heads.first()).toBeVisible();
  expect(await heads.count()).toBeGreaterThanOrEqual(3);

  // 收合「科技」→ NVDA 看不到；再展開 → 看得到
  const tech = page.locator(".wl-group-head", { hasText: "科技" });
  await tech.click();
  await expect(page.locator(".wl-item", { hasText: "NVDA" })).toBeHidden();
  await tech.click();
  await expect(page.locator(".wl-item", { hasText: "NVDA" })).toBeVisible();

  // 搜尋名稱
  await page.getByLabel("搜尋股票", { exact: true }).fill("nvidia");
  await expect(page.locator(".wl-item")).toHaveCount(1);
  await expect(page.locator(".wl-item")).toContainText("NVDA");
  // 找不到
  await page.getByLabel("搜尋股票", { exact: true }).fill("zzzz");
  await expect(page.locator(".watchlist")).toContainText("找不到");
  await t.expectNoErrors();
});

test("篩選器可以只篩選某個分類", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/screener");
  await page.getByRole("button", { name: "多頭排列（站上 20／50／200 日線）" }).click();
  const total = page.locator(".results .section-title");
  await expect(total).toContainText("/");

  await page.getByLabel("篩選範圍").selectOption("科技");
  // 範圍內的每一檔（符合＋不符合）都要是科技類：用「不符合」清單展開後檢查代號都在科技分組裡
  const techSymbols = await page.evaluate(async () => {
    const idx = await (await fetch("/data/index.json")).json();
    return idx.tickers.filter((x: { category?: string }) => x.category === "科技").map((x: { symbol: string }) => x.symbol);
  });
  await expect(total).toContainText(`/ ${techSymbols.length} 檔`);
  const others = page.getByRole("button", { name: /不符合的股票/ });
  if (await others.count()) await others.click();
  const shown = await page.locator(".result-sym").allTextContents();
  for (const s of shown) expect(techSymbols).toContain(s);

  // 重新整理後還記得選的分類
  await page.reload();
  await expect(page.getByLabel("篩選範圍")).toHaveValue("科技");
  await t.expectNoErrors();
});

test("手機版：分類下拉選單篩選觀察清單 @mobile", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/VOO/daily");
  await page.getByLabel("分類").selectOption("科技");
  await expect(page.locator(".wl-item", { hasText: "NVDA" })).toBeVisible();
  await expect(page.locator(".wl-item", { hasText: "VOO" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await t.expectNoErrors();
});
