// 相關係數熱力圖
// 顏色：發散色（藍 = 正相關、紅 = 負相關、灰 = 接近 0），顏色深淺代表強弱。
// 每格都印出數字，所以不靠顏色也能讀；滑鼠移上去有完整說明。

interface Props {
  symbols: string[];
  corr: number[][];
}

/** 相關係數 → 背景色：用 CSS color-mix 在「中間灰」和「正／負極色」之間調配 */
function cellColor(r: number): string {
  if (!Number.isFinite(r)) return "var(--div-mid)";
  const pole = r >= 0 ? "var(--div-pos)" : "var(--div-neg)";
  const pct = Math.round(Math.min(1, Math.abs(r)) * 100);
  return `color-mix(in oklab, ${pole} ${pct}%, var(--div-mid))`;
}

function describe(r: number): string {
  const a = Math.abs(r);
  const strength = a >= 0.7 ? "高度" : a >= 0.4 ? "中度" : a >= 0.2 ? "低度" : "幾乎無";
  return a < 0.2 ? "幾乎無相關" : `${strength}${r > 0 ? "正" : "負"}相關`;
}

export default function CorrelationHeatmap({ symbols, corr }: Props) {
  const n = symbols.length;
  return (
    <div className="heatmap-wrap">
      <div
        className="heatmap"
        role="table"
        aria-label="相關係數矩陣"
        style={{ gridTemplateColumns: `auto repeat(${n}, minmax(44px, 1fr))` }}
      >
        <div role="row" className="hm-row-contents">
          <span className="hm-corner" />
          {symbols.map((s) => (
            <span key={s} role="columnheader" className="hm-col">
              {s}
            </span>
          ))}
        </div>
        {symbols.map((a, i) => (
          <div role="row" key={a} className="hm-row-contents">
            <span role="rowheader" className="hm-row">
              {a}
            </span>
            {symbols.map((b, j) => {
              const r = corr[i][j];
              const strong = Math.abs(r) >= 0.55;
              return (
                <span
                  key={b}
                  role="cell"
                  className={`hm-cell${strong ? " strong" : ""}${i === j ? " diag" : ""}`}
                  style={{ background: cellColor(r) }}
                  title={i === j ? a : `${a} × ${b}：${r.toFixed(2)}（${describe(r)}）`}
                >
                  {i === j ? "—" : r.toFixed(2)}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="hm-legend" aria-hidden="true">
        <span>−1 負相關</span>
        <span className="hm-scale" />
        <span>+1 正相關</span>
      </div>
    </div>
  );
}
