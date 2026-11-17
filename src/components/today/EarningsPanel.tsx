// 區塊四：財報提醒（7 天內有財報的持股與觀察清單；使用者的規則：財報前一週不開新倉）

import type { EarningsItem } from "../../lib/finnhub";
import { t } from "../../lib/i18n";
import { chartHref } from "../../lib/route";
import { daysUntil } from "../../lib/today";

const HOUR: Record<string, string> = { bmo: "盤前", amc: "盤後", dmh: "盤中" };

interface Props {
  items: EarningsItem[] | null;
  failed: boolean;
  loading: boolean;
  holdings: Set<string>;
  today: string;
}

export default function EarningsPanel({ items, failed, loading, holdings, today }: Props) {
  const list = [...(items ?? [])].sort((a, b) => Number(holdings.has(b.symbol)) - Number(holdings.has(a.symbol)) || a.date.localeCompare(b.date));
  return (
    <section className="card" aria-labelledby="today-earnings">
      <h2 id="today-earnings" className="section-title">{t("財報提醒")}</h2>
      {loading ? (
        <p className="muted">{t("載入中…")}</p>
      ) : failed ? (
        <p className="muted">{t("財報日曆暫時無法取得。")}</p>
      ) : list.length === 0 ? (
        <p className="muted">{t("持股與觀察清單 7 天內沒有財報。")}</p>
      ) : (
        <>
          <p className="earn-rule">{t("⚠️ 財報前一週不開新倉")}</p>
          <ul className="earn-list">
            {list.map((e) => {
              const d = daysUntil(e.date, today);
              return (
                <li key={`${e.symbol}-${e.date}`} className={holdings.has(e.symbol) ? "mine" : ""}>
                  {holdings.has(e.symbol) && <span className="mine-star" aria-label={t("持股")}>★</span>}
                  <a className="sig-sym" href={chartHref(e.symbol)}>{e.symbol}</a>
                  <span className="num">{e.date}</span>
                  <span className="muted small">
                    {d <= 0 ? t("今天") : d === 1 ? t("明天") : t("{0} 天後", [d])}
                    {HOUR[e.hour] ? ` · ${t(HOUR[e.hour])}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="hint">{t("持股與觀察清單（美股）7 天內的財報日（Finnhub 財報日曆）。★ = 持股。")}</p>
    </section>
  );
}
