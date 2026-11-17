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
import TransactionsPanel from "../components/portfolio/TransactionsPanel";
import { loadFxHistory } from "../lib/data";
import { buildLedger, parseTransactionsFile, positionsToHoldings, sampleTransactions, type Transaction } from "../lib/transactions";
import { buildExport, computePortfolio, parseImport, type Holding, type PortfolioSettings, type Quote } from "../lib/portfolio";
import { writeStorage } from "../lib/storage";
import {
  KEY_HOLDINGS,
  KEY_MODE,
  KEY_SAMPLE,
  KEY_SETTINGS,
  KEY_TX,
  loadMode,
  loadSettings,
  loadStoredHoldings,
  loadTransactions,
  type PortfolioMode,
} from "../lib/portfolioStore";
import type { IndexData } from "../lib/types";
import { t } from "../lib/i18n";
import { ANALYSIS_HREF } from "../lib/route";

interface Props {
  index: IndexData | null;
  indexError: string | null;
  redUp: boolean;
}

export default function PortfolioPage({ index, indexError, redUp }: Props) {
  const [initial] = useState(loadStoredHoldings);
  // 加碼 C：持股來源。transactions = 由交易紀錄計算（holdings 只拿來存類型與停利停損設定）
  const [mode, setMode] = useState<PortfolioMode>(loadMode);
  const [transactions, setTransactions] = useState<Transaction[]>(loadTransactions);
  const [fxHistory, setFxHistory] = useState<{
    time: string[];
    close: number[];
  } | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>(initial.holdings);
  const [isSample, setIsSample] = useState(initial.isSample);
  const [settings, setSettings] = useState<PortfolioSettings>(loadSettings);
  // 表單狀態：null = 關閉、"new" = 新增、其他 = 正在編輯的持股 id
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    tone: "ok" | "error";
  } | null>(null);
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
  useEffect(() => {
    writeStorage(KEY_MODE, mode);
  }, [mode]);
  useEffect(() => {
    writeStorage(KEY_TX, transactions);
  }, [transactions]);
  // 歷史匯率：只有交易紀錄模式需要（台股每筆交易依當天匯率換算）；讀不到就用最新匯率
  useEffect(() => {
    if (mode !== "transactions") return;
    let cancelled = false;
    loadFxHistory()
      .then((h) => {
        if (!cancelled) setFxHistory(h?.USDTWD ?? null);
      })
      .catch(() => {
        /* 沒有歷史匯率不影響其他功能 */
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const isTx = mode === "transactions";
  // 交易紀錄模式：股數與平均成本由交易計算；類型與停利停損沿用同代號的持股設定（範例持股不算）
  const effectiveHoldings = useMemo(
    () => (isTx ? positionsToHoldings(buildLedger(transactions).positions, isSample ? [] : holdings) : holdings),
    [isTx, transactions, holdings, isSample],
  );

  // 從 index.json 整理出「代號 → 現價」
  const quotes = useMemo(() => {
    const q: Record<string, Quote> = {};
    for (const t of index?.tickers ?? []) {
      q[t.symbol] = {
        price: t.lastClose,
        currency: t.currency,
        name: t.name,
        date: t.lastDate,
      };
    }
    return q;
  }, [index]);
  const fx = useMemo(() => index?.fx ?? {}, [index]);
  const summary = useMemo(() => computePortfolio(effectiveHoldings, quotes, fx, settings), [effectiveHoldings, quotes, fx, settings]);

  const symbols = useMemo(
    () =>
      (index?.tickers ?? []).map((t) => ({
        symbol: t.symbol,
        name: t.name,
        currency: t.currency,
      })),
    [index],
  );

  // ---- 操作 ----

  const clearSample = () => {
    setHoldings([]);
    setIsSample(false);
    setEditing("new");
  };

  const saveHolding = (h: Holding) => {
    if (isTx) {
      // 交易紀錄模式只存「類型、停利停損」設定（依代號），股數成本以交易為準
      const base = isSample ? [] : holdings;
      setHoldings(
        base.some((x) => x.symbol === h.symbol)
          ? base.map((x) => (x.symbol === h.symbol ? { ...x, type: h.type, tpPct: h.tpPct, slPct: h.slPct } : x))
          : [...base, h],
      );
      setIsSample(false);
      setEditing(null);
      return;
    }
    if (editing === "new") {
      // 還在顯示範例時新增，先問要不要清掉範例，避免真實持股和範例混在一起
      if (isSample && window.confirm(t("目前是範例持股。要先清除範例，再加入你的持股嗎？\n（按「取消」會保留範例一起顯示）"))) {
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
    const data = buildExport(holdings, settings, new Date(), {
      transactions,
      mode,
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `my-portfolio-${stamp}.json`; // 檔名符合 .gitignore，不小心放進專案也不會被 commit
    a.click();
    URL.revokeObjectURL(url);
    setMessage({
      text: t("已匯出 {0} 筆持股{1}", [holdings.length, transactions.length ? t("、{0} 筆交易", [transactions.length]) : ""]),
      tone: "ok",
    });
  };

  const importFile = async (file: File) => {
    try {
      if (file.size > 1_000_000) throw new Error(t("檔案太大（超過 1MB）"));
      const text = await file.text();
      const result = parseImport(text);
      const tx = parseTransactionsFile(text);
      const hasData = (holdings.length > 0 && !isSample) || transactions.length > 0;
      const ok =
        !hasData ||
        window.confirm(
          t("匯入 {0} 筆持股{1}，會取代目前的資料。確定嗎？", [result.holdings.length, tx.transactions.length ? t("、{0} 筆交易", [tx.transactions.length]) : ""]),
        );
      if (!ok) return;
      setHoldings(result.holdings);
      setTransactions(tx.transactions);
      if (tx.mode) setMode(tx.mode);
      setSettings(result.settings);
      setSettingsVersion((v) => v + 1);
      setIsSample(false);
      setEditing(null);
      setMessage({
        text: t("已匯入 {0} 筆持股{1}{2}", [result.holdings.length, tx.transactions.length ? t("、{0} 筆交易", [tx.transactions.length]) : "", result.dropped + tx.dropped ? t("（{0} 筆格式錯誤已略過）", [result.dropped + tx.dropped]) : ""]),
        tone: "ok",
      });
    } catch (e) {
      setMessage({
        text: t("匯入失敗：{0}", [e instanceof Error ? e.message : String(e)]),
        tone: "error",
      });
    }
  };

  const editingHolding = editing && editing !== "new" ? effectiveHoldings.find((h) => h.id === editing) : undefined;
  const today = localDate();
  const priceDate = index?.tickers[0]?.lastDate;
  const usdtwd = fx.USDTWD;

  return (
    <div className="portfolio">
      {isSample && !isTx && (
        <div className="banner sample-banner" role="status">
          <span>
            {t("目前顯示的是")}<b>{t("範例持股")}</b>
            {t("（隨意設定的數字，不是任何人的真實持股）。")}
          </span>
          <span className="banner-actions">
            <button type="button" className="btn-primary" onClick={clearSample}>
              {t("清除範例，開始輸入")}
            </button>
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
              {t("匯入檔案")}
            </button>
          </span>
        </div>
      )}

      <div className="card">
        <div className="screener-head">
          <h2>{t("投資組合")}</h2>
          <div className="toolbar">
            {/* 組合分析放在投資組合裡（導覽列維持 5 格） */}
            <a className="btn-ghost btn-link-as-button" href={ANALYSIS_HREF}>
              {t("📊 組合分析 →")}
            </a>
            {!isTx && (
              <button type="button" className="btn-primary" onClick={() => setEditing("new")} disabled={editing === "new"}>
                {t("＋ 新增持股")}
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={exportFile} disabled={holdings.length === 0 && transactions.length === 0}>
              {t("匯出")}
            </button>
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
              {t("匯入")}
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

        <div className="mode-row">
          <div className="segmented" role="radiogroup" aria-label={t("持股來源")}>
            {(
              [
                ["holdings", t("直接輸入持股")],
                ["transactions", t("用交易紀錄計算")],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? "active" : ""}
                onClick={() => {
                  setMode(m);
                  setEditing(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="muted small">
            {isTx
              ? t("持股的股數與平均成本由下方交易紀錄自動計算，並算出已實現損益、股利與 XIRR。")
              : t("只記目前持股與平均成本；想看已實現損益與年化報酬，可以改用交易紀錄。")}
          </span>
        </div>

        {message && (
          <p className={`flash ${message.tone === "error" ? "error" : ""}`} role="status">
            {message.text}
            <button type="button" className="icon-btn" aria-label={t("關閉訊息")} onClick={() => setMessage(null)}>
              ×
            </button>
          </p>
        )}

        {indexError && <p className="error">{t("報價讀取失敗：{0}（持股資料仍保存在瀏覽器）", [indexError])}</p>}

        <SummaryCards summary={summary} settings={settings} fx={fx} redUp={redUp} />

        <p className="hint">
          {priceDate && t("現價為 {0} 收盤價。", [priceDate])}
          {usdtwd ? t("台股以 USD/TWD {0} 換算成美元後再加總。", [usdtwd.toFixed(2)]) : ""}
          {summary.missingQuotes > 0 && t(" {0} 檔不在觀察清單、沒有報價，未計入總計。", [summary.missingQuotes])}
          {summary.missingFx && t(" 目前沒有匯率資料，台股未計入總計。")}
        </p>
      </div>

      {(editing === "new" || editingHolding) && (
        <div className="card">
          <HoldingForm
            key={editing ?? "none"}
            initial={editingHolding}
            metaOnly={isTx}
            symbols={symbols}
            settings={settings}
            onSubmit={saveHolding}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="card">
        <h3 className="section-title">{t("持股明細")}</h3>
        {isTx && summary.rows.length === 0 ? (
          <p className="muted empty">{t("目前沒有持股（新增買進交易後會出現在這裡）。")}</p>
        ) : (
          <HoldingsTable
            rows={summary.rows}
            redUp={redUp}
            alertPct={settings.alertPct}
            onEdit={(id) => setEditing(id)}
            onDelete={
              isTx
                ? undefined
                : (id) => {
                    const rest = holdings.filter((h) => h.id !== id);
                    setHoldings(rest);
                    if (rest.length === 0) setIsSample(false); // 範例都刪光了就不再顯示範例提示
                  }
            }
          />
        )}
        <SettingsPanel key={settingsVersion} settings={settings} onChange={setSettings} />
        <p className="hint">{t("🔒 持股與交易紀錄只存在這個瀏覽器，不會上傳。換電腦或清除瀏覽資料前，請先「匯出」備份。")}</p>
      </div>

      {isTx && (
        <TransactionsPanel
          transactions={transactions}
          onAdd={(t) => setTransactions((ts) => [...ts, t])}
          onDelete={(id) => setTransactions((ts) => ts.filter((t) => t.id !== id))}
          onLoadSample={() => setTransactions(sampleTransactions())}
          quotes={quotes}
          fx={fx}
          fxHistory={fxHistory}
          settings={settings}
          redUp={redUp}
          symbols={symbols}
          today={today}
          priceDate={priceDate ?? today}
        />
      )}
    </div>
  );
}

/** 今天的日期（使用者當地時間），YYYY-MM-DD */
function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
