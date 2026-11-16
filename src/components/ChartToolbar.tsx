// 圖表工具列：左邊切換日／週／月線與均線，右邊「＋布林／＋MACD／＋RSI」展開進階指標

import type { OverlayKey, Timeframe } from "../lib/types";

interface Props {
  timeframe: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
  overlays: Record<OverlayKey, boolean>;
  onOverlays: (o: Record<OverlayKey, boolean>) => void;
}

const TF: [Timeframe, string, string][] = [
  ["daily", "日", "日線"],
  ["weekly", "週", "週線"],
  ["monthly", "月", "月線"],
];

const MA: [OverlayKey, string, string][] = [
  ["ma10", "MA10", "var(--c-ma10)"],
  ["ma20", "MA20", "var(--c-ma20)"],
  ["ma50", "MA50", "var(--c-ma50)"],
  ["ma200", "MA200", "var(--c-ma200)"],
];

const EXTRA: [OverlayKey, string][] = [
  ["bb", "布林"],
  ["macd", "MACD"],
  ["rsi", "RSI"],
];

export default function ChartToolbar({ timeframe, onTimeframe, overlays, onOverlays }: Props) {
  const toggle = (k: OverlayKey) => onOverlays({ ...overlays, [k]: !overlays[k] });
  return (
    <div className="chart-tools">
      <div className="segmented" role="radiogroup" aria-label="K 線週期">
        {TF.map(([tf, short, full]) => (
          <button
            key={tf}
            type="button"
            role="radio"
            aria-label={full}
            aria-checked={timeframe === tf}
            className={timeframe === tf ? "active" : ""}
            onClick={() => onTimeframe(tf)}
          >
            {short}
          </button>
        ))}
      </div>
      {MA.map(([k, label, color]) => (
        <button key={k} type="button" className={`chip${overlays[k] ? " on" : ""}`} aria-pressed={overlays[k]} onClick={() => toggle(k)}>
          <i className="chip-line" style={{ background: color }} />
          {label}
        </button>
      ))}
      <span className="tools-spacer" />
      {EXTRA.map(([k, label]) => (
        <button
          key={k}
          type="button"
          className={`chip chip-add${overlays[k] ? " on" : ""}`}
          aria-pressed={overlays[k]}
          title={overlays[k] ? `收起 ${label}` : `展開 ${label}`}
          onClick={() => toggle(k)}
        >
          {overlays[k] ? "−" : "＋"} {label}
        </button>
      ))}
    </div>
  );
}
