// 市場總覽（#/market；首頁改成今日總覽後移到這個分頁）
import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test("市場總覽：只載入總表，顯示大盤、漲跌家數、排行、分類、熱力圖", async ({ page }) => {
  const t = trackErrors(page);
  const requested: string[] = [];
  page.on("request", (r) => {
    const m = r.url().match(/\/data\/([^?]+)/);
    if (m) requested.push(decodeURIComponent(m[1]));
  });
  await page.goto("/#/market");
  await expect(page.getByRole("heading", { name: "市場總覽" })).toBeVisible();
  await expect(page.getByRole("link", { name: "市場", exact: true })).toHaveAttribute("aria-current", "page");

  // 首頁只需要 index.json，不下載任何個股檔案
  expect(requested).toEqual(["index.json"]);

  const total = await page.evaluate(async () => (await (await fetch("/data/index.json")).json()).tickers.length);
  // 熱力圖每檔一格
  await expect(page.locator(".heat-tile")).toHaveCount(total);
  // 漲跌家數加起來 = 總檔數
  const nums = (await page.locator(".breadth-n").allTextContents()).map(Number);
  expect(nums.reduce((a, b) => a + b, 0)).toBe(total);
  await expect(page.locator(".bench").first()).toBeVisible();
  await expect(page.locator(".cat-bars li").first()).toBeVisible();

  // 切換「近 30 天」，數字會跟著變，重新整理後還記得
  await page.getByRole("radio", { name: "近 30 天" }).click();
  await expect(page.locator(".breadth-card .section-title")).toContainText("近 30 天");
  await page.reload();
  await expect(page.getByRole("radio", { name: "近 30 天" })).toHaveAttribute("aria-checked", "true");

  // 點熱力圖的格子 → 看盤頁
  const tile = page.locator(".heat-tile").first();
  const href = await tile.getAttribute("href");
  await tile.click();
  await expect(page).toHaveURL(new RegExp(`${href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await expect(page.locator(".chart-canvas canvas").first()).toBeVisible();
  await t.expectNoErrors();
});
