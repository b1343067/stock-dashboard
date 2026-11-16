// 端對端（E2E）測試設定：用真的瀏覽器打開網站，模擬使用者操作。
// 執行：npm run build && npm run test:e2e
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0, // CI 偶爾會慢，失敗時重試一次
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "off",
    // 預設封鎖 Service Worker：它會攔截網頁的請求，讓「模擬請求失敗」的測試失效。
    // 只有 PWA 離線測試（pwa.spec.ts）會打開它。
    serviceWorkers: "block",
  },
  // 測試前自動啟動「打包後的網站」（要先 npm run build）
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    // 桌機跑全部，但不跑標記 @mobile 的（那些只適用手機版畫面）
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } }, grepInvert: /@mobile/ },
    // 手機只跑標記 @mobile 的測試
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
});
