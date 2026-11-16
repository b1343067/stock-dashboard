// 交易紀錄模式（加碼 C）：報酬總覽（已實現、股利、未實現、XIRR）、每檔報酬、交易清單
// 計算都在 src/lib/transactions.ts；這裡只負責顯示。

import { useMemo, useState } from "react";
import TransactionForm from "./TransactionForm";
import { fmtMoney, fmtPct, fmtSignedMoney, pnlClass } from "../../lib/format";
import { fromUsd, type PortfolioSettings, type Quote } from "../../lib/portfolio";
import { TX_LABEL, buildLedger, positionStats, totals, type Transaction } from "../../lib/transactions";

interface Props {
  transactions: Transaction[];
  onAdd: (t: Transaction) => void;
  onDelete: (id: string) => void;
  onLoadSample: () => void;
  quotes: Record<string, Quote>;
  fx: Record<string, number>;
  fxHistory: { time: string[]; close: number[] } | null;
  settings: PortfolioSettings;
  redUp: boolean;
  symbols: { symbol: string; name: string; currency: string }[];
  today: string;
  /** 現價的日期（最新收盤日），XIRR 的最後一筆現金流放在這天 */
  priceDate: string;
}

export default function TransactionsPanel(props: Props) {
  const { transactions: txs, quotes, fx, fxHistory, settings, redUp, priceDate } = props;
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const currencyOf = (s: string) => quotes[s]?.currency ?? (/\.TWO?$/.test(s) ? "TWD" : "USD");
  const ledger = useMemo(() => buildLedger(txs, currencyOf), [txs, quotes]); // eslint 沒裝；currencyOf 只依賴 quotes
  const prices = useMemo(() => Object.fromEntries(Object.entries(quotes).map(([k, q]) => [k, q.price])), [quotes]);
  const stats = useMemo(() => positionStats(txs, ledger, prices, priceDate), [txs, ledger, prices, priceDate]);
  const tt = useMemo(() => totals(txs, stats, fxHistory, fx.USDTWD, priceDate), [txs, stats, fxHistory, fx, priceDate]);

  const ccy = settings.displayCurrency;
  const show = (usd: number) => fromUsd(usd, ccy, fx);
  // 交易清單：新的在上面
  const sorted = useMemo(() => [...txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [txs]);
  const visible = showAll ? sorted : sorted.slice(0, 15);

  return (
    <div className="card tx-panel">
      <div className="screener-head">
        <h3 className="section-title">交易紀錄與報酬</h3>
        <div className="toolbar">
          <button type="button" className="btn-primary" onClick={() => setAdding(true)} disabled={adding}>
            ＋ 新增交易
          </button>
        </div>
      </div>

      {adding && (
        <TransactionForm
          symbols={props.symbols}
          today={props.today}
          onSubmit={props.onAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {txs.length === 0 ? (
        <div className="empty tx-empty">
          <p className="muted">還沒有交易紀錄。輸入每一筆買進、賣出、股利，就能算出已實現損益與真正的年化報酬（XIRR）。</p>
          <button type="button" className="btn-ghost" onClick={props.onLoadSample}>
            載入範例交易看看
          </button>
        </div>
      ) : (
        <>
          <div className="summary-grid tx-summary">
            <Stat label="已實現損益" value={fmtSignedMoney(show(tt.realizedUsd), ccy)} cls={pnlClass(tt.realizedUsd, redUp)} note="賣出的部分賺賠多少" />
            <Stat label="股利收入" value={fmtMoney(show(tt.dividendsUsd), ccy)} note="實領金額合計" />
            <Stat label="未實現損益" value={fmtSignedMoney(show(tt.unrealizedUsd), ccy)} cls={pnlClass(tt.unrealizedUsd, redUp)} note="還持有的部分" />
            <Stat
              label="總損益"
              value={fmtSignedMoney(show(tt.totalPnlUsd), ccy)}
              cls={pnlClass(tt.totalPnlUsd, redUp)}
              note={`投入本金 ${fmtMoney(show(tt.investedUsd), ccy)}`}
            />
            <Stat
              label="年化報酬（XIRR）"
              value={tt.xirr === null ? "—" : fmtPct(tt.xirr * 100, 2, true)}
              cls={pnlClass(tt.xirr, redUp)}
              note="考慮每筆錢投入多久"
            />
          </div>
          {ledger.warnings.length > 0 && (
            <ul className="tx-warnings warn-text small" role="alert">
              {ledger.warnings.map((w) => (
                <li key={w}>⚠️ {w}</li>
              ))}
            </ul>
          )}
          {tt.missing.length > 0 && <p className="hint">{tt.missing.join("、")} 不在觀察清單、沒有報價，未計入總計。</p>}

          <h4 className="sub-title">每檔報酬</h4>
          <div className="table-scroll">
            <table className="data-table tx-stats">
              <thead>
                <tr>
                  <th>股票</th>
                  <th className="num">持有股數</th>
                  <th className="num">平均成本</th>
                  <th className="num">已實現</th>
                  <th className="num">股利</th>
                  <th className="num">未實現</th>
                  <th className="num">總報酬</th>
                  <th className="num">XIRR</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.symbol}>
                    <td>
                      <b>{s.symbol}</b> <span className="muted small">{s.currency}</span>
                    </td>
                    <td className="num">{s.shares > 0 ? s.shares.toLocaleString("zh-TW", { maximumFractionDigits: 4 }) : "已出清"}</td>
                    <td className="num">{s.shares > 0 ? fmtMoney(s.avgCost, s.currency, 2) : "—"}</td>
                    <td className={`num ${pnlClass(s.realized, redUp)}`}>{fmtSignedMoney(s.realized, s.currency)}</td>
                    <td className="num">{s.dividends ? fmtMoney(s.dividends, s.currency) : "—"}</td>
                    <td className={`num ${pnlClass(s.unrealized, redUp)}`}>{fmtSignedMoney(s.unrealized, s.currency)}</td>
                    <td className={`num ${pnlClass(s.totalPnl, redUp)}`}>{fmtPct(s.totalReturnPct, 1, true)}</td>
                    <td className={`num ${pnlClass(s.xirr, redUp)}`}>{s.xirr === null ? "—" : fmtPct(s.xirr * 100, 1, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="sub-title">交易清單（{txs.length} 筆）</h4>
          <div className="table-scroll">
            <table className="data-table tx-list">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>種類</th>
                  <th>股票</th>
                  <th className="num">股數</th>
                  <th className="num">價格</th>
                  <th className="num">費用</th>
                  <th className="num">金額</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const c = currencyOf(t.symbol);
                  const amount = t.type === "buy" ? -(t.shares * t.price + t.fee) : t.type === "sell" ? t.shares * t.price - t.fee : t.amount;
                  return (
                    <tr key={t.id}>
                      <td className="tx-date">{t.date}</td>
                      <td>
                        <span className={`tx-type tx-${t.type}`}>{TX_LABEL[t.type]}</span>
                      </td>
                      <td>{t.symbol}</td>
                      <td className="num">{t.type === "dividend" ? "—" : t.shares.toLocaleString("zh-TW", { maximumFractionDigits: 4 })}</td>
                      <td className="num">{t.type === "dividend" ? "—" : fmtMoney(t.price, c, 2)}</td>
                      <td className="num">{t.fee ? fmtMoney(t.fee, c) : "—"}</td>
                      <td className="num">{fmtSignedMoney(amount, c)}</td>
                      <td className="cell-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`刪除 ${t.date} ${t.symbol} ${TX_LABEL[t.type]}`}
                          title="刪除"
                          onClick={() => window.confirm(`刪除 ${t.date} ${t.symbol} ${TX_LABEL[t.type]}？`) && props.onDelete(t.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sorted.length > 15 && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? "只顯示最近 15 筆" : `顯示全部 ${sorted.length} 筆`}
            </button>
          )}
          <p className="hint">
            成本用「移動平均成本法」：賣出時以當時的平均成本計算已實現損益。XIRR 把目前市值當成 {priceDate} 拿回的錢，
            依每筆現金流的日期計算年化報酬；整體以美元計算，台股每筆依交易當天的匯率換算
            {fxHistory ? "" : "（目前沒有歷史匯率，暫用最新匯率）"}。持有不到幾個月時 XIRR 會被放大，參考就好。
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note, cls = "" }: { label: string; value: string; note?: string; cls?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${cls}`}>{value}</div>
      {note && <div className="stat-note muted">{note}</div>}
    </div>
  );
}
