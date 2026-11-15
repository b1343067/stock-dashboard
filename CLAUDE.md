# CLAUDE.md — 專案規則與架構

個人投資看盤網站（求職作品集）。純靜態：Python 預先算指標存 JSON → Vite/React 前端讀 JSON 畫圖 → Vercel 部署。

## 必守規則

1. **儲存庫是公開的：絕對不可以把真實持股資料寫進程式碼、設定檔或資料檔。** 預設持倉、測試資料一律用明顯的範例資料。使用者的持股只存在瀏覽器 localStorage。
2. **註解用繁體中文**；介面文字用繁體中文。使用者程式基礎普通，註解要說明「為什麼」，不要只寫「做什麼」。
3. **網頁不能壞掉**：所有資料讀取都要能處理失敗（顯示提示，不要 throw 到最上層）；localStorage 讀寫要包 try/catch。
4. **資料更新失敗要保留舊檔**：不可以用空資料或部分資料覆蓋 `public/data/*.json`。寫檔用 `data_io.write_json_atomic`。
5. **價格四捨五入到小數 2 位**（MACD 系列 4 位），NaN 輸出為 `null`。
6. 每一頁最下方要有免責聲明「本網站僅供學習參考，非投資建議」（在 `Footer.tsx`）。
7. 手機要能正常瀏覽（≤ 860px 單欄、≤ 480px 再縮）；不能出現橫向捲軸。
8. 開發環境可能連不到 Yahoo Finance：不要依賴在本機實際抓資料，用 `scripts/generate_sample_data.py` 產生範例資料。
9. 改完前端一定要跑 `npm test` 和 `npm run build` 確認成功；改了指標要跑 `python scripts/test_indicators.py`。
11. `useEffect` 一律用大括號寫法，不要 `useEffect(() => someCall(), ...)`：新版 Chrome 的 `window.scrollTo` 等 API 會回傳 Promise，被 React 當成清除函式呼叫會讓整頁出錯（第二階段踩過）。
12. 判斷邏輯寫成 `src/lib/` 裡的純函式並加測試，元件只負責顯示。
10. commit 前不要動 `public/data/`，除非就是要更新資料（GitHub Actions 每天會覆蓋它）。

## 架構

- `config/watchlist.json`：觀察清單（唯一來源）＋匯率代號
- `scripts/indicators.py`：**所有指標計算**（MA、Wilder RSI、MACD、布林、週月線 resample、輸出 JSON 結構）
- `scripts/data_io.py`：路徑常數、原子寫檔、重建 `index.json` 與 `screener.json`（依磁碟上現存檔案）
- `scripts/fetch_data.py`：yfinance 抓 10y 日線（auto_adjust=True），重試 3 次；全部失敗 exit 1 且不寫檔
- `scripts/generate_sample_data.py`：固定種子的隨機漫步範例資料，`sample: true`
- `.github/workflows/update-data.yml`：cron `0 22 * * *`（台灣 06:00）＋ workflow_dispatch；有變更才 commit
- `src/lib/types.ts`：**JSON 格式的 TypeScript 定義，改 Python 輸出時必須同步修改**
- `src/lib/data.ts`：讀 JSON（帶快取、驗證）；`lastValid()` 取最後非 null 值
- `src/lib/route.ts`：hash 路由 `#/代號/週期`（daily|weekly|monthly）、`#/screener`；`chartHref()` 產生看圖連結
- `src/App.tsx`：外殼（Header 分頁、banner、Footer），依 route.page 切換 `pages/ChartPage` 或 `pages/ScreenerPage`
- `src/lib/screener.ts`：篩選條件型別、`evaluateCondition`、`runScreen`、`sanitizeConditions`（讀 localStorage 時驗證）、內建範例組合；測試在 `screener.test.ts`
- `src/lib/portfolio.ts`：`computePortfolio(holdings, quotes, fx, settings)`、`toUsd`、`stopStatus`、`sanitizeHoldings`、`parseImport`／`buildExport`、`sampleHoldings`；測試在 `portfolio.test.ts`
- `src/pages/PortfolioPage.tsx`：持股狀態與 localStorage、範例持股流程、匯入匯出；元件在 `components/portfolio/`
- `src/lib/format.ts`：`fmtMoney`／`fmtPct`／`pnlClass`（漲跌顏色跟著 redUp）
- `src/lib/analytics.ts`：`convertToUsd`（台股用 fx.json 歷史匯率）、`alignSeries`（日期交集）、`analyze`（Beta／Jensen's Alpha／CAPM／相關／共變異）、`maxSharpe`（投影梯度，5%～45%）、`buyAndHold`＋`backtestStats`
- `src/lib/trend.ts`：線性回歸外推、`nextTradingDays`（NYSE 休市日寫死在 `NYSE_HOLIDAYS`，**每年要補下一年**）、`backtestAccuracy`（走動式，不可偷看未來）
- `src/pages/AnalysisPage.tsx`：讀 `portfolioStore.loadHoldings()`，基準 VOO；`index.riskFree`（^IRX）沒有時預設 4%
- `public/data/fx.json`：`{USDTWD:{time,close}}`，由 fetch_data.py 產生；沒有時分析頁用最新匯率近似並提示
- localStorage key（投資組合）：`stockdash:portfolio:holdings`、`portfolio:settings`、`portfolio:isSample`；沒有 holdings key 時顯示範例持股
- localStorage key：`stockdash:screener:current`（目前條件＋AND/OR）、`stockdash:screener:presets`（我的組合）、`overlays`、`redUp`、`theme`
- `src/lib/storage.ts`：`useStoredState(key, default)`，key 自動加前綴 `stockdash:`
- `src/lib/theme.ts`：從 CSS 變數讀圖表顏色；顏色只在 `src/styles.css` 的 `:root` 定義
- `src/components/StockChart.tsx`：lightweight-charts v5，3 個 pane（K 線＋量＋均線＋布林／MACD／RSI）

