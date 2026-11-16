// 錯誤邊界：如果畫面某處程式出錯，顯示提示訊息，而不是整頁變白

import { Component, type ReactNode } from "react";
import { t } from "../lib/i18n";

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatal">
          <h2>{t("畫面發生錯誤")}</h2>
          <p className="muted">{this.state.error.message}</p>
          <button type="button" className="btn-ghost" onClick={() => location.reload()}>
            {t("重新整理")}
          </button>
          <p className="small">{t("本網站僅供學習參考，非投資建議")}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
