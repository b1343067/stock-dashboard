// 程式進入點：把 <App /> 掛到 index.html 的 #root 上

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles.css";

// 在 React 載入前先套用使用者存過的主題，避免畫面閃一下
try {
  const t = JSON.parse(localStorage.getItem("stockdash:theme") ?? "null");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch {
  /* 忽略 */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
