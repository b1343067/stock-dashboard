// 頁首下方的提醒通知：有提醒觸發時顯示，按「知道了」就收起來

import { acknowledge, describeAlert, type PriceAlert, type Quote } from "../lib/alerts";
import { setAlerts, useAlerts } from "../lib/alertsStore";
import { chartHref } from "../lib/route";
import { t } from "../lib/i18n";

interface Props {
  triggered: PriceAlert[];
  quotes: Record<string, Quote>;
  onOpen: () => void;
}

const SHOW = 3; // 最多直接列出幾個，其餘用「還有 N 個」

export default function AlertBanner({ triggered, quotes, onOpen }: Props) {
  const alerts = useAlerts();
  if (triggered.length === 0) return null;
  const dates = Object.fromEntries(Object.entries(quotes).map(([s, q]) => [s, q.date]));
  return (
    <div className="banner alert-banner" role="status">
      <span className="alert-banner-icon" aria-hidden="true">
        🔔
      </span>
      <div className="alert-banner-list">
        <b>{t("{0} 個價格提醒已觸發：", [triggered.length])}</b>
        {triggered.slice(0, SHOW).map((a, i) => (
          <span key={a.id}>
            {i > 0 && t("、")}
            <a href={chartHref(a.symbol)}>{describeAlert(a)}</a>
          </span>
        ))}
        {triggered.length > SHOW && (
          <button type="button" className="btn-link" onClick={onOpen}>
            {t("還有 {0} 個", [triggered.length - SHOW])}
          </button>
        )}
      </div>
      <span className="alert-banner-actions">
        <button type="button" className="btn-ghost" onClick={onOpen}>
          {t("管理")}
        </button>
        <button type="button" className="btn-primary" onClick={() => setAlerts(acknowledge(alerts, triggered.map((a) => a.id), dates))}>
          {t("知道了")}
        </button>
      </span>
    </div>
  );
}
