// 最外層：頁首（含分頁導覽）＋ 目前的頁面 ＋ 頁尾免責聲明
// 頁面由網址 hash 決定（見 src/lib/route.ts）：
//   （空白）／#/today → 今日總覽（pages/TodayPage.tsx，網站打開的第一頁）
//   #/market    → 市場總覽（pages/MarketPage.tsx）
//   #/lab       → ML 實驗室（pages/LabPage.tsx）
//   #/office    → AI 投研辦公室（pages/OfficePage.tsx）
//   #/代號/週期 → 看盤頁（pages/ChartPage.tsx）
//   #/compare/A,B → 多檔走勢比較（pages/ComparePage.tsx）
//   #/screener  → 指標篩選器（pages/ScreenerPage.tsx）
//   #/portfolio → 投資組合（pages/PortfolioPage.tsx）
//   #/analysis  → 組合分析（pages/AnalysisPage.tsx）

import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import BottomNav from "./components/BottomNav";
import AlertBanner from "./components/AlertBanner";
// 各頁面「用到才下載」（程式碼分割）：打開看盤頁時不會下載組合分析的程式，首次載入比較快。
// lightweight-charts 也會被拆成獨立檔案，只有需要畫圖的頁面才載入。
const TodayPage = lazy(() => import("./pages/TodayPage"));
const MarketPage = lazy(() => import("./pages/MarketPage"));
const LabPage = lazy(() => import("./pages/LabPage"));
const OfficePage = lazy(() => import("./pages/OfficePage"));
const ChartPage = lazy(() => import("./pages/ChartPage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const ScreenerPage = lazy(() => import("./pages/ScreenerPage"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const AnalysisPage = lazy(() => import("./pages/AnalysisPage"));
// 提醒面板只有打開時才需要
const AlertsPanel = lazy(() => import("./components/AlertsPanel"));
import { loadIndex } from "./lib/data";
import { checkFreshness } from "./lib/freshness";
import { alertState } from "./lib/alerts";
import { useAlertQuotes, useAlerts } from "./lib/alertsStore";
import { chartHref, useHashRoute } from "./lib/route";
import { useStoredState } from "./lib/storage";
import type { IndexData, Timeframe } from "./lib/types";
import { t, useLang } from "./lib/i18n";

export default function App() {
  // 語言切換時，下面的畫面用 key 整個重新建立：每個元件都會用新語言重新顯示
  // （包括 useMemo 裡算好的文字、圖表的日期格式），比逐一追蹤哪裡用到文字可靠
  const lang = useLang();
  const [index, setIndex] = useState<IndexData | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [route, setRoute] = useHashRoute();
  const [redUp, setRedUp] = useStoredState("redUp", true);
  // 記住最後看的股票，從篩選器切回「看盤」時回到同一檔
  const [lastChart, setLastChart] = useState<string>(() => chartHref(route.symbol ?? "", route.timeframe));

  // 讀取總表
  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((e: unknown) => setIndexError(e instanceof Error ? e.message : String(e)));
  }, [lang]); // 切換語言時重新讀取（股票名稱換成該語言）

  useEffect(() => {
    if (route.page === "chart" && route.symbol) setLastChart(chartHref(route.symbol, route.timeframe));
  }, [route]);

  // 換頁時捲回最上面（手機上特別需要）
  // 注意：要加大括號。新版 Chrome 的 scrollTo 會回傳 Promise，
  // 如果直接回傳給 useEffect，React 會把它當成清除函式去呼叫而出錯。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page]);

  // 離線偵測：沒網路時顯示提示（Service Worker 會提供上次存下來的資料）
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // 資料過期檢查（Actions 連續失敗時提醒）
  const freshness = useMemo(() => (index ? checkFreshness(index.tickers.map((t) => t.lastDate)) : null), [index]);

  // 價格提醒：每次打開網站（或資料更新後）用最新資料檢查
  const alerts = useAlerts();
  const quotes = useAlertQuotes(index, alerts);
  const triggered = useMemo(() => alerts.filter((a) => alertState(a, quotes[a.symbol]) === "triggered"), [alerts, quotes]);
  // 提醒面板：null = 關閉；prefill = 從看盤頁「＋提醒」打開時帶入股票與現價
  const [alertPanel, setAlertPanel] = useState<null | { prefill: { symbol: string; price: number } | null }>(null);
  const openAlerts = useCallback((prefill: { symbol: string; price: number } | null = null) => setAlertPanel({ prefill }), []);
  const closeAlerts = useCallback(() => setAlertPanel(null), []);

  const navigate = useCallback(
    (symbol: string, timeframe: Timeframe) => setRoute({ symbol, timeframe }),
    [setRoute],
  );

  return (
    <div className="app" key={lang}>
      <Header
        index={index}
        redUp={redUp}
        onToggleRedUp={() => setRedUp(!redUp)}
        page={route.page}
        chartHref={lastChart}
        onPickSymbol={(s) => navigate(s, route.page === "chart" ? route.timeframe : "daily")}
        alertCount={triggered.length}
        onOpenAlerts={() => openAlerts()}
      />

      <AlertBanner triggered={triggered} quotes={quotes} onOpen={() => openAlerts()} />

      {!online && (
        <div className="banner offline-banner" role="status">
          {t("📴 目前離線，顯示的是上次載入的資料；恢復網路後會自動使用最新資料。")}
        </div>
      )}

      {freshness?.stale && !index?.sample && (
        <div className="banner" role="alert">
          ⚠️ <b>{t("資料可能已過期")}</b>{t("：最新資料日期為")}{" "}{freshness.latestDate}{t("，之後已有")}{" "}{freshness.missed} {" "}{t("個平日沒有更新。 可能是每日更新的 GitHub Actions 失敗了，價格與指標僅供參考。")}
        </div>
      )}

      {index?.sample && (
        <div className="banner" role="status">
          {t("目前顯示的是")}<b>{t("隨機產生的範例資料")}</b>{t("，不是真實股價。GitHub Actions 第一次成功更新後會自動換成真實資料。")}
        </div>
      )}

      <main className="main">
        <Suspense fallback={<div className="card"><p className="muted empty">{t("載入中…")}</p></div>}>
          {route.page === "today" ? (
            <TodayPage index={index} indexError={indexError} redUp={redUp} />
          ) : route.page === "lab" ? (
            <LabPage />
          ) : route.page === "office" ? (
            <OfficePage redUp={redUp} />
          ) : route.page === "market" ? (
            <MarketPage index={index} indexError={indexError} redUp={redUp} />
          ) : route.page === "compare" ? (
            <ComparePage index={index} symbolsParam={route.symbol} redUp={redUp} />
          ) : route.page === "screener" ? (
            <ScreenerPage redUp={redUp} />
          ) : route.page === "portfolio" ? (
            <PortfolioPage index={index} indexError={indexError} redUp={redUp} />
          ) : route.page === "analysis" ? (
            <AnalysisPage index={index} redUp={redUp} />
          ) : (
            <ChartPage
              index={index}
              indexError={indexError}
              route={route}
              navigate={navigate}
              redUp={redUp}
              onAddAlert={(symbol, price) => openAlerts({ symbol, price })}
            />
          )}
        </Suspense>
      </main>

      <Footer />
      <BottomNav page={route.page} chartHref={lastChart} />

      {alertPanel && (
        <Suspense fallback={null}>
          <AlertsPanel tickers={index?.tickers ?? []} quotes={quotes} prefill={alertPanel.prefill} onClose={closeAlerts} />
        </Suspense>
      )}
    </div>
  );
}
