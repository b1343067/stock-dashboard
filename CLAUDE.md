# CLAUDE.md — 專案規則與架構

個人投資看盤網站（求職作品集）。純靜態：Python 預先算指標存 JSON → Vite/React 前端讀 JSON 畫圖 → Vercel 部署。
線上：https://stock-dashboard-peach-sigma.vercel.app/ ・ 儲存庫：https://github.com/b1343067/stock-dashboard（公開）

## 必守規則

1. **儲存庫是公開的：絕對不可以把真實持股資料寫進程式碼、設定檔、資料檔或截圖。** 預設持倉、測試資料、README 截圖一律用明顯的範例資料。使用者的持股只存在瀏覽器 localStorage。
2. **註解用繁體中文**；介面文字用繁體中文，並用 `t("中文")` 包起來、在 `src/lib/i18n-en.ts` 加英文（`i18n.test.ts` 會檢查漏翻）。使用者程式基礎普通，註解要說明「為什麼」，不要只寫「做什麼」。
3. **網頁不能壞掉**：所有資料讀取都要能處理失敗（顯示提示，不要 throw 到最上層）；localStorage 讀寫要包 try/catch。
4. **資料更新失敗要保留舊檔**：不可以用空資料或部分資料覆蓋資料檔。寫檔用 `data_io.write_json_atomic`。
5. **價格四捨五入到小數 2 位**（MACD 系列 4 位），NaN 輸出為 `null`。
6. 每一頁最下方要有免責聲明「本網站僅供學習參考，非投資建議」（在 `Footer.tsx`）。
7. 手機要能正常瀏覽（≤ 860px 單欄、≤ 480px 再縮）；不能出現橫向捲軸（E2E 測試會檢查）。
8. 開發環境可能連不到 Yahoo Finance：不要依賴在本機實際抓資料，用 `scripts/generate_sample_data.py` 產生範例資料，或用假的 yfinance 模組測試 `fetch_data.py`。
9. 改完前端一定要跑 `npm test`、`npm run build`、`npm run test:e2e` 確認成功；改了指標要跑 `python scripts/test_indicators.py`。
10. **資料不放 main**：`public/data/` 已列入 .gitignore，資料在 `data` 分支（Actions 每次強制推送、只留一個 commit）。本機用 `npm run data:pull` 下載，不要把資料 commit 回 main。
11. `useEffect` 一律用大括號寫法，不要 `useEffect(() => someCall(), ...)`：新版 Chrome 的 `window.scrollTo` 等 API 會回傳 Promise，被 React 當成清除函式呼叫會讓整頁出錯（第二階段踩過）。
12. 判斷與計算邏輯寫成 `src/lib/` 裡的純函式並加 Vitest 測試，元件只負責顯示。
13. 新頁面要用 `React.lazy` 載入（見 `App.tsx`），不要直接 import，避免首頁變大。

## 工作流程

- 在功能分支開發 → 測試全過 → 合併進 `main` 並推送 → Vercel 自動部署 → 打開線上網站確認。
- `main` 常有 Actions 的資料 commit，合併前先 `git fetch origin main` 並 rebase。
- 本環境已允許連線 `stock-dashboard-peach-sigma.vercel.app`，可直接用 Playwright 檢查線上版本。

## 架構

