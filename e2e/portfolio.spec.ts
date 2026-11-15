// 投資組合（第三階段）
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

// 注意：上傳用的檔案要放在「純英文路徑」。Playwright 預設的測試輸出資料夾名稱
// 會包含中文測試標題與「：」「→」等符號，用那裡的檔案上傳會靜靜地失敗（網站收不到檔案）。
const workDir = mkdtempSync(join(tmpdir(), "stockdash-e2e-"));

test("投資組合：範例持股 → 清除 → 新增 → 匯出 → 匯入", async ({ page }) => {
  const t = trackErrors(page);
  page.on("dialog", (d) => d.accept());
  await page.goto("/#/portfolio");

  // 第一次打開顯示範例持股（修正 #6）
  await expect(page.locator(".sample-banner")).toContainText("範例持股");
  expect(await page.locator(".holdings-table tbody tr").count()).toBeGreaterThan(0);

  // 清除範例並新增兩筆（其中一筆台股，驗證換匯提示）
  await page.getByRole("button", { name: "清除範例，開始輸入" }).click();
  const add = async (symbol: string, shares: string, cost: string, short = false) => {
    if ((await page.locator(".holding-form").count()) === 0) await page.getByRole("button", { name: "＋ 新增持股" }).click();
    const form = page.locator(".holding-form");
    await form.getByLabel("股票代號").fill(symbol);
    await form.getByLabel("股數").fill(shares);
    await form.getByLabel(/平均成本/).fill(cost);
    if (short) await form.getByRole("radio", { name: "短線" }).click();
    await form.getByRole("button", { name: "新增" }).click();
  };
  await add("VOO", "2", "500");
  await add("0050.TW", "1000", "80", true);
  await expect(page.locator(".holdings-table tbody tr")).toHaveCount(2);
  await expect(page.locator(".sample-banner")).toHaveCount(0);
  await expect(page.locator(".portfolio .hint").first()).toContainText("換算成美元");
  // 短線部位有停利停損價
  await expect(page.locator(".holdings-table tbody tr", { hasText: "0050.TW" })).toContainText("停利");

  // 匯出
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "匯出" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^my-portfolio-\d{8}\.json$/);
  const file = join(workDir, "export.json");
  await download.saveAs(file);
  expect(JSON.parse(readFileSync(file, "utf8")).holdings).toHaveLength(2);

  // 清掉瀏覽器資料 → 回到範例 → 匯入剛剛的檔案
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".sample-banner")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.locator(".flash")).toContainText("已匯入 2 筆持股");
  await expect(page.locator(".holdings-table tbody tr")).toHaveCount(2);

  // 格式錯誤的檔案 → 顯示錯誤，不會壞掉
  const bad = join(workDir, "bad.json");
  writeFileSync(bad, '{"foo":1}');
  await page.locator('input[type="file"]').setInputFiles(bad);
  await expect(page.locator(".flash")).toContainText("匯入失敗");
  await expect(page.locator(".holdings-table tbody tr")).toHaveCount(2);
  await t.expectNoErrors();
});
