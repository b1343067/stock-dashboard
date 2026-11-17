// ML 實驗室（#/lab）與看盤頁的波動預測卡片
// 用固定的 ml.json（不依賴每天變動的結果；CI 第一次跑時 data 分支可能還沒有 ml.json）
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, trackErrors } from "./helpers";

const times = ["2026-01-02", "2026-01-09", "2026-01-16", "2026-01-23"];
const ML = {
  generatedAt: "2026-11-17T00:00:00Z",
  horizon: 5,
  symbols: 49,
  samples: 51826,
  trainStart: "2022-08-30",
  testStart: "2023-12-15",
  testEnd: "2026-11-09",
  refitEvery: 21,
  cost: 0.001,
  features: { vol: [], direction: [] },
  vol: {
    best: "gbm",
    models: [
      { key: "naive", name: "基準：過去 20 天的波動", qlike: 0.3, mae: 6.1, improvement: 0 },
      { key: "ewma", name: "基準：EWMA（λ = 0.94）", qlike: 0.27, mae: 5.8, improvement: 11 },
      { key: "har", name: "HAR 模型（線性迴歸）", qlike: 0.27, mae: 5.7, improvement: 10.1 },
      { key: "gbm", name: "梯度提升樹（ML）", qlike: 0.25, mae: 5.2, improvement: 16.7 },
    ],
    tickers: {
      NVDA: { date: "2026-11-16", predAnn: 72.5, range5: 10.21, naiveAnn: 58.7, pctile: 100, model: "gbm", improvement: 5.8 },
      SGOV: { date: "2026-11-16", predAnn: 0.3, range5: 0.05, naiveAnn: 0.3, pctile: 94, model: "naive", improvement: -149.4 },
    },
    examples: { VOO: { time: times, actual: [12, 14, 13, 15], naive: [11, 12, 13, 14], best: [12, 13, 13, 14] }, NVDA: { time: times, actual: [50, 55, 60, 70], naive: [48, 50, 55, 60], best: [50, 54, 58, 66] } },
  },
  direction: {
    baseRate: 57.2,
    periods: 4,
    buyHold: { total: 139.4, annual: 34.1, sharpe: 1.88 },
    models: [
      { key: "up", name: "基準：永遠猜漲", accuracy: 57.2, auc: 0.5, vsUp: 0 },
      { key: "trend", name: "基準：趨勢外推（網站原本的方法）", accuracy: 52.5, auc: 0.499, vsUp: -4.7, pValue: 0.995, strategy: { total: 87.9, annual: 23.6, sharpe: 1.44 } },
      { key: "logit", name: "邏輯迴歸", accuracy: 55.7, auc: 0.519, vsUp: -1.5, pValue: 1, strategy: { total: 100.9, annual: 26.4, sharpe: 1.52 } },
      { key: "gbm", name: "梯度提升樹（ML）", accuracy: 53.8, auc: 0.514, vsUp: -3.4, pValue: 0.998, strategy: { total: 102.5, annual: 26.7, sharpe: 1.44 } },
    ],
    curves: { time: times, buyHold: [1, 3, 2, 5], trend: [0, 1, 1, 2], logit: [1, 2, 2, 3], gbm: [1, 2, 1, 3] },
    byYear: [{ year: 2026, baseRate: 54.6, up: 54.6, trend: 53.3, logit: 54.1, gbm: 54.1 }],
  },
};

const ML_VOL = { generatedAt: ML.generatedAt, horizon: 5, models: ML.vol.models.map(({ key, name }) => ({ key, name })), tickers: ML.vol.tickers };
const mockMl = async (page: Page) => {
  await page.route("**/data/ml.json", (r) => r.fulfill({ json: ML }));
  await page.route("**/data/ml-vol.json", (r) => r.fulfill({ json: ML_VOL }));
};

test("ML 實驗室：方法、兩個實驗的結果與自動產生的結論", async ({ page }) => {
  const t = trackErrors(page);
  await mockMl(page);
  await page.goto("/#/market");
  await page.getByRole("link", { name: /ML 實驗室/ }).click();
  await expect(page).toHaveURL(/#\/lab$/);
  await expect(page.getByRole("heading", { name: "🧪 ML 實驗室" })).toBeVisible();
  // 導覽列：實驗室屬於「市場」分頁
  await expect(page.getByRole("link", { name: "市場", exact: true }).first()).toHaveAttribute("aria-current", "page");

  // ① 波動：結論由數字產生、最佳模型有標示
  await expect(page.locator(".lab-verdict").first()).toContainText("梯度提升樹（ML）」：預測誤差（QLIKE）比基準少 16.7%");
  await expect(page.locator(".lab-table tr.best")).toContainText("最佳");
  await page.getByRole("radio", { name: "NVDA" }).click();
  await expect(page.locator(".bt-legend").first()).toContainText("70.0%");
  // 模型輸給基準的股票標成灰色
  await expect(page.locator(".lab-tickers li.fallback")).toContainText("SGOV");

  // ② 方向：都輸給永遠猜漲 → ❌ 結論
  await expect(page.locator(".lab-verdict.bad")).toContainText("沒有任何模型贏過「永遠猜漲」（這段期間 57.2% 的時候是漲的）");
  await expect(page.getByRole("cell", { name: "0.995" })).toBeVisible();
  await t.expectNoErrors();
});

test("看盤頁：未來 5 天波動預測卡片（含模型輸給基準時的說明）", async ({ page }) => {
  const t = trackErrors(page);
  await mockMl(page);
  await page.goto("/#/NVDA/daily");
  const card = page.locator(".vol-card");
  await expect(card).toContainText("±10.21%");
  await expect(card).toContainText("偏高");
  await expect(card).toContainText("模型的預測誤差比基準少 5.8%");
  await card.getByRole("link", { name: "看方法與驗證 →" }).click();
  await expect(page).toHaveURL(/#\/lab$/);
  await t.expectNoErrors();
});

test("沒有 ml.json：實驗室顯示提示、看盤頁不顯示卡片，網頁不會壞", async ({ page }) => {
  const t = trackErrors(page);
  await page.route("**/data/ml*.json", (r) => r.fulfill({ status: 404, body: "not found" }));
  await page.goto("/#/lab");
  await expect(page.getByText("還沒有 ML 實驗結果")).toBeVisible();
  await page.goto("/#/NVDA/daily");
  await expect(page.locator(".chart-canvas canvas").first()).toBeVisible();
  await expect(page.locator(".vol-card")).toHaveCount(0);
  t.errors.splice(0, t.errors.length, ...t.errors.filter((e) => !e.includes("404"))); // 404 是故意的
  await t.expectNoErrors();
});

test("ML 實驗室手機版：沒有橫向捲軸 @mobile", async ({ page }) => {
  const t = trackErrors(page);
  await mockMl(page);
  await page.goto("/#/lab");
  await expect(page.locator(".lab-verdict").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await t.expectNoErrors();
});
