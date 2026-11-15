# 📈 投資看盤（Stock Dashboard）

個人投資看盤網站，同時也是我的求職作品集。
每天由 GitHub Actions 自動抓取股價、預先算好技術指標存成 JSON，網站部署在 Vercel，是純靜態網頁，不需要後端伺服器。

> **免責聲明：本網站僅供學習參考，非投資建議。**

## 功能（目前進度）

| 階段 | 內容 | 狀態 |
| --- | --- | --- |
| 第一階段 | 資料管線、K 線圖（日／週／月）、均線、布林通道、MACD、RSI | ✅ 完成 |
| 第二階段 | 指標篩選器（自訂條件、AND／OR、儲存組合） | ✅ 完成 |
| 第三階段 | 投資組合（持股存在瀏覽器、停利停損提醒、匯出匯入） | ✅ 完成 |
| 第四階段 | 組合分析（Beta、Alpha、最大回撤、相關係數、夏普最佳化、回測） | ⏳ 規劃中 |

第一階段的畫面：
- 觀察清單：VOO、BRK-B、JPM、MSFT、AMD、AMZN、PLTR、TSLA、GOOGL、NVDA、LLY、COST、XOM、0050.TW
- K 線圖可以切換日線／週線／月線，可以疊加 MA10／20／50／200 和布林通道，下方有 MACD 和 RSI
- 指標摘要卡片：RSI 區間、MACD 多空、布林 %B、股價和均線的相對位置
- 支援紅漲綠跌／綠漲紅跌切換、深色模式、手機版
- 網址會記住目前的股票和週期，例如 `/#/NVDA/weekly`

第二階段（`/#/screener`）：
- 自訂篩選條件，每個條件可選日線／週線／月線，用「全部符合（AND）」或「任一符合（OR）」組合
- 內建 4 組範例組合；自己的組合可以儲存在瀏覽器（localStorage），下次打開還在
- 每個條件旁顯示「幾檔符合」，方便調整參數
- 結果列出每個條件的判斷細節（例如「3 天前交叉」「RSI 28.5」），點一下直接看圖
- 也可以展開「不符合的股票」，看差在哪個條件

第三階段（`/#/portfolio`）：
- 自行輸入持股（代號、股數、平均成本），每檔標記「核心」或「短線」
- **持股只存在你自己的瀏覽器（localStorage）**，不會上傳；可以匯出成 JSON 檔備份、在別台電腦匯入
- 第一次打開會顯示明顯標示的「範例持股」，按「清除範例，開始輸入」就會清空
- 短線部位自動算停利、停損價（預設 ±20%，每檔可自訂），距離 5% 以內變色提醒，已觸及會用實心標籤
- 總市值、成本、未實現損益、報酬率，核心／短線比例長條圖（含上限標記），短線超過上限時提醒
- 總計可切換美元／台幣顯示；台股一律先用匯率換成美元再加總
- 設定（短線上限、預設停利停損、提醒範圍）也存在瀏覽器

### 投資組合計算方式

| 項目 | 算法 |
| --- | --- |
| 市值 | 股數 × 最新收盤價（原幣） |
| 未實現損益 | 市值 − 股數 × 平均成本 |
| 報酬率 | 現價 ÷ 平均成本 − 1 |
| 換匯 | 台幣 ÷ USD/TWD 匯率 = 美元；**所有加總、比重都用美元計算** |
| 停利價／停損價 | 成本 × (1 + 停利%)／成本 × (1 − 停損%) |
| 距離提醒 | \|目標價 − 現價\| ÷ 現價 ≤ 5% 時提醒；現價已超過目標價為「已達停利／已觸及停損」 |
| 短線比例 | 短線市值 ÷ 總市值（美元計），超過設定上限時提醒 |

不在觀察清單的股票沒有報價，會列出但不計入總計；要追蹤的話請加到 `config/watchlist.json`。

### 篩選條件定義

「最近 N 天內」= 包含最新一根 K 棒往前共 N 根（週線為 N 週、月線為 N 個月），N 可設 1～20。

