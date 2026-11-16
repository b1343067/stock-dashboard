// 新增一筆交易：日期、代號、買進／賣出／股利、股數、價格、手續費（或股利金額）

import { useId, useState } from "react";
import { guessCurrency } from "../../lib/portfolio";
import { TX_LABEL, newTxId, type Transaction, type TxType } from "../../lib/transactions";
import { t } from "../../lib/i18n";

interface Props {
  symbols: { symbol: string; name: string; currency: string }[];
  /** 預設日期（今天；測試可以傳固定值） */
  today: string;
  onSubmit: (t: Transaction) => void;
  onCancel: () => void;
}

export default function TransactionForm({ symbols, today, onSubmit, onCancel }: Props) {
  const listId = useId();
  const [type, setType] = useState<TxType>("buy");
  const [date, setDate] = useState(today);
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sym = symbol.trim().toUpperCase();
  const known = symbols.find((s) => s.symbol === sym);
  const currency = known?.currency ?? guessCurrency(sym);

  const submit = () => {
    const n = (v: string) => (v.trim() === "" ? 0 : Number(v));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return setError(t("請選擇日期"));
    if (date > today) return setError(t("日期不能在未來"));
    if (!sym) return setError(t("請輸入股票代號"));
    const f = n(fee);
    if (!Number.isFinite(f) || f < 0) return setError(t("手續費不能是負數"));
    if (type === "dividend") {
      const a = n(amount);
      if (!Number.isFinite(a) || a <= 0) return setError(t("股利金額必須大於 0"));
      onSubmit({ id: newTxId(), date, symbol: sym, type, shares: 0, price: 0, fee: 0, amount: a });
    } else {
      const s = n(shares);
      const p = n(price);
      if (!Number.isFinite(s) || s <= 0) return setError(t("股數必須大於 0"));
      if (!Number.isFinite(p) || p <= 0) return setError(t("價格必須大於 0"));
      onSubmit({ id: newTxId(), date, symbol: sym, type, shares: s, price: p, fee: f, amount: 0 });
    }
    // 送出後保留日期與代號，方便連續輸入同一檔的多筆交易
    setShares("");
    setPrice("");
    setFee("");
    setAmount("");
    setError(null);
  };

  return (
    <form
      className="holding-form tx-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 className="section-title">{t("新增交易")}</h3>
      <div className="form-grid">
        <div className="field">
          <span>{t("種類")}</span>
          <div className="segmented" role="radiogroup" aria-label={t("交易種類")}>
            {(Object.keys(TX_LABEL) as TxType[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={type === k} className={type === k ? "active" : ""} onClick={() => setType(k)}>
                {t(TX_LABEL[k])}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>{t("日期")}</span>
          <input className="text-input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
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
        {type === "dividend" ? (
          <label className="field">
            <span>{t("實領股利（{0}，扣稅後）", [currency])}</span>
            <input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        ) : (
          <>
            <label className="field">
              <span>{t("股數")}</span>
              <input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={shares} onChange={(e) => setShares(e.target.value)} />
            </label>
            <label className="field">
              <span>{t("成交價（每股，{0}）", [currency])}</span>
              <input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <label className="field">
              <span>{t("手續費＋稅（{0}，可空白）", [currency])}</span>
              <input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={fee} onChange={(e) => setFee(e.target.value)} />
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
          {t("新增")}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          {t("完成")}
        </button>
      </div>
    </form>
  );
}
