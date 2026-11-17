// 區塊三：重大新聞（只有標題、來源、時間、連結；點了開新分頁看原文，不轉載內文）

import { useState } from "react";
import { fmtPct } from "../../lib/format";
import type { NewsItem } from "../../lib/finnhub";
import { t } from "../../lib/i18n";
import { chartHref } from "../../lib/route";

interface Props {
  items: NewsItem[] | null;
  failed: boolean;
  loading: boolean;
  movers: { symbol: string; changePct: number }[];
  nowSec: number;
}

function ago(sec: number, now: number): string {
  const h = Math.floor((now - sec) / 3600);
  if (h < 1) return t("{0} 分鐘前", [Math.max(1, Math.floor((now - sec) / 60))]);
  return t("{0} 小時前", [h]);
}

function NewsLink({ n, now }: { n: NewsItem; now: number }) {
  return (
    <li className="news-item">
      {n.symbol && <span className="news-sym">{n.symbol}</span>}
      <a href={n.url} target="_blank" rel="noopener noreferrer" className="news-title">
        {n.headline}
      </a>
      <span className="muted small news-meta">
        {n.source} · {ago(n.datetime, now)}
      </span>
    </li>
  );
}

export default function NewsPanel({ items, failed, loading, movers, nowSec }: Props) {
  const list = items ?? [];
  const moverSet = new Set(movers.map((m) => m.symbol));
  const others = list.filter((n) => !n.symbol || !moverSet.has(n.symbol));
  // 持股＋有新訊號的股票加起來新聞可能幾十則：先顯示 12 則，其餘按「顯示全部」
  const [all, setAll] = useState(false);
  const shown = all ? others : others.slice(0, 12);
  return (
    <section className="card" aria-labelledby="today-news">
      <h2 id="today-news" className="section-title">{t("重大新聞")}</h2>

      {movers.length > 0 && (
        <div className="movers">
          {/* 有相關新聞的：一檔一個框，附新聞 */}
          {movers
            .filter((m) => list.some((n) => n.symbol === m.symbol))
            .map((m) => (
              <div key={m.symbol} className="mover-box">
                <div className="mover-head">
                  <span className="abn-badge">{t("異常波動")}</span>
                  <a href={chartHref(m.symbol)} className="sig-sym">{m.symbol}</a>
                  <span className="num">{fmtPct(m.changePct, 2, true)}</span>
                </div>
                <ul className="news-list">
                  {list
                    .filter((n) => n.symbol === m.symbol)
                    .map((n) => (
                      <NewsLink key={n.id} n={n} now={nowSec} />
                    ))}
                </ul>
              </div>
            ))}
          {/* 沒有新聞的（例如台股）：擠在同一行，不佔版面 */}
          {movers.some((m) => !list.some((n) => n.symbol === m.symbol)) && (
            <p className="mover-chips">
              <span className="abn-badge">{t("異常波動")}</span>
              {movers
                .filter((m) => !list.some((n) => n.symbol === m.symbol))
                .map((m) => (
                  <a key={m.symbol} href={chartHref(m.symbol)} className="mover-chip num">
                    {m.symbol} {fmtPct(m.changePct, 1, true)}
                  </a>
                ))}
              <span className="muted small">{t("（沒有相關新聞）")}</span>
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p className="muted">{t("讀取新聞中…")}</p>
      ) : failed ? (
        <p className="muted">{t("新聞暫時無法取得。")}</p>
      ) : others.length === 0 ? (
        <p className="muted">{t("持股與有新訊號的股票，最近 24 小時沒有新聞。")}</p>
      ) : (
        <>
          <ul className="news-list">{shown.map((n) => <NewsLink key={n.id} n={n} now={nowSec} />)}</ul>
          {others.length > 12 && (
            <button type="button" className="btn-link small news-more" onClick={() => setAll(!all)}>
              {all ? t("收起") : t("顯示全部 {0} 則", [others.length])}
            </button>
          )}
        </>
      )}
      <p className="hint">{t("持股與有新訊號的美股，最近 24 小時的新聞（Finnhub）。只顯示標題，點擊在新分頁開啟原文。")}</p>
    </section>
  );
}