### 資料（Python，`scripts/`）
- `config/watchlist.json`：觀察清單（唯一來源，使用者自己會改），格式 `groups: [{name, tickers: [{symbol, name, nameEn?, currency?}]}]`（nameEn 選填，英文模式顯示用，會帶到 index／screener／個股檔）；另有匯率代號 `fx`、無風險利率代號 `riskFree`（^IRX）。幣別依代號自動判斷（.TW/.TWO = TWD）
- `scripts/indicators.py`：**所有指標計算**（MA、Wilder RSI、MACD、布林、週月線 resample、輸出 JSON 結構）
- `scripts/data_io.py`：`load_watchlist()`→`normalize_watchlist()`（攤平成 tickers＋categories、去重、推斷幣別、相容舊格式）、原子寫檔、重建 `index.json` 與 `screener.json`（依磁碟上現存檔案；名稱與分類以設定檔為準；`generated_at` 可沿用舊時間）
- `scripts/data_quality.py`：`to_exchange_dates()`（先換成交易所時區再取日期，避免台美差一天）、`repair_daily()`（少量問題自動修：高低價、台股週六補班日、零星空白／≤0，比例上限 5%）、`validate_daily()`（剩下的嚴重問題 → 不寫檔）
- `scripts/fetch_data.py`：每批 10 檔、批次間休息；每檔重試 3 次（2/4/8 秒）＋下載失敗者最後再一輪；`process_symbol()` 吃掉所有錯誤，單檔失敗不中斷；匯率歷史寫 `fx.json`；全部失敗 exit 1 且不寫檔。測試時設 `FETCH_SLEEP_SCALE=0` 跳過等待
- `scripts/generate_sample_data.py`：固定種子的隨機漫步範例資料，`sample: true`（會覆蓋 public/data）；`--missing-only` 只補沒有資料檔的股票（本機預覽用，不要 commit）
- `.github/workflows/update-data.yml`：cron `0 22 * * *`（台灣 06:00）、手動觸發、改到 config/scripts 推到 main 時也會跑。流程：從 data 分支取回舊資料 → 抓取 → 強制推送 data 分支（單一 commit）→ 改 main 的 `.data-version` 觸發 Vercel
- `scripts/pull-data.sh`：從 codeload 下載 data 分支到 `public/data`（Vercel buildCommand、CI、`npm run data:pull` 都用它）；失敗回傳錯誤 → Vercel 建置失敗、線上維持上一版。`DATA_URL` 可覆蓋網址（測試用）
- `public/data/status.json`：每次更新每檔的結果（ok／download／invalid）、原因、自動修正內容；線上 `/data/status.json` 可直接看
- `vercel.json`：`git.deploymentEnabled.data = false`（data 分支不部署）
- `.github/workflows/ci.yml`：先 `pull-data.sh` 下載資料，再跑單元測試＋建置＋Python 測試；另一個 job 跑 Playwright E2E（失敗時上傳報告）；`.data-version` 的 commit 不觸發

