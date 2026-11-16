// 加到主畫面（PWA）與離線瀏覽
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("PWA：有 manifest 與圖示；離線時仍能打開網站、看上次的資料", async ({ page, context }) => {
  // manifest 與圖示
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);

  // 第一次打開：註冊 Service Worker
  await page.goto("/#/VOO/daily");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // 再打開一次（這時 Service Worker 已經接手，會把網頁、程式、資料存起來）
  await page.reload();
  await expect(page.locator(".chart-canvas canvas").first()).toBeVisible();
  await page.goto("/"); // 市場總覽也存一份
  await expect(page.locator(".heat-tile").first()).toBeVisible();

  // 斷網後重新整理：網站照常顯示，並提示目前離線
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".offline-banner")).toBeVisible();
  await expect(page.locator(".heat-tile").first()).toBeVisible();
  await page.goto("/#/VOO/daily");
  await expect(page.locator(".chart-canvas canvas").first()).toBeVisible();
  await expect(page.locator(".footer")).toContainText("非投資建議");

  // 恢復網路：離線提示消失
  await context.setOffline(false);
  await expect(page.locator(".offline-banner")).toHaveCount(0);
});
