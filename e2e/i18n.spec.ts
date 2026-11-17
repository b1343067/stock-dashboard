// 英文版（加碼 C-2）：英文瀏覽器自動顯示英文、可以切換、每一頁沒有漏翻的中文
import { expect, test, type Page } from "@playwright/test";
import { trackErrors } from "./helpers";

test.use({ locale: "en-US" });

/** 畫面上還有中文的文字（排除股票名稱與規定要保留的中文免責聲明） */
async function untranslated(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const index = (await (await fetch("/data/index.json")).json()) as { tickers: { name: string }[] };
    const names = new Set(index.tickers.map((x) => x.name));
    const cjk = /[一-鿿]/;
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = (n.textContent ?? "").trim();
      if (!s || !cjk.test(s)) continue;
      if (names.has(s) || s === "本網站僅供學習參考，非投資建議。") continue;
      const el = n.parentElement;
      if (el?.closest(".lang-btn")) continue; // 語言切換按鈕本來就顯示「中」
      if (el && el.closest("option") && names.has(s.replace(/\s*\(.*$/, ""))) continue;
      out.push(s);
    }
    // 屬性裡的文字（按鈕說明、輸入框提示）
    for (const el of Array.from(document.querySelectorAll("[aria-label],[title],[placeholder]"))) {
      for (const a of ["aria-label", "title", "placeholder"]) {
        const v = el.getAttribute(a);
        if (v && cjk.test(v) && ![...names].some((nm) => v.includes(nm)) && v !== "切換成中文") out.push(`${a}=${v}`);
      }
    }
    return out;
  });
}

test("英文版：自動選英文、各頁沒有漏翻、可以切回中文", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Market", exact: true }).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".footer")).toContainText("not investment advice");
  await expect(page.locator(".footer")).toContainText("本網站僅供學習參考，非投資建議"); // 規定的中文聲明保留

  for (const hash of ["#/today", "#/market", "#/lab", "#/NVDA/daily", "#/compare/VOO,QQQ", "#/screener", "#/portfolio", "#/analysis"]) {
    await page.goto(`/${hash}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    expect(await untranslated(page), `${hash} 不應有漏翻的中文`).toEqual([]);
  }

  // 交易紀錄模式也檢查一次
  await page.goto("/#/portfolio");
  await page.getByRole("radio", { name: "From transactions" }).click();
  await page.getByRole("button", { name: "Load sample transactions" }).click();
  await page.getByRole("button", { name: "＋ Add transaction" }).click();
  expect(await untranslated(page)).toEqual([]);

  // 切回中文，重新整理後記住
  await page.getByRole("button", { name: "切換成中文" }).click();
  await expect(page.getByRole("link", { name: "市場", exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant-TW");
  await expect(page.getByRole("heading", { name: "投資組合" })).toBeVisible();
  await t.expectNoErrors();
});