| 條件 | 判斷方式 |
| --- | --- |
| RSI 高於／低於 X | 最新一根 RSI > X ／ < X |
| RSI 從 X 以下回升 | 最近 N 根內 RSI 由 ≤ X 穿越到 > X，而且現在仍在 X 以上 |
| MACD 黃金交叉 | 最近 N 根內 DIF 由下往上穿越 DEA（前一根 DIF ≤ DEA，這一根 DIF > DEA） |
| MACD 死亡交叉 | 最近 N 根內 DIF 由上往下穿越 DEA |
| MACD 柱狀體連續縮短 | 最近連續 N 根，柱狀體絕對值都比前一根小，且沒有翻到另一邊（正負號相同） |
| 股價突破布林上／中／下軌 | 最近 N 根內收盤價由下往上穿越該軌 |
| 股價跌破布林上／中／下軌 | 最近 N 根內收盤價由上往下穿越該軌 |
| 股價站上／跌破均線 | 最新收盤價 > ／ < 該均線（MA10／20／50／200） |

週線、月線的最新一根可能是「還沒結束的本週／本月」，數值會隨每天更新而變動。

## 架構

```
  ┌────────────────────────┐   每天 UTC 22:00（台灣早上 6:00）
  │     GitHub Actions     │──────────────────────────────┐
  │  scripts/fetch_data.py │                              │
  └──────────┬─────────────┘                              │
             │ yfinance 抓 10 年日線                      │
             ▼                                            │
  ┌────────────────────────┐                              │
  │ scripts/indicators.py  │ 計算日／週／月線的            │
  │                        │ MA、RSI、MACD、布林通道       │
  └──────────┬─────────────┘                              │
             ▼                                            │
  public/data/<代號>.json、index.json ── git commit & push ┘
             │
             ▼ 偵測到新的 commit，自動重新部署
  ┌────────────────────────┐
  │    Vercel（靜態網站）    │  Vite + React + TypeScript
  │   瀏覽器讀取 JSON 畫圖   │  lightweight-charts
  └────────────────────────┘
```

**為什麼預先算好指標？** 網頁打開時不用即時計算，也不用呼叫外部 API，速度快、免費、不會被 Yahoo 擋。

**抓不到資料怎麼辦？**
- 某一檔失敗：重試 3 次，還是失敗就保留前一天的檔案，其他股票照常更新
- 匯率失敗：沿用上一次的匯率
- 全部失敗：不修改任何檔案，Actions 會顯示紅色 ❌ 通知你
- 寫檔時先寫暫存檔再換名，不會產生寫到一半的壞檔案
- 前端讀取失敗時只會在該區塊顯示錯誤訊息，整個網頁不會壞掉

## 資料夾說明

