// 多檔走勢比較、效率前緣
import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test("走勢比較：從看盤頁進入、加入／移除股票、網址可以分享", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/NVDA/daily");
  await page.getByRole("link", { name: /比較/ }).click();
  await expect(page).toHaveURL(/#\/compare\/NVDA,VOO$/);
  await expect(page.locator(".cmp-table tbody tr")).toHaveCount(2);
  await expect(page.locator(".cmp-canvas canvas").first()).toBeVisible();

  // 加入第三檔
  await page.getByLabel("加入比較的股票").fill("amd");
  await page.getByLabel("加入比較的股票").press("Enter");
  await expect(page).toHaveURL(/#\/compare\/NVDA,VOO,AMD$/);
  await expect(page.locator(".cmp-table tbody tr")).toHaveCount(3);

  // 每檔第一天都是 0%：累積報酬欄位要有數字
  for (const v of await page.locator(".cmp-table tbody td:nth-child(2)").allTextContents()) expect(v).toMatch(/%$/);

  // 移除、切換期間
  await page.getByRole("button", { name: "移除 VOO" }).click();
  await expect(page).toHaveURL(/#\/compare\/NVDA,AMD$/);
  await page.getByRole("radio", { name: "3 個月" }).click();
  await expect(page.locator(".cmp-table tbody tr").first()).toContainText("～");

  // 直接打開分享的網址也可以
  await page.goto("/#/compare/0050.TW,2330.TW");
  await expect(page.locator(".cmp-table tbody tr")).toHaveCount(2);
  await t.expectNoErrors();
});

test("效率前緣：隨機組合、前緣線、目前與建議組合", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/analysis");
  await expect(page.locator(".frontier-svg")).toBeVisible();
  expect(await page.locator(".fr-cloud circle").count()).toBe(2500);
  await expect(page.locator(".fr-line")).toHaveAttribute("d", /^M.+L/);
  await expect(page.locator(".fr-marker")).toHaveCount(2);
  await expect(page.locator(".fr-marker").first()).toHaveAttribute("aria-label", /目前組合：預期報酬 .+%/);
  await t.expectNoErrors();
});
