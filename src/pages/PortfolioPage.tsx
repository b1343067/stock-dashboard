// 第三階段：投資組合頁
//
// ⚠️ 隱私：持股只存在使用者自己的瀏覽器（localStorage），不會上傳到任何地方，
//    也絕對不可以寫進程式碼或儲存庫（儲存庫是公開的）。
//
// 資料流：
//   localStorage（持股、設定） + index.json（現價、匯率）
//     ──► computePortfolio() ──► 總覽卡片、持股明細

import { useEffect, useMemo, useRef, useState } from "react";
import HoldingForm from "../components/portfolio/HoldingForm";
import HoldingsTable from "../components/portfolio/HoldingsTable";
import SettingsPanel from "../components/portfolio/SettingsPanel";
import SummaryCards from "../components/portfolio/SummaryCards";
import {
  DEFAULT_SETTINGS,
  buildExport,
  computePortfolio,
  parseImport,
  sampleHoldings,
  sanitizeHoldings,
  sanitizeSettings,
  type Holding,
  type PortfolioSettings,
  type Quote,
} from "../lib/portfolio";
import { readStorage, writeStorage } from "../lib/storage";
import type { IndexData } from "../lib/types";

const KEY_HOLDINGS = "portfolio:holdings";
const KEY_SETTINGS = "portfolio:settings";
const KEY_SAMPLE = "portfolio:isSample";

interface Props {
  index: IndexData | null;
  indexError: string | null;
  redUp: boolean;
}

/**
 * 第一次打開（localStorage 沒有任何持股紀錄）→ 顯示範例持股（修正 #6）
 * 之後就讀使用者自己存的。
 */
function loadInitial(): { holdings: Holding[]; isSample: boolean } {
  const raw = readStorage<unknown>(KEY_HOLDINGS, null);
  if (raw === null) return { holdings: sampleHoldings(), isSample: true };
  return { holdings: sanitizeHoldings(raw)[0], isSample: readStorage<boolean>(KEY_SAMPLE, false) === true };
}

