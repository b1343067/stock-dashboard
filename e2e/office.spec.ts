// AI 投研辦公室（首頁）：範例報告、點角色看報告、物件當選單、讀取失敗不會壞、手機版
import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, trackErrors, type Page } from "./helpers";

// 人物會走動（名牌跟著移動），Playwright 點擊會一直等元素「穩定」而逾時 → 測試時關掉動畫（大家都坐著）
test.use({ reducedMotion: "reduce" });

/** 固定用範例報告（main 上已經有每天的正式報告，內容每天不同，測試不能依賴） */
const useSample = (page: Page) => page.route("**/ai/index.json", (r) => r.fulfill({ json: { dates: [] } }));

const ROLES = ["技術分析師", "新聞分析師", "基本面分析師", "多空辯論", "主管"];

test("首頁就是辦公室：範例標示、5 位角色、點名牌打開報告", async ({ page }) => {
  const errs = trackErrors(page);
  await useSample(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI 投研辦公室" })).toBeAttached();
  await expect(page.locator(".office-hud-left")).toContainText("範例報告");
  await expect(page.locator(".office-hud-right")).toContainText("5／5 位完成");
  await expect(page.locator(".office-tag.is-done")).toHaveCount(5);

  for (const name of ROLES) {
    await page.locator(".office-tag", { hasText: name }).click();
    const dialog = page.getByRole("dialog", { name });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("範例報告");
    await expect(dialog).toContainText("AI 報告僅供學習參考，非投資建議");
    await expect(dialog.locator(".report-items li").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  // 多空辯論有兩邊的理由、主管有 3～5 點重點
  await page.locator(".office-tag", { hasText: "多空辯論" }).click();
  await expect(page.getByRole("dialog")).toContainText("偏多的理由");
  await expect(page.getByRole("dialog")).toContainText("偏空的理由");
  await page.getByRole("button", { name: "關閉" }).click();
  // 主管今日重點卡片 → 主管報告
  await expect(page.locator(".office-brief li")).toHaveCount(4);
  await page.getByRole("button", { name: /看完整報告/ }).click();
  const points = await page.getByRole("dialog", { name: "主管" }).locator(".report-section", { hasText: "今日重點" }).locator("li").count();
  expect(points).toBeGreaterThanOrEqual(3);
  expect(points).toBeLessThanOrEqual(5);
  // 股票連結到看盤頁
  await page.getByRole("dialog").locator(".report-ref").first().click();
  await expect(page).toHaveURL(/#\/[A-Z]+\/daily/);
  // 點 logo 回到辦公室
  await page.locator(".brand").click();
  await expect(page.locator(".office-scene")).toBeVisible();
  await errs.expectNoErrors();
});

test("等角場景：畫布有畫出東西", async ({ page }) => {
  await page.goto("/#/office");
  const canvas = page.locator(".office-scene canvas");
  await expect
    .poll(() =>
      canvas.evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
        return n;
      }),
    )
    .toBeGreaterThan(20000);
});

test("報告讀取失敗或格式錯誤：辦公室照樣顯示、大家休假中", async ({ page }) => {
  const errs = trackErrors(page);
  await useSample(page);
  await page.route("**/ai/sample-report.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 1, roles: {} }) }));
  await page.goto("/");
  await expect(page.locator(".office-tag.is-off")).toHaveCount(5);
  await expect(page.locator(".office-hud-left")).toContainText("暫時無法讀取 AI 報告");
  await expect(page.locator(".office-brief")).toHaveCount(0);
  await page.locator(".office-tag", { hasText: "主管" }).click();
  await expect(page.getByRole("dialog")).toContainText("今天休假中");
  await errs.expectNoErrors();
});

test("手機版：物件切換頁面、不顯示底部導覽列、報告從底部滑出、沒有橫向捲軸 @mobile", async ({ page }) => {
  const errs = trackErrors(page);
  await useSample(page);
  await page.goto("/");
  await expect(page.locator(".office-spot")).toHaveCount(5);
  await expect(page.locator(".bottom-nav")).toBeHidden();
  await expectNoHorizontalScroll(page);
  await page.locator(".office-tag", { hasText: "新聞分析師" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.keyboard.press("Escape");
  await page.locator(".office-spot", { hasText: "今日" }).click();
  await expect(page).toHaveURL(/#\/today/);
  await expect(page.locator(".bottom-nav")).toBeVisible(); // 其他頁照常有底部導覽列
  await page.goBack();
  await page.locator(".office-spot", { hasText: "篩選" }).click();
  await expect(page).toHaveURL(/#\/screener/);
  await errs.expectNoErrors();
});

test("正式報告：沒有範例標示、可以切換歷史日期", async ({ page }) => {
  const errs = trackErrors(page);
  const base = (await (await page.request.get("/ai/sample-report.json")).json()) as Record<string, unknown> & { roles: { lead: { summary: { zh: string } } } };
  const mk = (date: string, word: string) => {
    const r = JSON.parse(JSON.stringify(base));
    r.sample = false;
    r.date = date;
    r.roles.lead.summary.zh = `${word}的主管摘要`;
    return r;
  };
  await page.route("**/ai/index.json", (r) => r.fulfill({ json: { dates: ["2026-11-19", "2026-11-18"] } }));
  await page.route("**/ai/latest.json", (r) => r.fulfill({ json: mk("2026-11-19", "今天") }));
  await page.route("**/ai/reports/2026-11-18.json", (r) => r.fulfill({ json: mk("2026-11-18", "昨天") }));
  await page.goto("/");
  await expect(page.locator(".office-brief")).toContainText("今天的主管摘要");
  await expect(page.locator(".office-hud-left")).not.toContainText("範例報告");
  await page.getByLabel("報告日期").selectOption("2026-11-18");
  await expect(page.locator(".office-brief")).toContainText("昨天的主管摘要");
  await page.getByLabel("報告日期").selectOption("2026-11-19");
  await expect(page.locator(".office-brief")).toContainText("今天的主管摘要");
  await errs.expectNoErrors();
});

test("今日氣氛：依市場狀態顯示小標籤、點了到 ML 實驗室；讀不到也不會壞", async ({ page }) => {
  const errs = trackErrors(page);
  const regime = (key: string, name: string, label: string) => ({ key, name, label, since: "2026-11-01", days: 3, date: "2026-11-20", ret20: 0, vol20: 10, dd: 0 });
  await page.route(/ml-vol\.json/, (r) =>
    r.fulfill({ json: { generatedAt: "2026-11-20", horizon: 5, models: [], tickers: {}, regime: { VOO: regime("calm", "平穩（低波動）", "美股（VOO）"), "0050.TW": regime("panic", "高波動（恐慌）", "台股（0050）") } } }),
  );
  await page.goto("/");
  // 兩個市場取比較嚴重的（台股恐慌）
  const chip = page.locator(".hud-mood");
  await expect(chip).toContainText("高波動（恐慌）");
  await expect(chip).toContainText("台股（0050）");
  await chip.click();
  await expect(page).toHaveURL(/#\/lab/);
  await errs.expectNoErrors();
});

test("今日氣氛：ml-vol.json 讀不到 → 不顯示標籤，辦公室照常", async ({ page }) => {
  await page.route(/ml-vol\.json/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/");
  await expect(page.locator(".office-tag")).toHaveCount(5);
  await expect(page.locator(".hud-mood")).toHaveCount(0);
});
