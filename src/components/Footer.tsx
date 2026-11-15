// 頁尾免責聲明（每一頁最下方都要顯示）

export default function Footer() {
  return (
    <footer className="footer">
      <p>
        <b>免責聲明：本網站僅供學習參考，非投資建議。</b>
      </p>
      <p className="muted small">
        資料來源：Yahoo Finance（透過 yfinance，每日自動更新，可能有延遲或錯誤）。圖表：TradingView Lightweight Charts™。
      </p>
    </footer>
  );
}
