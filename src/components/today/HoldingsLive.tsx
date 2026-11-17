// 區塊一：持股即時損益（最上面）
// 美股用即時價（每 60 秒更新）、台股用每日收盤；API 失敗時全部用收盤並標示「非即時」。

import { fmtMoney, fmtPct, fmtSignedMoney, pnlClass } from "../../lib/format";
import { t, locale } from "../../lib/i18n";
import type { LiveStatus } from "../../lib/live";
import { fromUsd, type PortfolioSettings, type StopStatus } from "../../lib/portfolio";
import { PORTFOLIO_HREF, chartHref } from "../../lib/route";
import type { LiveSummary } from "../../lib/today";

const STOP_LABEL: Partial<Record<StopStatus, string>> = { "tp-hit": "已達停利", "sl-hit": "已觸及停損", "tp-near": "接近停利", "sl-near": "接近停損" };

interface Props {
  summary: LiveSummary | null;
  settings: PortfolioSettings;
  fx: Record<string, number>;
  redUp: boolean;
  status: LiveStatus;
  updatedAt: Date | null;
}

export default function HoldingsLive({ summary, settings, fx, redUp, status, updatedAt }: Props) {
  // 選項 A（使用者選的）：這台裝置沒有持股時顯示提示，不顯示範例數字，避免誤會
  if (!summary) {
    return (
      <section className="card today-holdings" aria-labelledby="today-holdings">
        <h2 id="today-holdings" className="section-title">{t("持股即時損益")}</h2>
        <p className="muted">{t("這台裝置還沒有持股資料（持股只存在瀏覽器裡，每台裝置各自一份）。")}</p>
        <a className="btn-primary btn-link-as-button" href={PORTFOLIO_HREF}>{t("到投資組合輸入或匯入持股 →")}</a>
      </section>
    );
  }
  const ccy = settings.displayCurrency;
  const show = (usd: number) => fromUsd(usd, ccy, fx);
  const liveLabel =
    status === "live"
      ? t("即時（每 60 秒更新）· 最後更新 {0}", [updatedAt?.toLocaleTimeString(locale(), { hour12: false }) ?? ""])
      : status === "loading"
        ? t("讀取即時報價中…")
        : t("非即時：目前顯示每日收盤資料");

  return (
    <section className="card today-holdings" aria-labelledby="today-holdings">
      <div className="today-head">
        <h2 id="today-holdings" className="section-title">{t("持股即時損益")}</h2>
        <span className={`live-badge ${status === "live" ? "on" : "off"}`} role="status">
          <i aria-hidden="true" /> {liveLabel}
        </span>
      </div>

      <div className="summary-grid today-stats">
        <div className="stat">
          <div className="stat-label">{t("總市值")}</div>
          <div className="stat-value num">{fmtMoney(show(summary.totalValueUsd), ccy)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t("今日損益")}</div>
          <div className={`stat-value num ${pnlClass(summary.dayPnlUsd, redUp)}`}>{fmtSignedMoney(show(summary.dayPnlUsd), ccy)}</div>
          <div className={`stat-note num ${pnlClass(summary.dayPnlUsd, redUp)}`}>{fmtPct(summary.dayPnlPct, 2, true)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t("總未實現損益")}</div>
          <div className={`stat-value num ${pnlClass(summary.unrealizedUsd, redUp)}`}>{fmtSignedMoney(show(summary.unrealizedUsd), ccy)}</div>
          <div className={`stat-note num ${pnlClass(summary.unrealizedUsd, redUp)}`}>{fmtPct(summary.unrealizedPct, 2, true)}</div>
        </div>
      </div>

      <ul className="lv-list">
        {summary.rows.map((r) => {
          const stop = STOP_LABEL[r.status];
          const tone = r.status.startsWith("sl") ? "stop-sl" : r.status.startsWith("tp") ? "stop-tp" : "";
          return (
            <li key={r.holding.id} className={`lv-row ${tone} ${r.status.endsWith("hit") ? "hit" : ""}`}>
              <div className="lv-main">
                <a className="lv-sym" href={chartHref(r.holding.symbol)}>{r.holding.symbol}</a>
                <span className="muted small lv-name">{r.quote?.name ?? t("無報價")}</span>
                <span className={`lv-tag ${r.isLive ? "live" : ""}`}>{r.isLive ? t("即時") : t("收盤")}</span>
                {stop && <span className="lv-stop">{t(stop)}</span>}
              </div>
              <div className="lv-nums num">
                <span className="lv-price">{fmtMoney(r.quote?.price ?? null, r.currency, 2)}</span>
                <span className={pnlClass(r.dayChange, redUp)}>{fmtPct(r.dayChangePct, 2, true)}</span>
                <span className={`lv-unreal ${pnlClass(r.pnl, redUp)}`} title={t("未實現損益")}>
                  {fmtSignedMoney(r.pnl, r.currency)} <small>{fmtPct(r.returnPct, 1, true)}</small>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {summary.missing > 0 && <p className="hint">{t(" {0} 檔不在觀察清單、沒有報價，未計入總計。", [summary.missing])}</p>}
      <p className="hint">{t("美股為即時報價（Finnhub），台股為每日收盤資料。今日損益 = 股數 × (現價 − 昨收)，台股換成美元後加總。")}</p>
    </section>
  );
}