### 前端（`src/`）
- `App.tsx`：外殼（Header 分頁、資料過期／範例資料 banner、Footer），依 `route.page` 以 `React.lazy` 載入 `pages/` 的頁面
- `lib/route.ts`：hash 路由：空白或 `#/market`（市場總覽，預設首頁）、`#/代號/週期`（daily|weekly|monthly；`#//daily` = 選第一檔）、`#/screener`、`#/portfolio`、`#/analysis`；`chartHref()` 產生看圖連結（測試在 route.test.ts）
- `lib/types.ts`：**JSON 格式的 TypeScript 定義，改 Python 輸出時必須同步修改**
- `lib/data.ts`：讀 JSON（帶快取、驗證）：`loadIndex`、`loadTicker`、`loadScreener`、`loadFxHistory`（沒有檔案回傳 null）
- `lib/freshness.ts`：`checkFreshness()`，最新資料落後 3 個平日以上就在頁首提醒
- `lib/watchlist.ts`：`groupTickers`（依設定檔分類順序分組＋搜尋）、`filterByCategory`；`components/Watchlist.tsx` 桌機分組可收合、手機攤平成一排＋分類下拉選單
- 按需載入：首頁只讀 `index.json`＋目前那一檔；篩選器讀 `screener.json`；分析頁只讀持股與 VOO。**不要在首頁一次載入所有股票**
- `lib/storage.ts`：`useStoredState(key, default)`、`readStorage`／`writeStorage`，key 自動加前綴 `stockdash:`
- `lib/theme.ts`：從 CSS 變數讀圖表顏色；顏色只在 `styles.css` 的 `:root` 定義（`--s1`／`--s2` 類別色、`--div-*` 發散色，已用資料視覺化指引的驗證工具檢查過）
- `lib/format.ts`：`fmtMoney`／`fmtPct`／`fmtFixed`／`pnlClass`（漲跌顏色跟著 redUp）
- 看盤：`pages/ChartPage.tsx`（報價標頭）、`components/StockChart.tsx`（lightweight-charts v5；MACD／RSI 窗格展開才建立；趨勢外推虛線）、`components/StatusCards.tsx`＋`lib/signals.ts`（白話狀態卡）、`components/TrendCard.tsx`、`components/Sparkline.tsx`（觀察清單迷你走勢，資料來自 `index.json` 的 `spark`）
- 頁首：`components/Header.tsx`（分頁、快速搜尋、提醒鈴鐺、紅漲綠跌、深淺色）、`components/BottomNav.tsx`（手機，5 個分頁）
- 畫圖工具：`lib/drawings.ts`（`handleClick`、`sanitizeDrawings`、key `drawings:代號:週期`）、`components/DrawingTools.tsx`；StockChart 用**容器的原生 click 事件**＋`coordinateToLogical`／`coordinateToPrice` 換算（`chart.subscribeClick` 連點時會被當成雙擊而漏掉），並忽略拖曳（移動 > 5px）；畫的線 `autoscaleInfoProvider: () => null` 不影響 Y 軸。ChartPage 不用 `useStoredState`（key 隨股票變動時它不會重讀）
- 基本面：`scripts/fundamentals.py`（`price_stats` 從日線算 52 週高低與 TTM 殖利率；`clean_info` 讀 `Ticker.info`；`merge_fundamentals` 抓不到時沿用上次與 `infoDate`；`FETCH_INFO=0` 可跳過）；前端 `lib/fundamentals.ts`、`components/FundamentalsCard.tsx`；篩選器基本面條件 `peBelow`／`yieldAbove`／`near52High`／`near52Low`（`KIND_META.noTf`，不顯示週期）
- 走勢比較：`pages/ComparePage.tsx`＋`lib/compare.ts`（`normalize`／`compareStats`／`parseSymbols`），路由 `#/compare/A,B`（route.symbol 放逗號字串），最多 4 檔；線色 `--s1`～`--s4`（已用驗證工具檢查，淺色背景下黃綠對比 < 3:1，所以一定要有直接標籤＋表格）
- 效率前緣：`analytics.ts` 的 `simulatePortfolios`（固定種子亂數＋投影到 5%～45%）、`frontierEnvelope`；`components/analysis/FrontierChart.tsx`（SVG，標籤依兩點相對位置擺放避免重疊）
- PWA：`public/manifest.webmanifest`、`public/icons/`、`public/sw.js`（手寫：頁面與 /data 網路優先、/assets 快取優先；**改快取策略時要改 cache 名稱版本**）；main.tsx 只在 PROD 註冊；App 有離線提示
- 市場總覽：`pages/MarketPage.tsx`＋`lib/market.ts`（`periodChange`／`breadth`／`topMovers`／`categoryStats`／`heatIntensity`）；只用 index.json（含 spark 算 30 天漲跌），**首頁不可下載個股檔案**（E2E 檢查）
- 價格提醒：`lib/alerts.ts`（條件、`evaluateAlert`、`alertState`、`acknowledge`）、`lib/alertsStore.ts`（`useSyncExternalStore` 共用狀態、`useAlertQuotes`：只有 RSI 提醒時才載入 screener.json）、`components/AlertsPanel.tsx`（lazy，桌機右側／手機底部滑出）、`components/AlertBanner.tsx`；App 統一計算 triggered
- 篩選器：`lib/screener.ts`（條件型別、`evaluateCondition`、`runScreen`、`sanitizeConditions`、內建範例組合；均線交叉 `maCrossUp/Down` 用 `ma`＋`ma2`、成交量 `volSpike` 用 screener.json 的 `volume`，平均不含最新一根）、`pages/ScreenerPage.tsx`、`components/screener/`
- 每日 Discord 通知：`config/notify.json`（公開檔案，只放關注清單與條件、不放持股：`benchmarks`、`exclude`（使用者不想看 0050）、`topMovers`、`watch`、`bigMovePct`、`near52wPct`、`priceAlerts`（穿越才通知）、`danger`／`rules` 規則＝篩選器條件格式）→ `scripts/notify.ts`（Actions 用 `npx vite-node` 執行）＋`lib/notify.ts` 純函式（`sanitizeNotifyConfig`、`evaluateSignals` 依股票合併並和昨天比較標 🆕、`findAlerts` 特別注意、`stockLine` 用 signals.ts 的狀態、`buildMessages` 產生 Discord embed：第 1 則 🚨 特別注意（有大事才有）、第 2 則 📊 市場／👀 關注／⚠️ 危險／✅ 偏多（0 檔不列），超過 6000 字拆則）。使用者要的是「精簡卡片＋危險股票也要列出」。紀錄存 `public/data/notify-state.json`（同一個資料日期只通知一次；`NOTIFY_FORCE=1` 強制，手動執行「更新股價資料」時自動帶入；`NOTIFY_STRICT=1` 失敗時結束碼 1）；`.github/workflows/notify-test.yml`「測試 Discord 通知」只下載 data 分支＋強制送出；Webhook 在 GitHub Secret `DISCORD_WEBHOOK_URL`（已設定）；範例資料不通知。篩選器新增事件型條件 `priceCrossUpMa`／`priceCrossDownMa`、`rsiDrop`
- 投資組合：`lib/portfolio.ts`（`computePortfolio`、`toUsd`、`stopStatus`、`sanitizeHoldings`、`parseImport`／`buildExport`、`sampleHoldings`）、`lib/portfolioStore.ts`（讀 localStorage，分析頁共用）、`pages/PortfolioPage.tsx`、`components/portfolio/`
- 多語系（加碼 C-2）：`lib/i18n.ts`（`t(中文原文, [參數])` 依 `{0}{1}` 代入、`getLang`／`setLang`／`useLang`、`locale()` 給數字與圖表日期格式）、`lib/i18n-en.ts` 英文對照表（key = 中文原文，查不到就顯示中文）。**模組最上層的常數不能呼叫 t()**（載入時就決定了），要在顯示的地方 `t(常數)`；`i18n.test.ts` 會檢查所有 `t("…")`、條件名稱、分類名稱都有英文。App 用 `key={lang}` 讓切換語言時整個畫面重建；`data.ts` 的 `localizeName` 在英文模式把 `name` 換成設定檔的 `nameEn`。E2E 固定 `locale: "zh-TW"`，英文版在 `e2e/i18n.spec.ts`（用英文瀏覽器打開每一頁、確認沒有中文殘留）。少數依語言不同的格式直接判斷 `getLang()`：市值單位（兆億／T B）、K 線週期按鈕（日週月／D W M）、漲跌色按鈕（漲跌／▲▼）
- 交易紀錄（加碼 C）：`lib/transactions.ts`（`buildLedger` 移動平均成本法、`positionsToHoldings`、`xirr` 牛頓＋二分、`positionStats`、`totals` 台股每筆依當天 `fxAt` 匯率換美元、`sanitizeTransactions`、`sampleTransactions`）、`components/portfolio/TransactionsPanel.tsx`／`TransactionForm.tsx`；`portfolioStore.loadHoldings()` 依 `portfolio:mode` 回傳交易計算出的持股（分析頁共用），交易模式下 `portfolio:holdings` 只當「類型／停利停損」設定用（HoldingForm `metaOnly`）
- 組合分析：`lib/analytics.ts`（`convertToUsd`、`alignSeries`、`analyze`、`maxSharpe`、`buyAndHold`、`backtestStats`）、`pages/AnalysisPage.tsx`、`components/analysis/`
- 趨勢外推：`lib/trend.ts`（線性回歸、`nextTradingDays`、`backtestAccuracy`）。**`NYSE_HOLIDAYS` 寫死到 2027 年，每年要補下一年**

