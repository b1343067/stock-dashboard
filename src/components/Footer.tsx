// 頁尾免責聲明（每一頁最下方都要顯示）
// 英文模式也保留中文的「本網站僅供學習參考，非投資建議」（專案規則：每頁都要有這句中文聲明）

import { getLang, t } from "../lib/i18n";

export default function Footer() {
  return (
    <footer className="footer">
      <p>
        <b>{t("免責聲明：本網站僅供學習參考，非投資建議。")}</b>
      </p>
      {getLang() === "en" && <p className="muted small">本網站僅供學習參考，非投資建議。</p>}
      <p className="muted small">
        {t("資料來源：Yahoo Finance（透過 yfinance，每日自動更新，可能有延遲或錯誤）。圖表：TradingView Lightweight Charts™。")}
      </p>
    </footer>
  );
}
