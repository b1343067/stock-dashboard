// 觀察清單（側邊欄）
//   桌機：上方搜尋框，下面依分類分組（每組可以收合）
//   手機：搜尋框＋分類下拉選單，股票排成一列左右滑動
// 這裡只用 index.json 的摘要（代號、名稱、最新價），點了某一檔才會下載那一檔的完整資料。

import { useEffect, useMemo, useRef, useState } from "react";
import type { TickerSummary } from "../lib/types";
import { useStoredState } from "../lib/storage";
import { filterByCategory, groupTickers } from "../lib/watchlist";
import Sparkline from "./Sparkline";
import { t } from "../lib/i18n";

interface Props {
  items: TickerSummary[] | null;
  categories?: string[];
  selected: string | null;
  onSelect: (symbol: string) => void;
  redUp: boolean;
}

export default function Watchlist({ items, categories = [], selected, onSelect, redUp }: Props) {
  const [query, setQuery] = useState("");
  // 手機版的分類篩選（桌機版用分組顯示，不需要）
  const [mobileCat, setMobileCat] = useState("all");
  // 收合的分類（記在瀏覽器，下次打開還是一樣）
  const [collapsed, setCollapsed] = useStoredState<string[]>("watchlist:collapsed", []);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () => groupTickers(filterByCategory(items ?? [], mobileCat), categories, query),
    [items, categories, query, mobileCat],
  );
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const searching = query.trim() !== "";

  // 選中的股票自動捲到看得到的位置（清單很長時，從篩選器點進來也找得到）
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(".wl-item.active");
    if (!list || !el) return;
    const l = list.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // 捲到清單上方附近（留一點空間給分類標題）；側邊欄可能比螢幕高，放上方才保證看得到
    const visibleBottom = Math.min(l.bottom, window.innerHeight);
    if (r.top < l.top + 30 || r.bottom > visibleBottom) list.scrollTop += r.top - l.top - 72;
    if (r.left < l.left || r.right > l.right) list.scrollLeft += r.left - l.left - 8;
  }, [selected, items]);

  if (!items) return <p className="muted pad">{t("載入中…")}</p>;
  if (items.length === 0) return <p className="muted pad">{t("目前沒有資料")}</p>;

  const toggle = (name: string) =>
    setCollapsed(collapsed.includes(name) ? collapsed.filter((c) => c !== name) : [...collapsed, name]);

  return (
    <nav className="watchlist" aria-label={t("觀察清單")}>
      <div className="wl-tools">
        <input
          type="search"
          className="text-input wl-search"
          placeholder={t("搜尋 {0} 檔（代號或名稱）", [items.length])}
          aria-label={t("搜尋股票")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="wl-cat-select" aria-label={t("分類")} value={mobileCat} onChange={(e) => setMobileCat(e.target.value)}>
          <option value="all">{t("全部分類")}</option>
          {groupTickers(items, categories).map((g) => (
            <option key={g.name} value={g.name}>
              {t("{0}（{1}）", [t(g.name), g.items.length])}
            </option>
          ))}
        </select>
      </div>

      <div className="wl-scroll" ref={listRef}>
        {total === 0 && <p className="muted pad small">{t("找不到「{0}」", [query])}</p>}
        {groups.map((g) => {
          // 搜尋時一律展開，才看得到結果
          const open = searching || !collapsed.includes(g.name);
          return (
            // 收合只在桌機版生效（用 CSS 隱藏）；手機版所有股票攤平成一排，不受影響
            <section key={g.name} className={`wl-group${open ? "" : " collapsed"}`}>
              <button type="button" className="wl-group-head" aria-expanded={open} onClick={() => toggle(g.name)} disabled={searching}>
                <span className="wl-caret" aria-hidden="true">
                  {open ? "▾" : "▸"}
                </span>
                {t(g.name)}
                <span className="muted">{g.items.length}</span>
              </button>
              <ul>
                {g.items.map((t) => {
                  const up = t.changePct >= 0;
                  const cls = up === redUp ? "num-red" : "num-green"; // 紅漲綠跌 / 綠漲紅跌
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
                        {t.spark && (
                          <span className="wl-spark">
                            <Sparkline values={t.spark} color={t.spark[t.spark.length - 1] >= t.spark[0] === redUp ? "var(--red)" : "var(--green)"} />
                          </span>
                        )}
                        <span className="wl-price num">{t.lastClose.toFixed(2)}</span>
                        <span className={`wl-chg num ${t.changePct === 0 ? "" : cls}`}>
                          {up ? "+" : ""}
                          {t.changePct.toFixed(2)}%
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </nav>
  );
}
