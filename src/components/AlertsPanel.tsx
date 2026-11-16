// 價格提醒面板：新增提醒、看每個提醒的狀態、刪除
// 桌機從右邊滑出、手機從下方滑出。提醒只存在這個瀏覽器（localStorage）。

import { useEffect, useMemo, useRef, useState } from "react";
import {
  KIND_META,
  KIND_ORDER,
  acknowledge,
  alertState,
  describeAlert,
  evaluateAlert,
  newAlert,
  type AlertKind,
  type AlertState,
  type Quote,
} from "../lib/alerts";
import { setAlerts, useAlerts } from "../lib/alertsStore";
import { chartHref } from "../lib/route";
import type { TickerSummary } from "../lib/types";
import { t } from "../lib/i18n";

interface Props {
  tickers: TickerSummary[];
  quotes: Record<string, Quote>;
  /** 從看盤頁打開時，預先帶入股票與現價 */
  prefill?: { symbol: string; price: number } | null;
  onClose: () => void;
}

const STATE_LABEL: Record<AlertState, string> = {
  triggered: "已觸發",
  acknowledged: "今日已確認",
  watching: "監控中",
  disabled: "已停用",
  noData: "沒有資料",
};
// 已觸發的排最前面
const STATE_ORDER: AlertState[] = ["triggered", "acknowledged", "watching", "noData", "disabled"];

function fmtCurrent(kind: AlertKind, v: number | null): string {
  if (v === null) return "—";
  if (kind.startsWith("change")) return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
  if (kind.startsWith("rsi")) return v.toFixed(1);
  return v.toFixed(2);
}

export default function AlertsPanel({ tickers, quotes, prefill, onClose }: Props) {
  const alerts = useAlerts();
  const [symbol, setSymbol] = useState(prefill?.symbol ?? "");
  const [kind, setKind] = useState<AlertKind>("priceAbove");
  const [value, setValue] = useState(prefill ? prefill.price.toFixed(2) : "");
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc 關閉；打開時把焦點移到面板（鍵盤使用者才找得到）
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sorted = useMemo(
    () =>
      alerts
        .map((a) => ({ a, state: alertState(a, quotes[a.symbol]), current: evaluateAlert(a, quotes[a.symbol]).current }))
        .sort((x, y) => STATE_ORDER.indexOf(x.state) - STATE_ORDER.indexOf(y.state)),
    [alerts, quotes],
  );

  // 換條件種類時，數值欄位給合理的預設（價格用現價、漲跌用 3%、RSI 用 30／70）
  const changeKind = (k: AlertKind) => {
    setKind(k);
    const q = quotes[symbol.trim().toUpperCase()];
    if (k.startsWith("price")) setValue(q ? q.close.toFixed(2) : "");
    else if (k.startsWith("change")) setValue("3");
    else setValue(k === "rsiAbove" ? "70" : "30");
  };

  const add = () => {
    const sym = symbol.trim().toUpperCase();
    const v = Number(value);
    if (!sym) return setError(t("請輸入股票代號"));
    if (!tickers.some((t) => t.symbol === sym)) return setError(t("{0} 不在觀察清單，沒有資料可以檢查", [sym]));
    if (!Number.isFinite(v) || value.trim() === "") return setError(t("請輸入數值"));
    if (kind.startsWith("price") && v <= 0) return setError(t("價格必須大於 0"));
    if (kind.startsWith("rsi") && (v < 0 || v > 100)) return setError(t("RSI 介於 0～100"));
    if (kind.startsWith("change") && v <= 0) return setError(t("漲跌幅請輸入大於 0 的數字，例如 3"));
    setAlerts([...alerts, newAlert(sym, kind, v, repeat)]);
    setError(null);
  };

  const dates = Object.fromEntries(Object.entries(quotes).map(([s, q]) => [s, q.date]));
  const triggeredIds = sorted.filter((x) => x.state === "triggered").map((x) => x.a.id);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alerts-title"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 id="alerts-title">{t("價格提醒")}</h2>
          <button type="button" className="icon-btn" aria-label={t("關閉")} onClick={onClose}>
            ×
          </button>
        </div>

        <form
          className="alert-form"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            className="text-input"
            list="alert-symbols"
            placeholder={t("代號，例如 TSLA")}
            aria-label={t("股票代號")}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            autoCapitalize="characters"
          />
          <datalist id="alert-symbols">
            {tickers.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.name}
              </option>
            ))}
          </datalist>
          <div className="alert-cond">
            <select aria-label={t("條件")} value={kind} onChange={(e) => changeKind(e.target.value as AlertKind)}>
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {t(KIND_META[k].label)}
                </option>
              ))}
            </select>
            <input
              className="num-input"
              type="number"
              inputMode="decimal"
              step="any"
              aria-label={t("數值")}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {KIND_META[kind].unit && <span className="muted small alert-unit">{t(KIND_META[kind].unit)}</span>}
          </div>
          <div className="alert-submit">
            <label className="check small">
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> {" "}{t("每天重複提醒")}
            </label>
            <button type="submit" className="btn-primary">
              {t("新增")}
            </button>
          </div>
          {error && (
            <p className="error small alert-error" role="alert">
              {error}
            </p>
          )}
        </form>

        {triggeredIds.length > 0 && (
          <button type="button" className="btn-ghost ack-all" onClick={() => setAlerts(acknowledge(alerts, triggeredIds, dates))}>
            {t("全部標為已讀（{0}）", [triggeredIds.length])}
          </button>
        )}

        {sorted.length === 0 ? (
          <p className="muted empty">
            {t("還沒有提醒。例如：「TSLA 收盤價跌到 300 以下」「NVDA RSI 低於 30」。")}
          </p>
        ) : (
          <ul className="alert-list">
            {sorted.map(({ a, state, current }) => (
              <li key={a.id} className={`alert-item state-${state}`}>
                <div className="alert-main">
                  <a href={chartHref(a.symbol)} onClick={onClose}>
                    {describeAlert(a)}
                  </a>
                  <span className="muted small">
                    {t("目前 {0}{1}", [fmtCurrent(a.kind, current), a.repeat ? t(" · 每天重複") : t(" · 提醒一次")])}
                  </span>
                </div>
                <span className={`alert-state state-${state}`}>{t(STATE_LABEL[state])}</span>
                {state === "triggered" && (
                  <button type="button" className="btn-link" onClick={() => setAlerts(acknowledge(alerts, [a.id], dates))}>
                    {t("知道了")}
                  </button>
                )}
                <button type="button" className="icon-btn" aria-label={t("刪除提醒：{0}", [describeAlert(a)])} onClick={() => setAlerts(alerts.filter((x) => x.id !== a.id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">
          {t("🔔 每次打開網站時，用最新的收盤資料檢查（資料每天台灣時間早上 6 點更新）。這是靜態網站，沒打開時無法推播通知。提醒只存在這個瀏覽器。")}
        </p>
      </div>
    </div>
  );
}
