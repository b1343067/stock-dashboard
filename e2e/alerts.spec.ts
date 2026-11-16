// 價格提醒
import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test("價格提醒：從看盤頁新增 → 觸發通知 → 知道了 → 停用；重新整理後還在", async ({ page }) => {
  const t = trackErrors(page);
  const requested: string[] = [];
  page.on("request", (r) => {
    const m = r.url().match(/\/data\/([^?]+)/);
    if (m) requested.push(m[1]);
  });
  await page.goto("/#/VOO/daily");
  await expect(page.locator(".quote-symbol")).toHaveText("VOO");

  // 「＋提醒」帶入代號與現價
  await page.getByRole("button", { name: /＋ 提醒/ }).click();
  const dialog = page.getByRole("dialog", { name: "價格提醒" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("股票代號")).toHaveValue("VOO");
  const price = Number(await dialog.getByLabel("數值").inputValue());
  expect(price).toBeGreaterThan(0);

  // 「收盤價跌到 現價+1 以下」→ 一定成立，馬上觸發
  await dialog.getByLabel("條件").selectOption("priceBelow");
  await dialog.getByLabel("數值").fill(String(Math.ceil(price + 1)));
  await dialog.getByRole("button", { name: "新增" }).click();
  await expect(dialog.locator(".alert-item")).toHaveCount(1);
  await expect(dialog.locator(".alert-item")).toContainText("已觸發");

  // 價格提醒不需要 RSI，所以不會下載 screener.json
  expect(requested).not.toContain("screener.json");

  // 新增一個 RSI 提醒 → 這時才下載 screener.json
  await dialog.getByLabel("條件").selectOption("rsiAbove");
  await expect(dialog.getByLabel("數值")).toHaveValue("70");
  await dialog.getByLabel("數值").fill("101");
  await dialog.getByRole("button", { name: "新增" }).click();
  await expect(dialog.getByRole("alert")).toContainText("RSI 介於 0～100");
  await dialog.getByLabel("數值").fill("99");
  await dialog.getByRole("button", { name: "新增" }).click();
  await expect(dialog.locator(".alert-item")).toHaveCount(2);
  await expect.poll(() => requested.includes("screener.json")).toBe(true);
  await expect(dialog.locator(".alert-item", { hasText: "RSI 高於 99" })).toContainText("監控中");

  // 關閉面板 → 上方通知與鈴鐺數字
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".alert-banner")).toContainText("1 個價格提醒已觸發");
  await expect(page.locator(".bell-badge")).toHaveText("1");

  // 重新整理後還在
  await page.reload();
  await expect(page.locator(".alert-banner")).toBeVisible();

  // 知道了 → 通知消失，提醒變成已停用（只提醒一次）
  await page.locator(".alert-banner").getByRole("button", { name: "知道了" }).click();
  await expect(page.locator(".alert-banner")).toHaveCount(0);
  await expect(page.locator(".bell-badge")).toHaveCount(0);
  await page.getByRole("button", { name: /價格提醒/ }).click();
  await expect(dialog.locator(".alert-item", { hasText: "VOO 收盤價跌到" })).toContainText("已停用");

  // 刪除
  await dialog.getByRole("button", { name: /刪除提醒：VOO 收盤價跌到/ }).click();
  await expect(dialog.locator(".alert-item")).toHaveCount(1);
  await t.expectNoErrors();
});

test("價格提醒：不在觀察清單的代號不能新增", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /價格提醒/ }).click();
  const dialog = page.getByRole("dialog", { name: "價格提醒" });
  await dialog.getByLabel("股票代號").fill("ZZZZ");
  await dialog.getByLabel("數值").fill("10");
  await dialog.getByRole("button", { name: "新增" }).click();
  await expect(dialog.getByRole("alert")).toContainText("不在觀察清單");
});
