// 效率前緣圖（SVG）
// 橫軸 = 預期波動（風險）、縱軸 = 預期報酬（CAPM）。
// 灰點：在權重限制內隨機產生的組合；線：同樣風險下報酬最高的組合（效率前緣）；
// 藍點：目前組合；橘點：夏普值最佳化的建議組合。

import { useMemo, useState } from "react";
import type { SimPoint } from "../../lib/analytics";

interface Props {
  cloud: SimPoint[];
  frontier: SimPoint[];
  current: SimPoint;
  suggested: SimPoint | null;
}

const W = 720;
const H = 360;
const PAD = { l: 56, r: 20, t: 16, b: 44 };

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-12; v += step) out.push(v);
  return out;
}

export default function FrontierChart({ cloud, frontier, current, suggested }: Props) {
  const [hover, setHover] = useState<{ label: string; p: SimPoint } | null>(null);

  const scale = useMemo(() => {
    const all = [...cloud, current, ...(suggested ? [suggested] : [])];
    const vMin = Math.min(...all.map((p) => p.vol));
    const vMax = Math.max(...all.map((p) => p.vol));
    const rMin = Math.min(...all.map((p) => p.ret));
    const rMax = Math.max(...all.map((p) => p.ret));
    const vPad = (vMax - vMin) * 0.08 || 0.01;
    const rPad = (rMax - rMin) * 0.12 || 0.01;
    const x0 = vMin - vPad, x1 = vMax + vPad, y0 = rMin - rPad, y1 = rMax + rPad;
    return {
      x: (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * (W - PAD.l - PAD.r),
      y: (r: number) => H - PAD.b - ((r - y0) / (y1 - y0)) * (H - PAD.t - PAD.b),
      xt: niceTicks(x0, x1),
      yt: niceTicks(y0, y1),
    };
  }, [cloud, current, suggested]);

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const line = frontier.map((p, i) => `${i ? "L" : "M"}${scale.x(p.vol).toFixed(1)},${scale.y(p.ret).toFixed(1)}`).join(" ");

  // side：標籤放在點的左上（"left"）或右下（"right"）；兩個點常常很靠近，分開放才不會重疊
  const marker = (label: string, p: SimPoint, color: string, side: "left" | "right") => (
    <g
      className="fr-marker"
      onMouseEnter={() => setHover({ label, p })}
      onMouseLeave={() => setHover(null)}
      tabIndex={0}
      onFocus={() => setHover({ label, p })}
      onBlur={() => setHover(null)}
      aria-label={`${label}：預期報酬 ${pct(p.ret)}、波動 ${pct(p.vol)}、夏普值 ${p.sharpe.toFixed(2)}`}
    >
      {/* 比點大的透明圓：滑鼠比較好指到 */}
      <circle cx={scale.x(p.vol)} cy={scale.y(p.ret)} r={14} fill="transparent" />
      <circle cx={scale.x(p.vol)} cy={scale.y(p.ret)} r={6} fill={color} stroke="var(--surface)" strokeWidth={2} />
      <text
        x={scale.x(p.vol) + (side === "left" ? -10 : 10)}
        y={scale.y(p.ret) + (side === "left" ? -10 : 18)}
        textAnchor={side === "left" ? "end" : "start"}
        className="fr-label"
      >
        {label}
      </text>
    </g>
  );

  return (
    <div className="frontier">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="效率前緣圖：橫軸預期波動、縱軸預期報酬" className="frontier-svg">
        {/* 格線與座標 */}
        {scale.yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={scale.y(v)} y2={scale.y(v)} className="fr-grid" />
            <text x={PAD.l - 8} y={scale.y(v) + 4} textAnchor="end" className="fr-tick">
              {pct(v)}
            </text>
          </g>
        ))}
        {scale.xt.map((v) => (
          <text key={`x${v}`} x={scale.x(v)} y={H - PAD.b + 18} textAnchor="middle" className="fr-tick">
            {pct(v)}
          </text>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" className="fr-axis">
          預期波動（風險）→
        </text>
        <text x={14} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" className="fr-axis" transform={`rotate(-90 14 ${(PAD.t + H - PAD.b) / 2})`}>
          預期報酬 →
        </text>

        {/* 隨機組合 */}
        <g className="fr-cloud">
          {cloud.map((p, i) => (
            <circle key={i} cx={scale.x(p.vol)} cy={scale.y(p.ret)} r={1.8} />
          ))}
        </g>
        {/* 效率前緣 */}
        <path d={line} className="fr-line" />
        {/* 兩個點通常很靠近：位置比較高的那個標籤放左上、比較低的放右下，標籤才會各自貼著自己的點 */}
        {marker("目前組合", current, "var(--s1)", suggested && suggested.ret > current.ret ? "right" : "left")}
        {suggested && marker("建議組合", suggested, "var(--s2)", suggested.ret > current.ret ? "left" : "right")}
      </svg>
      <div className="fr-legend small">
        <span>
          <i className="fr-dot" /> 隨機組合（{cloud.length} 組）
        </span>
        <span>
          <i className="fr-swatch-line" /> 效率前緣
        </span>
        <span>
          <i className="swatch" style={{ background: "var(--s1)" }} /> 目前
        </span>
        <span>
          <i className="swatch" style={{ background: "var(--s2)" }} /> 建議（夏普值最高）
        </span>
        {hover && (
          <span className="fr-hover num">
            {hover.label}：報酬 {pct(hover.p.ret)}・波動 {pct(hover.p.vol)}・夏普 {hover.p.sharpe.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
