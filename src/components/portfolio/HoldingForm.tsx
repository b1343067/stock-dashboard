// 新增／編輯一筆持股的表單

import { useId, useState } from "react";
import { guessCurrency, newHoldingId, type Holding, type HoldingType, type PortfolioSettings } from "../../lib/portfolio";
import { t } from "../../lib/i18n";

interface Props {
  /** 編輯時傳入原本的持股；新增時為 undefined */
  initial?: Holding;
  /** 觀察清單的代號（有報價的股票），給輸入框做自動完成 */
  symbols: { symbol: string; name: string; currency: string }[];
  settings: PortfolioSettings;
  onSubmit: (h: Holding) => void;
  onCancel: () => void;
  /** 交易紀錄模式：股數與成本由交易計算，只能改類型與停利停損 */
  metaOnly?: boolean;
}

export default function HoldingForm({ initial, symbols, settings, onSubmit, onCancel, metaOnly = false }: Props) {
  const listId = useId();
  // 輸入框的值先用字串存，送出時才轉數字（避免打字到一半就被改掉）
  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [shares, setShares] = useState(initial ? String(initial.shares) : "");
  const [cost, setCost] = useState(initial ? String(initial.cost) : "");
  const [type, setType] = useState<HoldingType>(initial?.type ?? "core");
  const [tp, setTp] = useState(initial?.tpPct != null ? String(initial.tpPct) : "");
  const [sl, setSl] = useState(initial?.slPct != null ? String(initial.slPct) : "");
  const [error, setError] = useState<string | null>(null);

  const sym = symbol.trim().toUpperCase();
  const known = symbols.find((s) => s.symbol === sym);
  const currency = known?.currency ?? guessCurrency(sym);

  const submit = () => {
    const nShares = Number(shares);
    const nCost = Number(cost);
    const nTp = tp.trim() === "" ? null : Number(tp);
    const nSl = sl.trim() === "" ? null : Number(sl);
    if (!sym) return setError(t("請輸入股票代號"));
    if (!Number.isFinite(nShares) || nShares <= 0) return setError(t("股數必須大於 0"));
    if (!Number.isFinite(nCost) || nCost <= 0) return setError(t("成本必須大於 0"));
    if (nTp !== null && (!Number.isFinite(nTp) || nTp <= 0)) return setError(t("停利 % 必須大於 0"));
    if (nSl !== null && (!Number.isFinite(nSl) || nSl <= 0 || nSl >= 100)) return setError(t("停損 % 必須介於 0～100"));
    onSubmit({
      id: initial?.id ?? newHoldingId(),
      symbol: sym,
      shares: nShares,
      cost: nCost,
      type,
      tpPct: type === "short" ? nTp : initial?.tpPct ?? null,
      slPct: type === "short" ? nSl : initial?.slPct ?? null,
    });
  };

  return (
    <form
      className="holding-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 className="section-title">{initial ? t("編輯 {0}", [initial.symbol]) : t("新增持股")}</h3>
      <div className="form-grid">
        <label className="field">
          <span>{t("股票代號")}</span>
          <input
            className="text-input"
            list={listId}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder={t("例如 VOO、0050.TW")}
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus={!initial}
            disabled={metaOnly}
          />
          <datalist id={listId}>
            {symbols.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.name}
              </option>
            ))}
          </datalist>
          {sym && (
            <small className={known ? "muted" : "warn-text"}>
              {known ? `${known.name} · ${known.currency}` : t("不在觀察清單，沒有報價（可加入 config/watchlist.json）")}
            </small>
          )}
        </label>

        <label className="field">
          <span>{t("股數")}</span>
          <input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={shares} disabled={metaOnly} onChange={(e) => setShares(e.target.value)} />
        </label>

        <label className="field">
          <span>{t("平均成本（每股，{0}）", [currency])}</span>
          <input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={cost} disabled={metaOnly} onChange={(e) => setCost(e.target.value)} />
          {metaOnly && <small className="muted">{t("股數與成本由交易紀錄計算")}</small>}
        </label>

        <div className="field">
          <span>{t("類型")}</span>
          <div className="segmented" role="radiogroup" aria-label={t("類型")}>
            {(["core", "short"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={type === k} className={type === k ? "active" : ""} onClick={() => setType(k)}>
                {k === "core" ? t("核心") : t("短線")}
              </button>
            ))}
          </div>
        </div>

        {type === "short" && (
          <>
            <label className="field">
              <span>{t("停利 %（空白 = 預設 {0}%）", [settings.defaultTpPct])}</span>
              <input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={tp} placeholder={String(settings.defaultTpPct)} onChange={(e) => setTp(e.target.value)} />
            </label>
            <label className="field">
              <span>{t("停損 %（空白 = 預設 {0}%）", [settings.defaultSlPct])}</span>
              <input className="text-input" type="number" inputMode="decimal" min="0" max="99" step="any" value={sl} placeholder={String(settings.defaultSlPct)} onChange={(e) => setSl(e.target.value)} />
            </label>
          </>
        )}
      </div>

      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn-primary">
          {initial ? t("儲存") : t("新增")}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          {t("取消")}
        </button>
      </div>
    </form>
  );
}
