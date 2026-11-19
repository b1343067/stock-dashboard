# AI 投研辦公室：每日報告任務說明

這份文件是寫給 **Claude Code 排程任務**看的工作說明（每次執行都從頭照著做）。
人也可以照著手動跑一次。報告會顯示在網站首頁的像素辦公室裡。

> 排程：台灣時間 **週二～週六 08:30**（美股前一晚收盤、資料在 06:20 左右更新完，台股是前一個交易日）。

---

## 0. 絕對規則（違反任何一條就不要發布）

1. **只能使用公開資料**：`npm run ai:context` 產生的素材（觀察清單、指標、新聞標題、`config/notify.json`）。
   **不可以出現任何持股、股數、成本、個人資訊**。儲存庫是公開的。
2. **不可以給買進／賣出建議或目標價**：只描述「發生了什麼、代表什麼狀況、有什麼風險」。
   不要寫「買進、賣出、加碼、減碼、目標價、建議買／賣、buy、sell、price target」（檢查程式會擋）。
   可以寫：「跌破 200 日線，趨勢轉弱」「RSI 超過 70，短線過熱」「本益比高於觀察清單其他股票」。
3. **只能提到觀察清單裡的股票**（素材的 `allowedSymbols`）。新聞裡出現的其他公司，只能在文字裡帶過，不能放進 `refs`。
4. **不可以編造**：素材裡沒有的數字、新聞、日期一律不寫。素材裡沒有新聞（`news` 是 `null`）→ 新聞分析師休假。
5. **每一段都要註明資料日期**（角色的 `dataDate`）；資料超過 3 個交易日沒更新（素材的 `stale` 不是空的）→ `staleNote` 一定要寫中英文說明。
6. 繁體中文為主，每一句都要附英文（`zh` / `en`）。

---

## 1. 準備

```bash
git checkout main && git pull --rebase origin main
npm ci --no-audit --no-fund          # 已經裝過可以略過
npm run data:pull                    # 下載 data 分支的最新資料到 public/data（不要 commit）
npm run ai:context > /tmp/ai-context.json
```

- `data:pull` 失敗、或 `ai:context` 印出錯誤（例如「範例資料」）→ **今天不發布**，直接結束並回報原因。舊報告會繼續顯示。
- 讀 `/tmp/ai-context.json`，這是唯一的素材來源。結構：

| 欄位 | 內容 |
|---|---|
| `reportDate` | 報告日期（台灣時間今天） |
| `dataDates` | `us`／`tw` 最新收盤日、`news` 新聞抓取日 |
| `stale` | 過期的市場（`"us"`、`"tw"`），空陣列＝正常 |
| `allowedSymbols` | 可以放進 `refs` 的代號 |
| `market` | 市場狀態（`regime`，ML 分群）、大盤指標、漲跌家數、漲跌幅前 3 名 |
| `tech` | `danger` 危險訊號、`bullish` 偏多訊號（規則名稱同 Discord 通知）、`watch` 關注股票的 RSI／MACD／均線狀態 |
| `fundamental` | 本益比最高／最低、殖利率最高、接近 52 週高點／低點、關注股票的基本面（`fromHigh52w` = 距 52 週高點 %） |
| `news` | 重大財經新聞標題、關注股票新聞、7 天內財報（`earnings7d`） |

---

## 2. 每個角色寫什麼

格式參考 `public/ai/sample-report.json`（型別在 `src/lib/types.ts` 的 `AiReport`）。

