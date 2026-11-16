// 資料讀取失敗時，網頁不能整個壞掉
import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test("某一檔股票資料讀不到：只顯示該區錯誤，可以切換到其他股票", async ({ page }) => {
  await page.route("**/data/TSLA.json", (r) => r.fulfill({ status: 404, body: "not found" }));
  await page.goto("/#/TSLA/daily");
  await expect(page.locator(".chart-card")).toContainText("此股票資料讀取失敗");
  await page.locator(".wl-item", { hasText: "VOO" }).click();
  await expect(page.locator(".chart-canvas canvas").first()).toBeVisible();
  await expect(page.locator(".fatal")).toHaveCount(0);
});

test("總表讀不到：顯示錯誤訊息，頁首與免責聲明仍在", async ({ page }) => {
  await page.route("**/data/index.json", (r) => r.fulfill({ status: 500, body: "error" }));
  await page.goto("/");
  await expect(page.locator(".market, .card").first()).toContainText("無法讀取市場資料"); // 首頁（市場總覽）
  await page.goto("/#//daily");
  await expect(page.locator(".sidebar")).toContainText("無法讀取股票清單");
  await expect(page.locator(".footer")).toContainText("非投資建議");
  await expect(page.locator(".fatal")).toHaveCount(0);
});

test("資料過期時頁首提醒", async ({ page }) => {
  const t = trackErrors(page);
  // 範例資料時網站不會顯示過期提醒，所以把 index.json 標成真實資料，測試才不受本機資料影響
  await page.route("**/data/index.json", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    await route.fulfill({ response: res, json: { ...json, sample: false } });
  });
  // 把瀏覽器時間調到最新資料的兩週後
  await page.clock.setFixedTime(new Date(Date.now() + 14 * 86_400_000));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("資料可能已過期");
  await t.expectNoErrors();
});
