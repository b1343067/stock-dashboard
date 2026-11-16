// 投資組合總覽：總市值、成本、未實現損益、核心／短線比例、提醒

import { fmtMoney, fmtPct, fmtSignedMoney, pnlClass } from "../../lib/format";
import { fromUsd, type PortfolioSettings, type PortfolioSummary } from "../../lib/portfolio";
import { t } from "../../lib/i18n";

interface Props {
  summary: PortfolioSummary;
  settings: PortfolioSettings;
  fx: Record<string, number>;
  redUp: boolean;
}

export default function SummaryCards({ summary: s, settings, fx, redUp }: Props) {
  const ccy = settings.displayCurrency;
  const show = (usd: number) => fromUsd(usd, ccy, fx);
  const shortPct = s.shortPct ?? 0;
  const corePct = s.shortPct === null ? 0 : 100 - shortPct;

  return (
    <div className="summary-grid">
      <div className="stat">
        <div className="stat-label">{t("總市值")}</div>
        <div className="stat-value">{fmtMoney(show(s.totalValueUsd), ccy)}</div>
        <div className="stat-note muted">{t("成本 {0}", [fmtMoney(show(s.totalCostUsd), ccy)])}</div>
      </div>

      <div className="stat">
        <div className="stat-label">{t("未實現損益")}</div>
        <div className={`stat-value ${pnlClass(s.totalPnlUsd, redUp)}`}>{fmtSignedMoney(show(s.totalPnlUsd), ccy)}</div>
        <div className={`stat-note ${pnlClass(s.totalPnlUsd, redUp)}`}>{t("報酬率 {0}", [fmtPct(s.totalReturnPct, 2, true)])}</div>
      </div>

      <div className={`stat stat-wide${s.shortOverCap ? " stat-warn" : ""}`}>
        <div className="stat-label">
          {t("核心／短線比例")}
          {s.shortOverCap && <span className="warn-pill">{t("短線超過上限")}</span>}
        </div>
        <div className="ratio-bar" role="img" aria-label={t("核心 {0}%，短線 {1}%，上限 {2}%", [corePct.toFixed(1), shortPct.toFixed(1), settings.shortCapPct])}>
          <div className="ratio-core" style={{ width: `${corePct}%` }} />
          <div className="ratio-short" style={{ width: `${shortPct}%` }} />
          {/* 短線上限的位置（從右邊算過來） */}
          <div className="ratio-cap" style={{ right: `${settings.shortCapPct}%` }} title={t("短線上限 {0}%", [settings.shortCapPct])} />
        </div>
        <div className="ratio-legend">
          <span>
            <i className="dot dot-core" /> {" "}{t("核心")}{" "}{fmtPct(s.shortPct === null ? null : corePct, 1)}
            <small className="muted"> {fmtMoney(show(s.coreValueUsd), ccy)}</small>
          </span>
          <span>
            <i className="dot dot-short" /> {" "}{t("短線")}{" "}{fmtPct(s.shortPct, 1)}
            <small className="muted"> {fmtMoney(show(s.shortValueUsd), ccy)}</small>
          </span>
          <span className="muted">{t("上限 {0}%", [settings.shortCapPct])}</span>
        </div>
      </div>

      <div className={`stat${s.alertCount > 0 ? " stat-warn" : ""}`}>
        <div className="stat-label">{t("停利停損提醒")}</div>
        <div className="stat-value">{s.alertCount}</div>
        <div className="stat-note muted">{t("距離 {0}% 以內或已觸及", [settings.alertPct])}</div>
      </div>
    </div>
  );
}
