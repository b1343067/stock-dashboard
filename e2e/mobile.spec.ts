// 手機版：每一頁都不能出現橫向捲軸（只在 mobile 專案執行）
import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, trackErrors } from "./helpers";

for (const [name, path] of [
  ["今日總覽", "/"],
  ["市場總覽", "/#/market"],
  ["看盤", "/#/VOO/daily"],
  ["走勢比較", "/#/compare/NVDA,AMD,TSM,2330.TW"],
  ["篩選器", "/#/screener"],
  ["投資組合", "/#/portfolio"],
  ["組合分析", "/#/analysis"],
] as const) {
  test(`手機版 ${name}頁 @mobile`, async ({ page }) => {
    const t = trackErrors(page);
    await page.goto(path);
    await expect(page.locator(".footer")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalScroll(page);
    await t.expectNoErrors();
  });
}
