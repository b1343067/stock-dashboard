// 程式進入點：把 <App /> 掛到 index.html 的 #root 上

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { applyDocumentLang } from "./lib/i18n";
// 字體：數字用 Inter（等寬數字）、標題與英文用 Manrope；中文用系統字體（蘋方／思源黑體／微軟正黑體）
// 字型檔跟網站一起打包，不依賴外部 CDN；只會下載畫面上用到的字元範圍（拉丁字母）
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/manrope/wght.css";
import "./styles.css";

// 在 React 載入前先套用使用者存過的主題，避免畫面閃一下
try {
  const t = JSON.parse(localStorage.getItem("stockdash:theme") ?? "null");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch {
  /* 忽略 */
}

// <html lang> 依使用者選的語言設定（index.html 預設 zh-Hant-TW）
applyDocumentLang();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// 註冊 Service Worker（只在正式版；開發模式不用，避免快取干擾改程式）
// 功能：可以「加到主畫面」、沒網路時顯示上次的資料（見 public/sw.js）
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* 註冊失敗（例如瀏覽器不支援）不影響網站本身 */
    });
  });
}
