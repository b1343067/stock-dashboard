# CLAUDE.md — 專案規則與架構

個人投資看盤網站（求職作品集）。純靜態：Python 預先算指標存 JSON → Vite/React 前端讀 JSON 畫圖 → Vercel 部署。
線上：https://stock-dashboard-peach-sigma.vercel.app/ ・ 儲存庫：https://github.com/b1343067/stock-dashboard（公開）

## 必守規則

1. **儲存庫是公開的：絕對不可以把真實持股資料寫進程式碼、設定檔、資料檔或截圖。** 預設持倉、測試資料、README 截圖一律用明顯的範例資料。使用者的持股只存在瀏覽器 localStorage。
2. **註解用繁體中文**；介面文字用繁體中文。使用者程式基礎普通，註解要說明「為什麼」，不要只寫「做什麼」。
3. **網頁不能壞掉**：所有資料讀取都要能處理失敗（顯示提示，不要 throw 到最上層）；localStorage 讀寫要包 try/catch。
4. **資料更新失敗要保留舊檔**：不可以用空資料或部分資料覆蓋 `public/data/*.json`。寫檔用 `data_io.write_json_atomic`。
5. **價格四捨五入到小數 2 位**（MACD 系列 4 位），NaN 輸出為 `null`。
6. 每一頁最下方要有免責聲明「本網站僅供學習參考，非投資建議」（在 `Footer.tsx`）。
7. 手機要能正常瀏覽（≤ 860px 單欄、≤ 480px 再縮）；不能出現橫向捲軸（E2E 測試會檢查）。
8. 開發環境可能連不到 Yahoo Finance：不要依賴在本機實際抓資料，用 `scripts/generate_sample_data.py` 產生範例資料，或用假的 yfinance 模組測試 `fetch_data.py`。
9. 改完前端一定要跑 `npm test`、`npm run build`、`npm run test:e2e` 確認成功；改了指標要跑 `python scripts/test_indicators.py`。
10. commit 時不要動 `public/data/`，除非就是要更新資料（GitHub Actions 每天會覆蓋它）。
11. `useEffect` 一律用大括號寫法，不要 `useEffect(() => someCall(), ...)`：新版 Chrome 的 `window.scrollTo` 等 API 會回傳 Promise，被 React 當成清除函式呼叫會讓整頁出錯（第二階段踩過）。
12. 判斷與計算邏輯寫成 `src/lib/` 裡的純函式並加 Vitest 測試，元件只負責顯示。
13. 新頁面要用 `React.lazy` 載入（見 `App.tsx`），不要直接 import，避免首頁變大。

## 工作流程

- 在功能分支開發 → 測試全過 → 合併進 `main` 並推送 → Vercel 自動部署 → 打開線上網站確認。
- `main` 常有 Actions 的資料 commit，合併前先 `git fetch origin main` 並 rebase。
- 本環境已允許連線 `stock-dashboard-peach-sigma.vercel.app`，可直接用 Playwright 檢查線上版本。

## 架構

### 資料（Python，`scripts/`）
- `config/watchlist.json`：觀察清單（唯一來源）、匯率代號 `fx`、無風險利率代號 `riskFree`（^IRX）
- `scripts/indicators.py`：**所有指標計算**（MA、Wilder RSI、MACD、布林、週月線 resample、輸出 JSON 結構）
- `scripts/data_io.py`：路徑常數、原子寫檔、重建 `index.json` 與 `screener.json`（依磁碟上現存檔案）
- `scripts/fetch_data.py`：yfinance 抓 10y 日線（auto_adjust=True），重試 3 次；匯率歷史寫 `fx.json`；全部失敗 exit 1 且不寫檔
- `scripts/generate_sample_data.py`：固定種子的隨機漫步範例資料，`sample: true`（會覆蓋 public/data）
- `.github/workflows/update-data.yml`：cron `0 22 * * *`（台灣 06:00）、手動觸發、改到 config/scripts 推到 main 時也會跑；有變更才 commit
- `.github/workflows/ci.yml`：單元測試＋建置＋Python 測試；另一個 job 跑 Playwright E2E（失敗時上傳報告）