export default function PortfolioPage({ index, indexError, redUp }: Props) {
  const [initial] = useState(loadInitial);
  const [holdings, setHoldings] = useState<Holding[]>(initial.holdings);
  const [isSample, setIsSample] = useState(initial.isSample);
  const [settings, setSettings] = useState<PortfolioSettings>(() => sanitizeSettings(readStorage<unknown>(KEY_SETTINGS, DEFAULT_SETTINGS)));
  // 表單狀態：null = 關閉、"new" = 新增、其他 = 正在編輯的持股 id
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  // 匯入後讓設定面板重新讀取數值
  const [settingsVersion, setSettingsVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    writeStorage(KEY_HOLDINGS, holdings);
  }, [holdings]);
  useEffect(() => {
    writeStorage(KEY_SAMPLE, isSample);
  }, [isSample]);
  useEffect(() => {
    writeStorage(KEY_SETTINGS, settings);
  }, [settings]);

  // 從 index.json 整理出「代號 → 現價」
  const quotes = useMemo(() => {
    const q: Record<string, Quote> = {};
    for (const t of index?.tickers ?? []) {
      q[t.symbol] = { price: t.lastClose, currency: t.currency, name: t.name, date: t.lastDate };
    }
    return q;
  }, [index]);
  const fx = useMemo(() => index?.fx ?? {}, [index]);
  const summary = useMemo(() => computePortfolio(holdings, quotes, fx, settings), [holdings, quotes, fx, settings]);

  const symbols = useMemo(
    () => (index?.tickers ?? []).map((t) => ({ symbol: t.symbol, name: t.name, currency: t.currency })),
    [index],
  );

  // ---- 操作 ----

  const clearSample = () => {
    setHoldings([]);
    setIsSample(false);
    setEditing("new");
  };

  const saveHolding = (h: Holding) => {
    if (editing === "new") {
      // 還在顯示範例時新增，先問要不要清掉範例，避免真實持股和範例混在一起
      if (isSample && window.confirm("目前是範例持股。要先清除範例，再加入你的持股嗎？\n（按「取消」會保留範例一起顯示）")) {
        setHoldings([h]);
      } else {
        setHoldings((hs) => [...hs, h]);
      }
      setIsSample(false);
    } else {
      setHoldings((hs) => hs.map((x) => (x.id === h.id ? h : x)));
    }
    setEditing(null);
  };

  const exportFile = () => {
    const data = buildExport(holdings, settings);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `my-portfolio-${stamp}.json`; // 檔名符合 .gitignore，不小心放進專案也不會被 commit
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ text: `已匯出 ${holdings.length} 筆持股`, tone: "ok" });
  };

  const importFile = async (file: File) => {
    try {
      if (file.size > 1_000_000) throw new Error("檔案太大（超過 1MB）");
      const result = parseImport(await file.text());
      const ok = holdings.length === 0 || isSample || window.confirm(`匯入 ${result.holdings.length} 筆持股，會取代目前的 ${holdings.length} 筆。確定嗎？`);
      if (!ok) return;
      setHoldings(result.holdings);
      setSettings(result.settings);
      setSettingsVersion((v) => v + 1);
      setIsSample(false);
      setEditing(null);
      setMessage({
        text: `已匯入 ${result.holdings.length} 筆持股${result.dropped ? `（${result.dropped} 筆格式錯誤已略過）` : ""}`,
        tone: "ok",
      });
    } catch (e) {
      setMessage({ text: `匯入失敗：${e instanceof Error ? e.message : String(e)}`, tone: "error" });
    }
  };

  const editingHolding = editing && editing !== "new" ? holdings.find((h) => h.id === editing) : undefined;
  const priceDate = index?.tickers[0]?.lastDate;
  const usdtwd = fx.USDTWD;

  return (
    <div className="portfolio">
      {isSample && (
        <div className="banner sample-banner" role="status">
          <span>
            目前顯示的是<b>範例持股</b>（隨意設定的數字，不是任何人的真實持股）。
          </span>
          <span className="banner-actions">
            <button type="button" className="btn-primary" onClick={clearSample}>
              清除範例，開始輸入
            </button>
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
              匯入檔案
            </button>
          </span>
        </div>
      )}

      <div className="card">
        <div className="screener-head">
          <h2>投資組合</h2>
          <div className="toolbar">
            <button type="button" className="btn-primary" onClick={() => setEditing("new")} disabled={editing === "new"}>
              ＋ 新增持股
            </button>
            <button type="button" className="btn-ghost" onClick={exportFile} disabled={holdings.length === 0}>
              匯出
            </button>
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
              匯入
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = ""; // 讓同一個檔案可以再選一次
              }}
            />
          </div>
        </div>

        {message && (
          <p className={`flash ${message.tone === "error" ? "error" : ""}`} role="status">
            {message.text}
            <button type="button" className="icon-btn" aria-label="關閉訊息" onClick={() => setMessage(null)}>
              ×
            </button>
          </p>
        )}

        {indexError && <p className="error">報價讀取失敗：{indexError}（持股資料仍保存在瀏覽器）</p>}

        <SummaryCards summary={summary} settings={settings} fx={fx} redUp={redUp} />

        <p className="hint">
          {priceDate && `現價為 ${priceDate} 收盤價。`}
          {usdtwd ? `台股以 USD/TWD ${usdtwd.toFixed(2)} 換算成美元後再加總。` : ""}
          {summary.missingQuotes > 0 && ` ${summary.missingQuotes} 檔不在觀察清單、沒有報價，未計入總計。`}
          {summary.missingFx && " 目前沒有匯率資料，台股未計入總計。"}
        </p>
      </div>

      {(editing === "new" || editingHolding) && (
        <div className="card">
          <HoldingForm
            key={editing ?? "none"}
            initial={editingHolding}
            symbols={symbols}
            settings={settings}
            onSubmit={saveHolding}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="card">
        <h3 className="section-title">持股明細</h3>
        <HoldingsTable
          rows={summary.rows}
          redUp={redUp}
          alertPct={settings.alertPct}
          onEdit={(id) => setEditing(id)}
          onDelete={(id) => {
            const rest = holdings.filter((h) => h.id !== id);
            setHoldings(rest);
            if (rest.length === 0) setIsSample(false); // 範例都刪光了就不再顯示範例提示
          }}
        />
        <SettingsPanel key={settingsVersion} settings={settings} onChange={setSettings} />
        <p className="hint">🔒 持股只存在這個瀏覽器，不會上傳。換電腦或清除瀏覽資料前，請先「匯出」備份。</p>
      </div>
    </div>
  );
}