| 角色 | key | 素材 | 寫什麼 |
|---|---|---|---|
| 技術分析師 | `tech` | `tech` | 分「危險訊號」「偏多訊號」「關注股票」等段落；先寫關注股票（`watch: true`）與危險訊號 |
| 新聞分析師 | `news` | `news` | 「重大財經新聞」「關注股票新聞」「7 天內財報」；只摘要標題的意思，不轉載內文；`dataDate` 用 `dataDates.news` |
| 基本面分析師 | `fundamental` | `fundamental` | 「本益比」「殖利率」「52 週高低點」；數字直接引用素材，不要自己算 |
| 多空辯論 | `debate` | 全部 | `bull`（偏多的理由）、`bear`（偏空的理由）各 2～5 點，**兩邊都要有**，用同一份資料；`sections` 可以是空陣列 |
| 主管 | `lead` | 前面四位的報告 | `points` 今日重點 **3～5 點**；最重要的放第一點；`sections` 可以是空陣列 |

- 沒有素材的角色：`{"status": "off", "dataDate": null, "summary": {"zh": "", "en": ""}, "sections": []}`（畫面顯示「休假中」）。至少要有一位完成。
- `refs`：提到的股票，`{"symbol": "NVDA", "changePct": 2.1}`（`changePct` 用素材裡的當日漲跌 %，沒有就省略）。網站會做成看盤連結。
- `dataDate`：該角色用到的資料日期（美股為主就用 `dataDates.us`；只有台股就用 `tw`；新聞用 `news`），不能晚於報告日期。

### 字數限制（檢查程式會擋）

- `summary`：中文 **60 字**以內（一句話）
- 每一點：中文 **80 字**以內；英文最多 480 個字元（摘要 360）
- 每段最多 **5 點**、每個角色最多 4 段；段落標題 20 字以內
- 主管 `points` 3～5 點；多空辯論 `bull`／`bear` 各 1～5 點

---

## 3. 輸出

完整格式（`version` 固定 1、`sample` 一定是 `false`）：

```json
{
  "version": 1,
  "sample": false,
  "date": "<reportDate>",
  "generatedAt": "<現在的 UTC 時間，ISO 格式>",
  "dataDates": { "us": "…", "tw": "…", "news": "…或 null" },
  "staleNote": null,
  "roles": { "tech": {…}, "news": {…}, "fundamental": {…}, "debate": {…}, "lead": {…} }
}
```

把報告寫到 `/tmp/ai-report.json`（**不要**直接寫進 `public/ai/`），然後：

```bash
npm run ai:publish -- /tmp/ai-report.json   # 檢查＋寫入 reports/<日期>.json、latest.json、index.json，自動刪除 30 天前的報告
npm run check:report                        # 再檢查一次全部報告
```

- `ai:publish` 印出問題 → 修正 `/tmp/ai-report.json` 後重跑，直到通過。**不可以手動改 `public/ai/` 底下的檔案繞過檢查。**
- 修了 3 次還是不過 → 不發布，回報錯誤訊息。

---

## 4. 自我檢查（發布前逐條確認）

- [ ] 沒有任何持股、股數、成本、帳戶資訊
- [ ] 沒有買賣建議、目標價、「應該」「建議」之類的指示語氣
- [ ] 每個數字都能在 `/tmp/ai-context.json` 找到
- [ ] `refs` 的代號都在 `allowedSymbols`
- [ ] 多空辯論兩邊都有理由，不是一面倒
- [ ] `stale` 不是空的 → `staleNote` 有寫
- [ ] 中英文意思一致
- [ ] `npm run check:report` 通過

---

## 5. 提交與推送

只提交 `public/ai/`（**不要** commit `public/data/`，它在 .gitignore；也不要改其他程式）：

```bash
git add public/ai
git commit -m "chore(ai): 每日 AI 報告 <reportDate>"
git pull --rebase origin main && git push origin main
```

- 推送失敗（別人剛推過）→ 再 `git pull --rebase origin main` 後重推，最多 3 次。
- 推上 main 後：Vercel 自動部署（約 1 分鐘後首頁辦公室就會顯示新報告）、GitHub Actions「檢查 AI 報告」會再檢查一次。
- **直接推 main，不要開分支或 Pull Request**（這個環境不能刪除遠端分支，會累積）。

最後用 3～5 行回報：報告日期、資料日期、哪些角色完成、主管的第一點重點。
