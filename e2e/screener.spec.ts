// 指標篩選器（第二階段）
import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test("篩選器：載入範例組合、切換 AND/OR、點結果看圖再切回來", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/screener");

  await page.getByRole("button", { name: "多頭排列（站上 20／50／200 日線）" }).click();
  await expect(page.locator(".cond-row")).toHaveCount(3);
  const andCount = Number(await page.locator(".count-badge").textContent());

  // OR 的結果一定 ≥ AND
  await page.getByRole("radio", { name: "任一符合（OR）" }).click();
  const orCount = Number(await page.locator(".count-badge").textContent());
  expect(orCount).toBeGreaterThanOrEqual(andCount);

  // 點第一個結果 → 看盤頁
  const first = page.locator(".result-list:not(.dim) .result-item").first();
  const symbol = (await first.locator(".result-sym").textContent())!;
  await first.click();
  await expect(page.locator(".chart-title h2")).toHaveText(symbol);
  await expect(page.locator(".chart-canvas canvas").first()).toBeVisible();

  // 切回篩選器（第二階段曾因 useEffect 回傳 Promise 而整頁出錯，這裡防止再犯）
  await page.getByRole("link", { name: "篩選器" }).click();
  await expect(page.locator(".cond-row")).toHaveCount(3);
  await t.expectNoErrors();
});

test("篩選器：新增條件、儲存組合，重新整理後還在", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/screener");
  await page.getByRole("button", { name: "清除全部" }).click();
  await page.getByRole("button", { name: "＋ 新增條件" }).click();
  const row = page.locator(".cond-row").first();
  await row.getByLabel("週期").selectOption("weekly");
  await row.getByLabel("條件", { exact: true }).selectOption("macdGolden");
  await row.getByLabel("最近幾根內").fill("10");
  await expect(page.locator(".cond-summary")).toContainText("週線 MACD 黃金交叉（最近 10 週內）");

  await page.getByRole("button", { name: "＋ 儲存目前條件" }).click();
  await page.getByPlaceholder("組合名稱").fill("E2E 測試組合");
  await page.getByRole("button", { name: "儲存", exact: true }).click();

  await page.reload();
  await expect(page.locator(".chip-saved", { hasText: "E2E 測試組合" })).toBeVisible();
  await expect(page.locator(".cond-summary")).toContainText("週線 MACD 黃金交叉（最近 10 週內）");
  await t.expectNoErrors();
});
