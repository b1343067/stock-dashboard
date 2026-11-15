// 觀察清單：桌機是左側直欄，手機是上方可橫向滑動的一排

import type { TickerSummary } from "../lib/types";

interface Props {
  items: TickerSummary[] | null;
  selected: string | null;
  onSelect: (symbol: string) => void;
  redUp: boolean;
}

export default function Watchlist({ items, selected, onSelect, redUp }: Props) {
  if (!items) return <p className="muted pad">載入中…</p>;
  if (items.length === 0) return <p className="muted pad">目前沒有資料</p>;

  return (
    <nav className="watchlist" aria-label="觀察清單">
      <h3 className="section-title">觀察清單</h3>
      <ul>
        {items.map((t) => {
          const up = t.changePct >= 0;
          // 紅漲綠跌 / 綠漲紅跌
          const cls = up === redUp ? "num-red" : "num-green";
          return (
            <li key={t.symbol}>
              <button
                type="button"
                className={`wl-item${t.symbol === selected ? " active" : ""}`}
                onClick={() => onSelect(t.symbol)}
                aria-current={t.symbol === selected ? "true" : undefined}
              >
                <span className="wl-sym">{t.symbol}</span>
                <span className="wl-name">{t.name}</span>
                <span className="wl-price">{t.lastClose.toFixed(2)}</span>
                <span className={`wl-chg ${t.changePct === 0 ? "" : cls}`}>
                  {up ? "+" : ""}
                  {t.changePct.toFixed(2)}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
