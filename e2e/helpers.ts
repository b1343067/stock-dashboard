// 測試共用工具
import { expect, type Page } from "@playwright/test";

/**
 * 收集頁面上的 JavaScript 錯誤。測試結束時呼叫 expectNoErrors()，
 * 只要畫面有任何錯誤（包含被錯誤邊界接住的）就算失敗。
 */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return {
    errors,
    async expectNoErrors() {
      await expect(page.locator(".fatal"), "畫面不應出現「畫面發生錯誤」").toHaveCount(0);
      expect(errors, "不應有 JavaScript 錯誤").toEqual([]);
    },
  };
}

/** 頁面不能出現橫向捲軸 */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "不應出現橫向捲軸").toBeLessThanOrEqual(0);
}