### 測試
- 單元測試：`src/lib/*.test.ts`（Vitest，`npm test`，只跑 src）。`selfcheck.test.ts` 讀真實 `public/data`：VOO 對自己 Beta／相關＝1、每檔日期遞增無週末（沒有資料時自動跳過）
- E2E：`e2e/*.spec.ts`（Playwright 1.63，`npm run test:e2e`，自動啟動 `vite preview`；desktop 專案跑沒標 `@mobile` 的、mobile 專案只跑 `@mobile`）
- Playwright 預設 `serviceWorkers: "block"`（SW 會繞過 page.route 的模擬）；只有 `pwa.spec.ts` 用 `test.use({ serviceWorkers: "allow" })` 測離線
- E2E 用 `trackErrors(page)` 收集錯誤，結尾 `expectNoErrors()`；測試不可依賴每天變動的價格數值，只檢查結構與邏輯
- ⚠️ Playwright 上傳檔案（`setInputFiles`）要用純英文路徑（例如 `mkdtempSync(join(tmpdir(), ...))`）；`testInfo.outputPath()` 的資料夾名稱含中文與「：」「→」，上傳會靜靜失敗

## 資料格式

- `public/data/<代號>.json`：`{symbol,name,currency,sample,lastDate,lastClose,changePct,daily,weekly,monthly,fundamentals?}`（fundamentals 見 `types.ts` 的 `Fundamentals`），每個週期為欄位導向物件：`time,open,high,low,close,volume,ma10,ma20,ma50,ma200,rsi,macd,signal,hist,bbUpper,bbMiddle,bbLower`。日線保留最近 1260 筆（指標先用完整 10 年算再截斷），週／月線保留全部。
- `public/data/index.json`：`{generatedAt,sample,fx:{USDTWD},riskFree,categories:[...],tickers:[{symbol,name,currency,category,lastDate,lastClose,changePct,sample,spark:[最近 30 天收盤]}]}`（riskFree 為年化小數，抓不到沿用上次）
- `public/data/screener.json`：`{generatedAt,bars:30,tickers:[{symbol,name,currency,category,lastDate,lastClose,changePct,daily,weekly,monthly,fundamentals?:{pe,forwardPe,pb,dividendYield,high52w,low52w}}]}`，每週期只有 time/close/volume/ma*/rsi/macd/signal/hist/bb* 的最近 30 筆
- `public/data/fx.json`：`{USDTWD:{time,close}}`；沒有時分析頁用最新匯率近似並提示

