// 今日總覽（首頁）：一打開就看到
//   1. 持股即時損益（最上面）  2. 今日訊號變化  3. 重大新聞  4. 財報提醒
// 計算都在 src/lib/today.ts；即時資料由 src/lib/live.ts 呼叫自己網站的 /api（Vercel 函式）。
// ⚠️ 持股只存在瀏覽器：送給 /api 的只有股票代號，沒有股數和成本。

import { useEffect, useMemo, useState } from "react";
import EarningsPanel from "../components/today/EarningsPanel";
import HoldingsLive from "../components/today/HoldingsLive";
import RegimeBar from "../components/RegimeBar";
import NewsPanel from "../components/today/NewsPanel";
import SignalBoard from "../components/today/SignalBoard";
import notifyConfig from "../../config/notify.json";
import { loadScreener } from "../lib/data";
import { t } from "../lib/i18n";
import { useEarnings, useLiveQuotes, useNews } from "../lib/live";
import { sanitizeNotifyConfig } from "../lib/notify";
import { loadHoldings, loadSettings } from "../lib/portfolioStore";
import type { ScreenerData } from "../lib/screener";
import { bigMovers, intradayEvents, liveHoldings, newsTargets, recentEvents, sortEvents, type SignalEvent } from "../lib/today";
import type { IndexData } from "../lib/types";

interface Props {
  index: IndexData | null;
  indexError: string | null;
  redUp: boolean;
}

const isUs = (s: string) => !/\.TWO?$/i.test(s);

/** 使用者當地的今天 YYYY-MM-DD */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TodayPage({ index, indexError, redUp }: Props) {
  const [{ holdings, isSample }] = useState(loadHoldings);
  const [settings] = useState(loadSettings);
  // 選項 A：沒有自己的持股（範例或空的）就當作沒有，顯示提示
  const mine = useMemo(() => (isSample ? [] : holdings), [holdings, isSample]);
  const holdingSet = useMemo(() => new Set(mine.map((h) => h.symbol)), [mine]);
  // 關注清單：和每日 Discord 通知共用 config/notify.json 的 watch
  const watch = useMemo(() => sanitizeNotifyConfig(notifyConfig).watch, []);

  const [screener, setScreener] = useState<ScreenerData | null>(null);
  const [screenerError, setScreenerError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadScreener()
      .then((d) => {
        if (!cancelled) setScreener(d);
      })
      .catch(() => {
        if (!cancelled) setScreenerError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 即時報價只查「持股＋關注清單」的美股（Finnhub 免費額度有限；台股用收盤資料）
  const liveSymbols = useMemo(() => [...new Set([...mine.map((h) => h.symbol), ...watch])].filter(isUs).sort(), [mine, watch]);
  const live = useLiveQuotes(liveSymbols);

  const fx = index?.fx ?? {};
  const summary = useMemo(
    () => (mine.length > 0 && index ? liveHoldings(mine, index.tickers, live.quotes, index.fx ?? {}, settings) : null),
    [mine, index, live.quotes, settings],
  );

  // 訊號：49 檔的收盤資料 ＋ 有即時價的股票做盤中預估
  const events = useMemo(() => {
    if (!screener) return { bull: [] as SignalEvent[], danger: [] as SignalEvent[] };
    const all: SignalEvent[] = [];
    for (const tk of screener.tickers) {
      all.push(...recentEvents(tk));
      const q = live.quotes[tk.symbol];
      if (q) all.push(...intradayEvents(tk, q));
    }
    const sorted = sortEvents(all, holdingSet);
    return { bull: sorted.filter((e) => e.tone === "bull"), danger: sorted.filter((e) => e.tone === "danger") };
  }, [screener, live.quotes, holdingSet]);

  // 異常波動：只看持股與關注清單（全部 49 檔都列的話，台股大跌的日子會列一長串、而且沒有新聞）
  const movers = useMemo(() => bigMovers(index?.tickers ?? [], live.quotes, new Set([...holdingSet, ...watch])), [index, live.quotes, holdingSet, watch]);

  // 新聞：持股 → 異常波動 → 最近 1 天內有新訊號的（只查美股）
  const recentSignalSymbols = useMemo(
    () => [...events.danger, ...events.bull].filter((e) => e.intraday || e.barsAgo <= 1).map((e) => e.symbol),
    [events],
  );
  // 等股票清單和篩選資料都載入後才查（否則會先用不完整的清單查一次、再查一次，浪費 API 額度）
  const newsSymbols = useMemo(
    () => (index && screener ? newsTargets([...holdingSet].sort(), movers.map((m) => m.symbol), recentSignalSymbols) : []),
    [index, screener, holdingSet, movers, recentSignalSymbols],
  );
  const news = useNews(newsSymbols);

  // 財報：持股＋觀察清單（美股）
  const earningsSymbols = useMemo(
    () => (index ? [...new Set([...mine.map((h) => h.symbol), ...index.tickers.map((tk) => tk.symbol)])].filter(isUs).sort() : []),
    [mine, index],
  );
  const earnings = useEarnings(earningsSymbols);

  return (
    <div className="today">
      <div className="market-head">
        <div>
          <h2>{t("今日總覽")}</h2>
          <p className="muted small">{t("持股即時損益、觀察清單的新訊號、相關新聞與財報提醒")}</p>
        </div>
      </div>
      {indexError && <p className="error">{t("無法讀取股票清單：{0}", [indexError])}</p>}
      <RegimeBar />

      <HoldingsLive summary={summary} settings={settings} fx={fx} redUp={redUp} status={summary ? live.status : "idle"} updatedAt={live.updatedAt} />

      {screenerError ? (
        <p className="error card">{t("篩選資料讀取失敗：{0}", ["screener.json"])}</p>
      ) : (
        <SignalBoard bull={events.bull} danger={events.danger} holdings={holdingSet} loading={!screener} />
      )}

      <div className="today-grid">
        <NewsPanel items={news.data?.items ?? null} failed={news.failed} loading={news.loading} movers={movers} nowSec={Math.floor(Date.now() / 1000)} />
        <EarningsPanel items={earnings.data?.items ?? null} failed={earnings.failed} loading={earnings.loading} holdings={holdingSet} today={localToday()} />
      </div>
    </div>
  );
}
