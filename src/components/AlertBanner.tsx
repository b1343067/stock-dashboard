// 頁首下方的提醒通知：有提醒觸發時顯示，按「知道了」就收起來

import { acknowledge, describeAlert, type PriceAlert, type Quote } from "../lib/alerts";
import { setAlerts, useAlerts } from "../lib/alertsStore";
import { chartHref } from "../lib/route";

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
        <b>{triggered.length} 個價格提醒已觸發：</b>
        {triggered.slice(0, SHOW).map((a, i) => (
          <span key={a.id}>
            {i > 0 && "、"}
            <a href={chartHref(a.symbol)}>{describeAlert(a)}</a>
          </span>
        ))}
        {triggered.length > SHOW && (
          <button type="button" className="btn-link" onClick={onOpen}>
            還有 {triggered.length - SHOW} 個
          </button>
        )}
      </div>
      <span className="alert-banner-actions">
        <button type="button" className="btn-ghost" onClick={onOpen}>
          管理
        </button>
        <button type="button" className="btn-primary" onClick={() => setAlerts(acknowledge(alerts, triggered.map((a) => a.id), dates))}>
          知道了
        </button>
      </span>
    </div>
  );
}
