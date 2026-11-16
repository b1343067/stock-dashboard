// 看盤頁（第一階段）＋ 短期趨勢外推（修正 #4）
import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test("看盤頁：清單、K 線圖、切換週期與指標", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#//daily"); // 沒指定代號 → 預設選第一檔

  // 觀察清單有股票，並預設選第一檔
  const items = page.locator(".wl-item");
  await expect(items.first()).toBeVisible();
  expect(await items.count()).toBeGreaterThanOrEqual(10);
  await expect(page.locator(".chart-canvas canvas").first()).toBeVisible();

  // 點另一檔 → 網址與標題跟著變
  await page.locator(".wl-item", { hasText: "NVDA" }).click();
  await expect(page).toHaveURL(/#\/NVDA\/daily$/);
  await expect(page.locator(".quote-symbol")).toHaveText("NVDA");

  // 切換週線
  await page.getByRole("radio", { name: "週線" }).click();
  await expect(page).toHaveURL(/#\/NVDA\/weekly$/);

  // 疊加布林通道
  const bb = page.getByRole("button", { name: "布林" });
  const before = await bb.getAttribute("aria-pressed");
  await bb.click();
  await expect(bb).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");

  // MACD、RSI 預設收起來，按「＋MACD」展開、再按一次收起
  await expect(page.locator(".pane-label")).toHaveCount(0);
  const macdBtn = page.getByRole("button", { name: /MACD/ });
  await macdBtn.click();
  await expect(page.locator(".pane-label", { hasText: "MACD(12,26,9)" })).toBeVisible();
  await expect(page.locator(".chart-canvas")).toHaveClass(/panes-1/);
  await page.getByRole("button", { name: /RSI/ }).click();
  await expect(page.locator(".chart-canvas")).toHaveClass(/panes-2/);
  await macdBtn.click();
  await expect(page.locator(".pane-label", { hasText: "MACD" })).toHaveCount(0);
  await expect(page.locator(".pane-label", { hasText: "RSI(14)" })).toBeVisible();

  // 「現在的狀態」卡片與免責聲明
  await expect(page.locator(".status-card")).not.toHaveCount(0);
  await expect(page.locator(".footer")).toContainText("本網站僅供學習參考，非投資建議");
  await t.expectNoErrors();
});

test("短期趨勢外推：5 個交易日、不含週末，並和「明天 = 今天」比較", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/VOO/daily");
  const card = page.locator(".card", { hasText: "短期趨勢外推" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("「明天 = 今天」平均誤差");

  // 外推表格的日期（第一列是最新收盤，後面 5 列是未來交易日）
  const dates = await card.locator(".data-table").first().locator("tbody tr td:first-child").allTextContents();
  const future = dates.slice(1);
  expect(future).toHaveLength(5);
  for (const d of future) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    expect(dow, `${d} 不應是週末`).not.toBe(0);
    expect(dow, `${d} 不應是週末`).not.toBe(6);
  }
  await t.expectNoErrors();
});

test("快速搜尋：輸入名稱、按 Enter 跳到那一檔；按 / 可以聚焦搜尋框", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/screener");
  await page.locator("body").press("/");
  await expect(page.getByLabel("快速搜尋股票")).toBeFocused();
  await page.keyboard.type("nvidia");
  await expect(page.locator(".qs-list")).toContainText("NVDA");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/NVDA\/daily$/);
  await expect(page.locator(".quote-symbol")).toHaveText("NVDA");
  await t.expectNoErrors();
});
