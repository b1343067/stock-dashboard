// 區塊二：今日訊號變化（偏多／危險兩欄；持股排最前面；盤中預估另外標示）

import { useState } from "react";
import { t } from "../../lib/i18n";
import { chartHref } from "../../lib/route";
import type { SignalEvent } from "../../lib/today";

interface Props {
  bull: SignalEvent[];
  danger: SignalEvent[];
  holdings: Set<string>;
  loading: boolean;
}

function when(e: SignalEvent): string {
  if (e.intraday) return t("盤中預估");
  if (e.tf === "weekly") return t("本週");
  return e.barsAgo === 0 ? t("最新收盤") : t("{0} 天前", [e.barsAgo]);
}

function Column({ title, tone, events, holdings }: { title: string; tone: "bull" | "danger"; events: SignalEvent[]; holdings: Set<string> }) {
  const [all, setAll] = useState(false);
  const intraday = events.filter((e) => e.intraday);
  const closed = events.filter((e) => !e.intraday);
  const shown = all ? closed : closed.slice(0, 12);
  const item = (e: SignalEvent, i: number) => (
    <li key={`${e.symbol}-${e.label}-${i}`} className={holdings.has(e.symbol) ? "mine" : ""}>
      {holdings.has(e.symbol) && <span className="mine-star" title={t("持股")} aria-label={t("持股")}>★</span>}
      <a className="sig-sym" href={chartHref(e.symbol)}>{e.symbol}</a>
      <span className="sig-label">{t(e.label)}</span>
      <span className="sig-when muted small">{when(e)}</span>
    </li>
  );
  return (
    <div className={`sig-col sig-${tone}`}>
      <h3 className="sig-title">
        {title} <span className="muted small">{t("{0} 項", [events.length])}</span>
      </h3>
      {intraday.length > 0 && (
        <div className="sig-intraday">
          <p className="sig-intraday-note small">{t("⏱ 盤中預估：以目前價格當作今天收盤估算，收盤後才確定")}</p>
          <ul className="sig-list">{intraday.map(item)}</ul>
        </div>
      )}
      {closed.length === 0 && intraday.length === 0 ? (
        <p className="muted small">{t("最近 3 天沒有新訊號")}</p>
      ) : (
        <ul className="sig-list">{shown.map(item)}</ul>
      )}
      {closed.length > 12 && (
        <button type="button" className="btn-link small" onClick={() => setAll(!all)}>
          {all ? t("收起") : t("顯示全部 {0} 項", [closed.length])}
        </button>
      )}
    </div>
  );
}

export default function SignalBoard({ bull, danger, holdings, loading }: Props) {
  return (
    <section className="card" aria-labelledby="today-signals">
      <h2 id="today-signals" className="section-title">{t("今日訊號變化")}</h2>
      {loading ? (
        <p className="muted">{t("載入中…")}</p>
      ) : (
        <div className="sig-grid">
          <Column title={t("偏多")} tone="bull" events={bull} holdings={holdings} />
          <Column title={t("危險")} tone="danger" events={danger} holdings={holdings} />
        </div>
      )}
      <p className="hint">{t("觀察清單 49 檔最近 3 天新出現的訊號（日線收盤資料；週線只看 MACD）。★ = 持股。訊號只描述指標狀態，不是買賣建議。")}</p>
    </section>
  );
}