```
.
├── .github/workflows/
│   ├── update-data.yml      # 每日自動更新資料的排程（GitHub Actions）
│   └── ci.yml               # 推送時自動跑測試與建置
├── config/
│   └── watchlist.json       # 觀察清單：要追蹤哪些股票、匯率代號都在這裡改
├── public/                  # 原封不動複製到網站上的檔案
│   ├── data/                # ★ 股價與指標資料（由 Python 腳本產生，不要手動改）
│   │   ├── index.json       #   總表：股票清單、最新價格、匯率、更新時間
│   │   ├── screener.json    #   篩選器用：每檔各週期最近 30 根的指標（約 44KB）
│   │   └── <代號>.json      #   每檔股票一個檔案，含日／週／月線與指標
│   └── favicon.svg
├── reference/               # 舊的課堂作業（只供參考，不會部署）
├── scripts/                 # Python 資料處理
│   ├── indicators.py        #   技術指標計算（核心邏輯）
│   ├── data_io.py           #   讀寫 JSON、重建 index.json
│   ├── fetch_data.py        #   抓真實資料（GitHub Actions 執行）
│   ├── generate_sample_data.py  # 產生隨機範例資料（不需網路）
│   ├── test_indicators.py   #   指標計算的自我檢查
│   └── requirements.txt     #   Python 套件清單
├── src/                     # 前端程式（React + TypeScript）
│   ├── main.tsx             #   進入點
│   ├── App.tsx              #   最外層：頁首分頁、切換頁面、頁尾
│   ├── pages/               #   頁面
│   │   ├── ChartPage.tsx    #     看盤頁（觀察清單＋K 線圖）
│   │   ├── ScreenerPage.tsx #     指標篩選器
│   │   └── PortfolioPage.tsx#     投資組合
│   ├── styles.css           #   全站樣式與深淺色主題
│   ├── components/          #   畫面元件
│   │   ├── StockChart.tsx   #     K 線圖（lightweight-charts）
│   │   ├── ChartToolbar.tsx #     日／週／月切換、指標開關
│   │   ├── Watchlist.tsx    #     觀察清單
│   │   ├── SignalSummary.tsx#     指標摘要卡片
│   │   ├── Header.tsx / Footer.tsx / ErrorBoundary.tsx
│   │   ├── screener/        #     篩選器元件：條件列、常用組合、結果列表
│   │   └── portfolio/       #     投資組合元件：總覽、持股表、表單、設定
│   └── lib/                 #   非畫面的工具程式
│       ├── types.ts         #     JSON 資料格式定義
│       ├── data.ts          #     讀取 JSON
│       ├── route.ts         #     網址 #/代號/週期、#/screener
│       ├── screener.ts      #     篩選條件判斷邏輯（純函式）
│       ├── screener.test.ts #     篩選邏輯的單元測試（npm test）
│       ├── portfolio.ts     #     投資組合計算（換匯、損益、停利停損、匯入驗證）
│       ├── portfolio.test.ts#     投資組合的單元測試
│       ├── format.ts        #     金額、百分比格式化
│       ├── storage.ts       #     localStorage 安全讀寫
│       └── theme.ts         #     從 CSS 讀取圖表顏色
├── CLAUDE.md                # 給 AI 助手看的專案規則
├── index.html / vite.config.ts / tsconfig.json / package.json
└── vercel.json              # Vercel 部署設定
```

## 資料格式

`public/data/<代號>.json`（欄位導向，每個陣列長度相同，第 i 筆對應 `time[i]`）：

```jsonc
{
  "symbol": "NVDA", "name": "NVIDIA", "currency": "USD",
  "sample": false,              // true = 隨機範例資料
  "lastDate": "2026-11-13", "lastClose": 123.45, "changePct": 1.23,
  "daily":   { "time": [...], "open": [...], "high": [...], "low": [...], "close": [...], "volume": [...],
               "ma10": [...], "ma20": [...], "ma50": [...], "ma200": [...],
               "rsi": [...], "macd": [...], "signal": [...], "hist": [...],
               "bbUpper": [...], "bbMiddle": [...], "bbLower": [...] },
  "weekly":  { ...同上 },
  "monthly": { ...同上 }
}
```

- 價格四捨五入到小數 2 位；MACD 因為數值小，保留 4 位
- 資料不足（例如前 199 天沒有 MA200）時為 `null`
- 日線保留最近約 5 年（1260 個交易日）；週、月線保留 10 年
- 台股（`.TW`）以台幣計價，`currency` 為 `TWD`；匯率在 `index.json` 的 `fx.USDTWD`

## 指標計算方式

| 指標 | 算法 |
| --- | --- |
| 均線 MA | 收盤價的簡單移動平均（10、20、50、200 期） |
| RSI(14) | **Wilder 平滑法**：漲跌幅各自做 `ewm(alpha=1/14, adjust=False)`，和一般看盤軟體一致 |
| MACD(12,26,9) | DIF = EMA12 − EMA26；DEA = DIF 的 EMA9；柱狀體 = DIF − DEA |
| 布林通道 | 中軌 = 20 期均線；上下軌 = 中軌 ± 2 × 20 期標準差（母體標準差） |
| 週線／月線 | 由日線整理：開 = 第一天開盤、高 = 最高、低 = 最低、收 = 最後一天收盤、量 = 加總；日期為該期間最後一個交易日 |

