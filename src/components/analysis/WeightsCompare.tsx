// 目前權重 vs 建議權重（夏普值最佳化）的比較
// 每檔兩條橫條：藍 = 目前、橘 = 建議，旁邊印出數字與差異，不只靠顏色辨識。

import { fmtPct } from "../../lib/format";

interface Props {
  symbols: string[];
  current: number[];
  suggested: number[];
  lo: number;
  hi: number;
}

export default function WeightsCompare({ symbols, current, suggested, lo, hi }: Props) {
  const max = Math.max(hi, ...current, ...suggested);
  const w = (x: number) => `${(x / max) * 100}%`;
  return (
    <div className="wc">
      <div className="wc-legend">
        <span>
          <i className="swatch" style={{ background: "var(--s1)" }} /> 目前權重
        </span>
        <span>
          <i className="swatch" style={{ background: "var(--s2)" }} /> 建議權重
        </span>
        <span className="muted">限制 {lo * 100}%～{hi * 100}%（虛線）</span>
      </div>
      <table className="wc-table">
        <thead>
          <tr>
            <th>股票</th>
            <th className="wc-bar-col" aria-label="權重圖" />
            <th className="num">目前</th>
            <th className="num">建議</th>
            <th className="num">差異</th>
          </tr>
        </thead>
        <tbody>
          {symbols.map((s, i) => {
            const d = suggested[i] - current[i];
            return (
              <tr key={s}>
                <td className="wc-sym">{s}</td>
                <td className="wc-bar-col">
                  <div className="wc-bars" title={`${s}：目前 ${fmtPct(current[i] * 100, 1)} → 建議 ${fmtPct(suggested[i] * 100, 1)}`}>
                    <span className="wc-limit" style={{ left: w(lo) }} />
                    <span className="wc-limit" style={{ left: w(hi) }} />
                    <span className="wc-bar" style={{ width: w(current[i]), background: "var(--s1)" }} />
                    <span className="wc-bar" style={{ width: w(suggested[i]), background: "var(--s2)" }} />
                  </div>
                </td>
                <td className="num">{fmtPct(current[i] * 100, 1)}</td>
                <td className="num">{fmtPct(suggested[i] * 100, 1)}</td>
                <td className={`num ${Math.abs(d) < 0.005 ? "muted" : ""}`}>
                  {Math.abs(d) < 0.005 ? "—" : `${d > 0 ? "▲ +" : "▼ "}${(d * 100).toFixed(1)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
