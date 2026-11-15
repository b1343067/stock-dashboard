// 最外層：頁首（含分頁導覽）＋ 目前的頁面 ＋ 頁尾免責聲明
// 頁面由網址 hash 決定（見 src/lib/route.ts）：
//   #/代號/週期 → 看盤頁（pages/ChartPage.tsx）
//   #/screener  → 指標篩選器（pages/ScreenerPage.tsx）
//   #/portfolio → 投資組合（pages/PortfolioPage.tsx）

import { useCallback, useEffect, useState } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ChartPage from "./pages/ChartPage";
import ScreenerPage from "./pages/ScreenerPage";
import PortfolioPage from "./pages/PortfolioPage";
import { loadIndex } from "./lib/data";
import { chartHref, useHashRoute } from "./lib/route";
import { useStoredState } from "./lib/storage";
import type { IndexData, Timeframe } from "./lib/types";

export default function App() {
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
  }, []);

  useEffect(() => {
    if (route.page === "chart" && route.symbol) setLastChart(chartHref(route.symbol, route.timeframe));
  }, [route]);

  // 換頁時捲回最上面（手機上特別需要）
  // 注意：要加大括號。新版 Chrome 的 scrollTo 會回傳 Promise，
  // 如果直接回傳給 useEffect，React 會把它當成清除函式去呼叫而出錯。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page]);

  const navigate = useCallback(
    (symbol: string, timeframe: Timeframe) => setRoute({ symbol, timeframe }),
    [setRoute],
  );

  return (
    <div className="app">
      <Header
        index={index}
        redUp={redUp}
        onToggleRedUp={() => setRedUp(!redUp)}
        page={route.page}
        chartHref={lastChart}
      />

      {index?.sample && (
        <div className="banner" role="status">
          目前顯示的是<b>隨機產生的範例資料</b>，不是真實股價。GitHub Actions 第一次成功更新後會自動換成真實資料。
        </div>
      )}

      <main className="main">
        {route.page === "screener" ? (
          <ScreenerPage redUp={redUp} />
        ) : route.page === "portfolio" ? (
          <PortfolioPage index={index} indexError={indexError} redUp={redUp} />
        ) : (
          <ChartPage index={index} indexError={indexError} route={route} navigate={navigate} redUp={redUp} />
        )}
      </main>

      <Footer />
    </div>
  );
}