週線、月線的指標是用「週 K、月 K 的收盤價」重新計算，例如週線 MA20 = 20 週均線。

## 相對於舊作業的修正

舊作業 `reference/old_streamlit_app.py` 的問題與修正方式：

1. ✅ RSI 改用 Wilder 平滑法（第一階段已完成）
2. ✅ 新增布林通道（20 日、2 倍標準差）（第一階段已完成）
3. ✅ 台股先用匯率換成美元再加總市值（第三階段）
4. ⏳「AI 預測」改名為「短期趨勢外推」，只算交易日，並與「明天價格 = 今天價格」比較歷史準確度
5. ⏳ 回測改成從使用者選的起始日，用設定權重買進持有（不再用今天的權重回推）
6. ✅ 預設持倉改成範例資料（第三階段）

## 本機開發

需要 Node.js 20 以上、Python 3.11 以上。

```bash
npm install          # 安裝前端套件
npm run dev          # 開發模式，打開 http://localhost:5173
npm run build        # 正式打包到 dist/
npm test             # 執行單元測試（vitest）
```

Python 資料腳本：

```bash
pip install -r scripts/requirements.txt
python scripts/test_indicators.py        # 檢查指標計算
python scripts/fetch_data.py             # 抓真實資料（需要能連到 Yahoo Finance）
python scripts/generate_sample_data.py   # 產生隨機範例資料（會覆蓋 public/data！）
```

## 部署步驟

### 1. Vercel

1. 登入 [vercel.com](https://vercel.com)，按 **Add New… → Project**，選擇這個 GitHub 儲存庫 → **Import**
2. 設定（`vercel.json` 已經寫好，通常會自動帶入，確認一下即可）：
   - **Framework Preset**：Vite
   - **Root Directory**：`./`（不用改）
   - **Build Command**：`npm run build`
   - **Output Directory**：`dist`
   - **Install Command**：預設（`npm install`）
   - **Environment Variables**：不需要
3. 按 **Deploy**。之後每次有新的 commit（包括 Actions 每天更新的資料），Vercel 都會自動重新部署。

### 2. GitHub Actions 權限

儲存庫 **Settings → Actions → General**：
- **Actions permissions**：Allow all actions and reusable workflows
- **Workflow permissions**：選 **Read and write permissions** → **Save**

（workflow 檔案裡也有寫 `permissions: contents: write`，但如果儲存庫或組織層級限制為唯讀，還是要改上面這個設定。）

### 3. 手動觸發一次資料更新

1. 到儲存庫的 **Actions** 分頁
2. 左側點 **更新股價資料**
3. 右邊按 **Run workflow** → 選分支（main）→ **Run workflow**
4. 約 1～3 分鐘後完成，會多一個 `chore(data): 每日資料更新` 的 commit，Vercel 接著自動部署，網站上的「範例資料」提示就會消失

> 💡 修改 `config/watchlist.json`、`scripts/` 或這個 workflow 檔並推到 `main` 時，也會自動執行一次。

> ⚠️ 排程（schedule）只會在**預設分支**上執行；另外 GitHub 規定儲存庫 60 天沒有任何活動時會自動停用排程，到時候到 Actions 頁面重新啟用即可。

## 修改觀察清單

編輯 `config/watchlist.json`，新增或刪除股票（台股要加 `.TW`、上櫃加 `.TWO`），commit 後手動觸發一次 Actions 就會產生新檔案。被刪掉的股票，舊的 JSON 檔案可以手動刪除。

## 隱私

本儲存庫是公開的，**不放任何真實持股資料**。之後的投資組合功能，持股只會存在使用者自己的瀏覽器（localStorage），匯出的 JSON 檔也已列入 `.gitignore`。

## 技術

Vite · React 19 · TypeScript · Vitest · lightweight-charts v5 · Python · pandas · yfinance · GitHub Actions · Vercel
