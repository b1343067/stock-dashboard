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
  regime: {
    VOO: {
      label: "美股（VOO）",
      current: { key: "down", name: "修正下跌", since: "2026-10-30", days: 12, date: "2026-11-16", ret20: -3.5, vol20: 23, dd: -5 },
      states: [
        { key: "calm", name: "平穩（低波動）", share: 55.7, ret20: 2.9, vol20: 11.4, dd: -0.9, fwdRet: 1.2, fwdUp: 70, fwdVol: 11.7, avgDays: 24.8 },
        { key: "down", name: "修正下跌", share: 21.8, ret20: -2.7, vol20: 15.8, dd: -5.9, fwdRet: 1.3, fwdUp: 67, fwdVol: 18.1, avgDays: 7.5 },
        { key: "panic", name: "高波動（恐慌）", share: 10.9, ret20: -5.7, vol20: 29.3, dd: -17.2, fwdRet: 2.5, fwdUp: 67, fwdVol: 24.5, avgDays: 13.1 },
      ],
      timeline: { time: times, close: [600, 610, 590, 580], state: ["calm", "calm", "down", "down"] },
    },
  },
};

const ML_VOL = {
  generatedAt: ML.generatedAt,
  horizon: 5,
  models: ML.vol.models.map(({ key, name }) => ({ key, name })),
  tickers: ML.vol.tickers,
  regime: { VOO: { label: "美股（VOO）", ...ML.regime.VOO.current } },
};
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
  await expect(page.locator("section[aria-labelledby=\"lab-vol\"] tr.best")).toContainText("最佳");
  await page.getByRole("radio", { name: "NVDA" }).click();
  await expect(page.locator(".bt-legend").first()).toContainText("70.0%");
  // 模型輸給基準的股票標成灰色
  await expect(page.locator(".lab-tickers li.fallback")).toContainText("SGOV");

  // ② 方向：都輸給永遠猜漲 → ❌ 結論
  await expect(page.locator(".lab-verdict.bad")).toContainText("沒有任何模型贏過「永遠猜漲」（這段期間 57.2% 的時候是漲的）");
  await expect(page.getByRole("cell", { name: "0.995" })).toBeVisible();

  // ③ 市場狀態：現在的狀態、各狀態統計
  const regime = page.locator("#regime");
  await expect(regime.locator(".regime-now-name")).toHaveText("修正下跌");
  await expect(regime).toContainText("第 12 個交易日");
  await expect(regime.locator("tr.best")).toContainText("現在");
  await expect(regime.locator(".regime-legend")).toContainText("高波動（恐慌）");
  await t.expectNoErrors();
});

test("今日總覽：最上面顯示市場狀態，點了進 ML 實驗室", async ({ page }) => {
  const t = trackErrors(page);
  await mockMl(page);
  await page.goto("/#/today");
  const bar = page.locator(".regime-bar");
  await expect(bar).toContainText("美股（VOO）");
  await expect(bar).toContainText("修正下跌");
  await expect(bar).toContainText("第 12 天");
  await bar.click();
  await expect(page).toHaveURL(/#\/lab$/);
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
