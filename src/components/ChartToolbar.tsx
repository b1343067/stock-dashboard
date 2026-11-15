// 圖表工具列：切換日／週／月線、勾選要疊加的指標

import type { OverlayKey, Timeframe } from "../lib/types";

interface Props {
  timeframe: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
  overlays: Record<OverlayKey, boolean>;
  onOverlays: (o: Record<OverlayKey, boolean>) => void;
}

const TF_LABELS: [Timeframe, string][] = [
  ["daily", "日線"],
  ["weekly", "週線"],
  ["monthly", "月線"],
];

const OVERLAY_LABELS: [OverlayKey, string, string][] = [
  ["ma10", "MA10", "var(--c-ma10)"],
  ["ma20", "MA20", "var(--c-ma20)"],
  ["ma50", "MA50", "var(--c-ma50)"],
  ["ma200", "MA200", "var(--c-ma200)"],
  ["bb", "布林", "var(--c-bb)"],
];

export default function ChartToolbar({ timeframe, onTimeframe, overlays, onOverlays }: Props) {
  return (
    <div className="toolbar">
      <div className="segmented" role="radiogroup" aria-label="K 線週期">
        {TF_LABELS.map(([tf, label]) => (
          <button
            key={tf}
            type="button"
            role="radio"
            aria-checked={timeframe === tf}
            className={timeframe === tf ? "active" : ""}
            onClick={() => onTimeframe(tf)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="chips" aria-label="疊加指標">
        {OVERLAY_LABELS.map(([key, label, color]) => (
          <button
            key={key}
            type="button"
            className={`chip${overlays[key] ? " on" : ""}`}
            aria-pressed={overlays[key]}
            onClick={() => onOverlays({ ...overlays, [key]: !overlays[key] })}
          >
            <i className="dot" style={{ background: color }} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