## 資料格式

`public/data/<代號>.json`：`{symbol,name,currency,sample,lastDate,lastClose,changePct,daily,weekly,monthly}`，
每個週期為欄位導向物件：`time,open,high,low,close,volume,ma10,ma20,ma50,ma200,rsi,macd,signal,hist,bbUpper,bbMiddle,bbLower`。
`public/data/index.json`：`{generatedAt,sample,fx:{USDTWD},tickers:[{symbol,name,currency,lastDate,lastClose,changePct,sample}]}`。
日線保留最近 1260 筆（指標先用完整 10 年算再截斷），週／月線保留全部。
`public/data/screener.json`：`{generatedAt,bars:30,tickers:[{symbol,name,currency,lastDate,lastClose,changePct,daily,weekly,monthly}]}`，每週期只有 time/close/ma*/rsi/macd/signal/hist/bb* 的最近 30 筆。

## 慣例

- 預設紅漲綠跌（台灣習慣），可切換；任何「漲／跌／偏多／偏空」的顏色都要跟著 `redUp` 設定。
- 台股 `currency: "TWD"`；任何跨幣別加總（市值、權重）前都要用 `fx.USDTWD` 換成美元。
- 不加後端、不加需要金鑰的 API；新套件盡量少。
- 第三方腳本若需 CDN，版本要固定。

## 開發路線（使用者需求）

- [x] **第一階段**：資料管線、日週月 K 線、MA10/20/50/200、RSI(14)、MACD(12,26,9)、布林(20,2)
- [x] **第二階段 指標篩選器**：條件 = RSI 高於／低於 X、RSI 從 30 以下回升、MACD 黃金／死亡交叉（最近 N 天內）、MACD 柱狀體連續縮短、股價突破／跌破布林上中下軌、股價站上／跌破某條均線；每個條件可選日／週／月線；AND／OR 組合；常用組合存 localStorage；結果點擊 → `#/代號/週期` 看圖
- [x] **第三階段 投資組合**：使用者輸入持股（代號、股數、成本）存 localStorage；每檔標記「核心」或「短線」；短線自動算停利停損（預設 ±20%，每檔可自訂）；距離停利或停損 5% 以內用顏色提醒；未實現損益、報酬率、核心／短線比例，短線比例超過上限時提醒；匯出／匯入 JSON；台股先換美元
- [x] **第四階段 組合分析**：加權 Beta、Jensen's Alpha、最大回撤、相關係數熱力圖；CAPM 預期報酬＋夏普最佳化（權重 5%～45%），顯示目前與建議權重差異；回測與 VOO 比較累積報酬、最大回撤、夏普值

### 舊作業（reference/old_streamlit_app.py）要修正的點
1. RSI 用 Wilder（ewm alpha=1/14）✅
2. 新增布林通道 ✅
3. 台股以台幣計價，算總市值前先換美元 ✅
4. 「AI 預測」改名「短期趨勢外推」，預測日期只算交易日，並顯示和「明天價格=今天價格」比較的歷史準確度 ✅
5. 回測從使用者選的起始日，用設定權重買進持有（不可用今天的權重回推過去） ✅
6. 預設持倉改成範例資料 ✅

## 常用指令

```bash
npm run dev | npm test | npm run build
python scripts/test_indicators.py
python scripts/generate_sample_data.py   # 會覆蓋 public/data
```
