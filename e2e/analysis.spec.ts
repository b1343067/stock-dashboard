// 組合分析（第四階段）
import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test("組合分析：指標、熱力圖、最佳化、回測", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/analysis"); // 沒有持股紀錄時會用範例持股

  for (const label of ["加權 Beta", "Jensen's Alpha（年化）", "最大回撤", "夏普值"]) {
    await expect(page.locator(".stat", { hasText: label })).toBeVisible();
  }

  // 熱力圖格數 = 檔數 × 檔數
  const n = await page.locator(".hm-col").count();
  expect(n).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".hm-cell")).toHaveCount(n * n);

  // 最佳化：建議權重都在 5%～45% 之間
  const suggested = await page.locator(".wc-table tbody tr td:nth-child(4)").allTextContents();
  for (const s of suggested) {
    const v = parseFloat(s);
    expect(v).toBeGreaterThanOrEqual(4.95);
    expect(v).toBeLessThanOrEqual(45.05);
  }

  // 回測：組合與 VOO 兩列；換起始日、換權重後結果會變（修正 #5）
  const btTable = page.locator(".data-table.compare").last();
  await expect(btTable.locator("tbody tr")).toHaveCount(2);
  const before = await btTable.locator("tbody tr").first().textContent();
  await page.getByRole("radio", { name: "等權重" }).click();
  await expect(btTable.locator("tbody tr").first()).not.toHaveText(before!);
  await expect(page.locator(".bt-canvas canvas").first()).toBeVisible();
  await t.expectNoErrors();
});
