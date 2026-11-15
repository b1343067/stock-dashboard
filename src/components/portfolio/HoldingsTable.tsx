// 持股明細表。桌機是表格；手機每一列變成一張卡片（見 styles.css 的 .holdings-table）。

import { chartHref } from "../../lib/route";
import { fmtMoney, fmtNum, fmtPct, fmtSignedMoney, pnlClass } from "../../lib/format";
import type { HoldingRow, StopStatus } from "../../lib/portfolio";

interface Props {
  rows: HoldingRow[];
  redUp: boolean;
  alertPct: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const STATUS_LABEL: Record<StopStatus, string> = {
  none: "",
  normal: "",
  "tp-near": "接近停利",
  "tp-hit": "已達停利",
  "sl-near": "接近停損",
  "sl-hit": "已觸及停損",
};

export default function HoldingsTable({ rows, redUp, alertPct, onEdit, onDelete }: Props) {
  if (rows.length === 0) {
    return <p className="muted empty">還沒有持股。按「＋ 新增持股」開始，或匯入之前匯出的檔案。</p>;
  }

  // 停利 = 獲利方向的顏色；停損 = 虧損方向的顏色（跟著紅漲綠跌設定）
  const upCls = redUp ? "red" : "green";
  const downCls = redUp ? "green" : "red";
  const rowTone = (s: StopStatus) =>
    s === "tp-near" || s === "tp-hit" ? `alert-${upCls}` : s === "sl-near" || s === "sl-hit" ? `alert-${downCls}` : "";

  return (
    <div className="table-scroll">
      <table className="holdings-table">
        <thead>
          <tr>
            <th>股票</th>
            <th className="num">股數</th>
            <th className="num">成本</th>
            <th className="num">現價</th>
            <th className="num">市值</th>
            <th className="num">未實現損益</th>
            <th className="num">比重</th>
            <th>停利／停損</th>
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const h = r.holding;
            const c = r.currency;
            const label = STATUS_LABEL[r.status];
            const hit = r.status === "tp-hit" || r.status === "sl-hit";
            return (
              <tr key={h.id} className={rowTone(r.status)}>
                <td data-label="股票" className="cell-stock">
                  <a href={chartHref(h.symbol)} className="stock-link">
                    {h.symbol}
                  </a>
                  <span className={`type-tag ${h.type}`}>{h.type === "core" ? "核心" : "短線"}</span>
                  <small className="muted stock-name">{r.quote?.name ?? "無報價"}</small>
                </td>
                <td data-label="股數" className="num">
                  {fmtNum(h.shares, 4)}
                </td>
                <td data-label="成本" className="num">
                  {fmtMoney(h.cost, c, 2)}
                </td>
                <td data-label="現價" className="num">
                  {r.quote ? fmtMoney(r.quote.price, c, 2) : "—"}
                </td>
                <td data-label="市值" className="num">
                  {fmtMoney(r.marketValue, c)}
                </td>
                <td data-label="未實現損益" className={`num ${pnlClass(r.pnl, redUp)}`}>
                  {fmtSignedMoney(r.pnl, c)}
                  <small> {fmtPct(r.returnPct, 2, true)}</small>
                </td>
                <td data-label="比重" className="num">
                  {fmtPct(r.weightPct, 1)}
                </td>
                <td data-label="停利／停損" className="cell-stop">
                  {h.type === "short" ? (
                    <>
                      <span className="stop-line">
                        <span className="muted">停利</span> {fmtMoney(r.tpPrice, c, 2)}{" "}
                        <small className="muted">
                          +{r.tpPctUsed}%{r.toTpPct !== null && r.toTpPct > 0 ? ` · 差 ${r.toTpPct.toFixed(1)}%` : ""}
                        </small>
                      </span>
                      <span className="stop-line">
                        <span className="muted">停損</span> {fmtMoney(r.slPrice, c, 2)}{" "}
                        <small className="muted">
                          −{r.slPctUsed}%{r.toSlPct !== null && r.toSlPct > 0 ? ` · 差 ${r.toSlPct.toFixed(1)}%` : ""}
                        </small>
                      </span>
                      {label && (
                        <span className={`stop-badge${hit ? " hit" : ""}`} title={`距離 ${alertPct}% 以內會提醒`}>
                          {hit ? "●" : "▲"} {label}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="cell-actions">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => onEdit(h.id)}>
                    編輯
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`刪除 ${h.symbol}`}
                    title="刪除"
                    onClick={() => window.confirm(`確定刪除 ${h.symbol}？`) && onDelete(h.id)}
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
  );
}
