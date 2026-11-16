// 交易紀錄制投資組合（加碼 C）：切換模式、新增買進／賣出／股利、已實現損益、持股自動計算、XIRR
import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test("交易紀錄：新增交易 → 持股自動計算 → 已實現損益與 XIRR", async ({ page }) => {
  const t = trackErrors(page);
  page.on("dialog", (d) => d.accept());
  await page.goto("/#/portfolio");
  await page.getByRole("radio", { name: "用交易紀錄計算" }).click();
  await expect(page.locator(".tx-empty")).toBeVisible();
  // 交易紀錄模式不能直接新增持股
  await expect(page.getByRole("button", { name: "＋ 新增持股" })).toHaveCount(0);

  await page.getByRole("button", { name: "＋ 新增交易" }).click();
  const form = page.locator(".tx-form");
  const add = async (type: string, date: string, symbol: string, a: string, b?: string) => {
    await form.getByRole("radio", { name: type }).click();
    await form.getByLabel("日期").fill(date);
    await form.getByLabel("股票代號").fill(symbol);
    if (type === "股利") await form.getByLabel(/實領股利/).fill(a);
    else {
      await form.getByLabel("股數").fill(a);
      await form.getByLabel(/成交價/).fill(b!);
    }
    await form.getByRole("button", { name: "新增" }).click();
  };
  await add("買進", "2024-01-02", "VOO", "10", "400");
  await add("買進", "2024-06-03", "VOO", "10", "500");
  await add("賣出", "2024-09-03", "VOO", "5", "520");
  await add("股利", "2024-09-30", "VOO", "30");

  // 交易清單 4 筆；持股自動算出 15 股、平均成本 450
  await expect(page.locator(".tx-list tbody tr")).toHaveCount(4);
  const row = page.locator(".holdings-table tbody tr", { hasText: "VOO" });
  await expect(row).toContainText("15");
  await expect(row).toContainText("450");
  // 已實現 = 5 × (520 − 450) = 350；股利 30
  const stats = page.locator(".tx-stats tbody tr", { hasText: "VOO" });
  await expect(stats).toContainText("+US$350.00");
  await expect(stats).toContainText("US$30.00");
  await expect(page.locator(".tx-summary")).toContainText("年化報酬（XIRR）");
  await expect(page.locator(".tx-summary .stat").last().locator(".stat-value")).toHaveText(/%$/);

  // 重新整理後還在、模式也記住
  await page.reload();
  await expect(page.getByRole("radio", { name: "用交易紀錄計算" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".tx-list tbody tr")).toHaveCount(4);

  // 刪掉賣出 → 持股回到 20 股
  await page.getByRole("button", { name: /刪除 2024-09-03 VOO 賣出/ }).click();
  await expect(page.locator(".holdings-table tbody tr", { hasText: "VOO" })).toContainText("20");

  // 切回直接輸入持股：顯示原本的（範例）持股，交易紀錄不見但沒被刪
  await page.getByRole("radio", { name: "直接輸入持股" }).click();
  await expect(page.locator(".tx-panel")).toHaveCount(0);
  await page.getByRole("radio", { name: "用交易紀錄計算" }).click();
  await expect(page.locator(".tx-list tbody tr")).toHaveCount(3);
  await t.expectNoErrors();
});

test("交易紀錄：範例交易、賣超過持有會警告", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/portfolio");
  await page.getByRole("radio", { name: "用交易紀錄計算" }).click();
  await page.getByRole("button", { name: "載入範例交易看看" }).click();
  await expect(page.locator(".tx-stats tbody tr")).toHaveCount(3);
  await expect(page.locator(".tx-warnings")).toHaveCount(0);

  await page.getByRole("button", { name: "＋ 新增交易" }).click();
  const form = page.locator(".tx-form");
  await form.getByRole("radio", { name: "賣出" }).click();
  await form.getByLabel("日期").fill("2025-01-02");
  await form.getByLabel("股票代號").fill("NVDA");
  await form.getByLabel("股數").fill("100");
  await form.getByLabel(/成交價/).fill("130");
  await form.getByRole("button", { name: "新增" }).click();
  await expect(page.locator(".tx-warnings")).toContainText("只持有 10 股");
  await t.expectNoErrors();
});