### localStorage key（都有 `stockdash:` 前綴）
- 投資組合：`portfolio:holdings`、`portfolio:settings`、`portfolio:isSample`（沒有 holdings key 時顯示範例持股）、`portfolio:mode`（holdings｜transactions）、`portfolio:transactions`（`[{id,date,symbol,type:buy|sell|dividend,shares,price,fee,amount}]`）
- 篩選器：`screener:current`（目前條件＋AND/OR＋分類範圍 `category`）、`screener:presets`（我的組合）
- 分析：`analysis:period`、`analysis:source`
- 介面：`lang`（zh｜en）、`overlays`（含 ma10/20/50/200、bb、macd、rsi）、`showTrend`、`redUp`、`theme`、`watchlist:collapsed`、`market:period`
- 畫圖：`drawings:<代號>:<daily|weekly|monthly>`（`[{id,type:"hline",price}|{id,type:"trend",p1:{time,price},p2}]`，最多 50 條）
- 價格提醒：`alerts:list`（`[{id,symbol,kind,value,repeat,createdAt,ackDate,disabled}]`）

## 視覺設計（改版後，使用者選定）

- 主色紫藍：按鈕底色 `--accent-strong`（#6366f1）；文字／連結／選中狀態用 `--accent`（淺色 #6366f1、深色 #818cf8，因為深色底上 #6366f1 太暗）
- 深淺色兩套都要維護（`styles.css` 有三處：`:root`、`prefers-color-scheme: dark`、`[data-theme="dark"]`，後兩處內容相同，改一處要同步另一處）；中性灰不帶暖調
- 字體：英文與標題 Manrope、數字 Inter（`.num` 或 `var(--font-mono)`，等寬數字），用 `@fontsource-variable` 打包，不用 CDN；中文用系統字體
- 均線顏色刻意避開紫色（MA10 黃、MA20 橘、MA50 天藍、MA200 粉），以免和主色混淆
- 密度中等：卡片圓角 16px、內距 14～16px、基準字級 14.5px；不要回到太擠（小字＋細線）或太空的設計
- 看盤頁：報價標頭 → K 線（MACD／RSI 預設收起來，`overlays.macd`／`overlays.rsi`）→「現在的狀態」卡片（`lib/signals.ts`）→ 基本面 → 趨勢外推
- 手機：頁首分頁改成底部導覽列（`BottomNav`，z-index 要高於圖表），觀察清單是一排可滑動的卡片，工具列左右滑動不換行
- 頁首快速搜尋按 `/` 聚焦、Enter 跳到該股票

