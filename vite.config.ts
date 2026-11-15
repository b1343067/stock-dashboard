/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 設定：public/ 底下的檔案（包含 data/*.json）會原封不動複製到 dist/
export default defineConfig({
  plugins: [react()],
  // 單元測試（vitest）只跑 src 裡的 *.test.ts；e2e/ 資料夾是 Playwright 的瀏覽器測試
  test: { include: ["src/**/*.test.ts"] },
  build: {
    rollupOptions: {
      output: {
        // 圖表套件（lightweight-charts）單獨打包成 charts-xxx.js：
        // 檔案名稱看得懂，而且它很少更新，瀏覽器快取可以用比較久
        manualChunks(id) {
          if (id.includes("node_modules/lightweight-charts") || id.includes("node_modules/fancy-canvas")) return "charts";
        },
      },
    },
  },
});
