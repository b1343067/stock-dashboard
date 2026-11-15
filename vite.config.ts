import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 設定：public/ 底下的檔案（包含 data/*.json）會原封不動複製到 dist/
export default defineConfig({
  plugins: [react()],
});