## 慣例

- 預設紅漲綠跌（台灣習慣），可切換；任何「漲／跌／偏多／偏空」的顏色都要跟著 `redUp` 設定。
- 台股 `currency: "TWD"`；任何跨幣別加總（市值、權重、報酬）前都要換成美元（最新值用 `fx.USDTWD`，歷史用 `fx.json`）。
- 年化：日報酬 × 252、波動 × √252；無風險利率是年化小數。
- 不加後端、不加需要金鑰的 API；新套件盡量少。
- 第三方腳本若需 CDN，版本要固定。

## 開發路線

- [x] 第一階段：資料管線、日週月 K 線、MA10/20/50/200、RSI(14)、MACD(12,26,9)、布林(20,2)
- [x] 第二階段 指標篩選器
- [x] 第三階段 投資組合
- [x] 第四階段 組合分析＋短期趨勢外推
- [x] 優化：README 截圖與徽章、E2E 測試進 CI、程式碼分割、資料過期提醒
- [x] 全站改版：紫藍主色、深淺色、K 線指標收合、白話狀態卡、手機底部導覽、快速搜尋
- [x] 市場總覽首頁、價格提醒
- [x] 加碼 A：多檔走勢比較、效率前緣圖、PWA（離線瀏覽）
- [x] 加碼 B：K 線畫圖工具、基本面資料
- [x] 加碼 C-1：交易紀錄制投資組合（已實現損益、股利、XIRR）
- [x] 加碼 C-2：英文版
- [x] 篩選器新條件（均線交叉、成交量）、每日篩選通知（Discord，使用者選的管道）
- [x] 資料品質：自動修正小問題＋status.json；資料搬到 data 分支（main 不再每天變大）
- [x] 組合分析自我檢查（VOO 對自己 = 1）、資料品質防護；觀察清單擴充到 49 檔＋分類＋搜尋＋篩選器分類範圍

### 已知事實（不要當成 bug 重查）
- 手機版（≤860px）`.table-scroll` 是 `overflow: visible`（持股表要變卡片）；其他寬表格要在手機可左右滑動時，需針對容器另外設 `overflow-x: auto`（例：`.tx-panel .table-scroll`）
- BRK-B 在 2026 年和 VOO 的日報酬幾乎不連動（近 1 年 Beta≈0.08、相關≈0.07；2022 年 0.76／0.81；5 年日報酬 Beta≈0.58）。已確認日期對齊與計算正確，是資料本身的結果

### 之後可做（使用者尚未決定）
- （目前沒有）

### 舊作業（reference/old_streamlit_app.py，尚未取得）要修正的點：全部完成
1. RSI 用 Wilder（ewm alpha=1/14） 2. 新增布林通道 3. 台股先換美元 4. 「AI 預測」→「短期趨勢外推」＋歷史準確度 5. 回測從起始日買進持有 6. 預設持倉改範例資料

## 常用指令

```bash
npm run dev            # 開發
npm test               # 單元測試
npm run build          # 打包
npm run test:e2e       # E2E（要先 build）
python scripts/test_indicators.py
python scripts/generate_sample_data.py   # 會覆蓋本機 public/data
npm run data:pull      # 下載 data 分支的真實資料
```
