// AI 投研辦公室（#/office）：範例報告、點角色看報告、讀取失敗不會壞、手機版
import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, trackErrors } from "./helpers";

const ROLES = ["技術分析師", "新聞分析師", "基本面分析師", "多空辯論", "主管"];

test("辦公室：5 位角色、範例報告標示、點角色打開報告", async ({ page }) => {
  const errs = trackErrors(page);
  await page.goto("/#/office");
  await expect(page.getByRole("heading", { name: "AI 投研辦公室" })).toBeVisible();
  await expect(page.locator(".office-banner").first()).toContainText("範例報告");
  await expect(page.locator(".office-station")).toHaveCount(5);
  await expect(page.locator(".office-status.is-done")).toHaveCount(5);
  // 導覽列維持 5 格，辦公室讓「今日」亮起來
  await expect(page.locator(".header nav a.active, .header a.active").first()).toHaveText(/今日/);

  for (const name of ROLES) {
    await page.locator(".office-station", { hasText: name }).click();
    const dialog = page.getByRole("dialog", { name });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("範例報告");
    await expect(dialog).toContainText("AI 報告僅供學習參考，非投資建議");
    await expect(dialog.locator(".report-items li").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  // 多空辯論有兩邊的理由、主管有 3～5 點重點
  await page.locator(".office-station", { hasText: "多空辯論" }).click();
  await expect(page.getByRole("dialog")).toContainText("偏多的理由");
  await expect(page.getByRole("dialog")).toContainText("偏空的理由");
  await page.getByRole("button", { name: "關閉" }).click();
  await page.locator(".office-station", { hasText: "主管" }).click();
  const points = await page.locator(".report-section", { hasText: "今日重點" }).locator("li").count();
  expect(points).toBeGreaterThanOrEqual(3);
  expect(points).toBeLessThanOrEqual(5);
  // 股票連結到看盤頁
  await page.getByRole("dialog").locator(".report-ref").first().click();
  await expect(page).toHaveURL(/#\/[A-Z]+\/daily/);
  await errs.expectNoErrors();
});

test("今日總覽、市場總覽都有辦公室入口", async ({ page }) => {
  await page.goto("/#/today");
  await page.locator(".office-entry").click();
  await expect(page).toHaveURL(/#\/office/);
  await page.goto("/#/market");
  await expect(page.locator(".office-entry")).toBeVisible();
});

test("報告讀取失敗或格式錯誤：辦公室照樣顯示、大家休假中", async ({ page }) => {
  const errs = trackErrors(page);
  await page.route("**/ai/sample-report.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 1, roles: {} }) }));
  await page.goto("/#/office");
  await expect(page.locator(".office-station")).toHaveCount(5);
  await expect(page.locator(".office-status.is-off")).toHaveCount(5);
  await expect(page.getByText("暫時無法讀取 AI 報告")).toBeVisible();
  await page.locator(".office-station", { hasText: "主管" }).click();
  await expect(page.getByRole("dialog")).toContainText("今天休假中");
  await errs.expectNoErrors();
});

test("手機版：辦公室兩欄、報告從底部滑出、沒有橫向捲軸 @mobile", async ({ page }) => {
  const errs = trackErrors(page);
  await page.goto("/#/office");
  await expect(page.locator(".office-station")).toHaveCount(5);
  await expectNoHorizontalScroll(page);
  await page.locator(".office-station", { hasText: "新聞分析師" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await errs.expectNoErrors();
});