### 前端（`src/`）
- `App.tsx`：外殼（Header 分頁、資料過期／範例資料 banner、Footer），依 `route.page` 以 `React.lazy` 載入 `pages/` 的頁面
- `lib/route.ts`：hash 路由 `#/代號/週期`（daily|weekly|monthly）、`#/screener`、`#/portfolio`、`#/analysis`；`chartHref()` 產生看圖連結
- `lib/types.ts`：**JSON 格式的 TypeScript 定義，改 Python 輸出時必須同步修改**
- `lib/data.ts`：讀 JSON（帶快取、驗證）：`loadIndex`、`loadTicker`、`loadScreener`、`loadFxHistory`（沒有檔案回傳 null）
- `lib/freshness.ts`：`checkFreshness()`，最新資料落後 3 個平日以上就在頁首提醒
- `lib/storage.ts`：`useStoredState(key, default)`、`readStorage`／`writeStorage`，key 自動加前綴 `stockdash:`
- `lib/theme.ts`：從 CSS 變數讀圖表顏色；顏色只在 `styles.css` 的 `:root` 定義（`--s1`／`--s2` 類別色、`--div-*` 發散色，已用資料視覺化指引的驗證工具檢查過）
- `lib/format.ts`：`fmtMoney`／`fmtPct`／`fmtFixed`／`pnlClass`（漲跌顏色跟著 redUp）
- 看盤：`pages/ChartPage.tsx`、`components/StockChart.tsx`（lightweight-charts v5，3 個 pane＋趨勢外推虛線）、`components/TrendCard.tsx`
- 篩選器：`lib/screener.ts`（條件型別、`evaluateCondition`、`runScreen`、`sanitizeConditions`、內建範例組合）、`pages/ScreenerPage.tsx`、`components/screener/`
- 投資組合：`lib/portfolio.ts`（`computePortfolio`、`toUsd`、`stopStatus`、`sanitizeHoldings`、`parseImport`／`buildExport`、`sampleHoldings`）、`lib/portfolioStore.ts`（讀 localStorage，分析頁共用）、`pages/PortfolioPage.tsx`、`components/portfolio/`
- 組合分析：`lib/analytics.ts`（`convertToUsd`、`alignSeries`、`analyze`、`maxSharpe`、`buyAndHold`、`backtestStats`）、`pages/AnalysisPage.tsx`、`components/analysis/`
- 趨勢外推：`lib/trend.ts`（線性回歸、`nextTradingDays`、`backtestAccuracy`）。**`NYSE_HOLIDAYS` 寫死到 2027 年，每年要補下一年**

### 測試
- 單元測試：`src/lib/*.test.ts`（Vitest，`npm test`，只跑 src）
- E2E：`e2e/*.spec.ts`（Playwright 1.63，`npm run test:e2e`，自動啟動 `vite preview`；desktop 專案跑全部、mobile 專案只跑 `@mobile`）
- E2E 用 `trackErrors(page)` 收集錯誤，結尾 `expectNoErrors()`；測試不可依賴每天變動的價格數值，只檢查結構與邏輯
- ⚠️ Playwright 上傳檔案（`setInputFiles`）要用純英文路徑（例如 `mkdtempSync(join(tmpdir(), ...))`）；`testInfo.outputPath()` 的資料夾名稱含中文與「：」「→」，上傳會靜靜失敗

## 資料格式

- `public/data/<代號>.json`：`{symbol,name,currency,sample,lastDate,lastClose,changePct,daily,weekly,monthly}`，每個週期為欄位導向物件：`time,open,high,low,close,volume,ma10,ma20,ma50,ma200,rsi,macd,signal,hist,bbUpper,bbMiddle,bbLower`。日線保留最近 1260 筆（指標先用完整 10 年算再截斷），週／月線保留全部。
- `public/data/index.json`：`{generatedAt,sample,fx:{USDTWD},riskFree,tickers:[{symbol,name,currency,lastDate,lastClose,changePct,sample}]}`（riskFree 為年化小數，抓不到沿用上次）
- `public/data/screener.json`：`{generatedAt,bars:30,tickers:[{symbol,name,currency,lastDate,lastClose,changePct,daily,weekly,monthly}]}`，每週期只有 time/close/ma*/rsi/macd/signal/hist/bb* 的最近 30 筆
- `public/data/fx.json`：`{USDTWD:{time,close}}`；沒有時分析頁用最新匯率近似並提示

### localStorage key（都有 `stockdash:` 前綴）
- 投資組合：`portfolio:holdings`、`portfolio:settings`、`portfolio:isSample`（沒有 holdings key 時顯示範例持股）
- 篩選器：`screener:current`（目前條件＋AND/OR）、`screener:presets`（我的組合）
- 分析：`analysis:period`、`analysis:source`
- 介面：`overlays`、`showTrend`、`redUp`、`theme`

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

### 之後可做（使用者尚未決定）
- 交易紀錄制投資組合（已實現損益、股利、XIRR）
- 效率前緣圖、多檔走勢比較、篩選器新條件（均線交叉、52 週新高低、成交量）
- 篩選結果 Telegram 通知、英文版

### 舊作業（reference/old_streamlit_app.py，尚未取得）要修正的點：全部完成
1. RSI 用 Wilder（ewm alpha=1/14） 2. 新增布林通道 3. 台股先換美元 4. 「AI 預測」→「短期趨勢外推」＋歷史準確度 5. 回測從起始日買進持有 6. 預設持倉改範例資料

## 常用指令

```bash
npm run dev            # 開發
npm test               # 單元測試
npm run build          # 打包
npm run test:e2e       # E2E（要先 build）
python scripts/test_indicators.py
python scripts/generate_sample_data.py   # 會覆蓋 public/data
```
