// 一列篩選條件：[週期] [條件種類] [參數…] [刪除]

import type { Timeframe } from "../../lib/types";
import {
  BAND_LABEL,
  KIND_META,
  KIND_ORDER,
  LIMITS,
  MA_PERIODS,
  TF_LABEL,
  TF_UNIT,
  changeKind,
  clamp,
  type Band,
  type Condition,
  type ConditionKind,
  type MaPeriod,
} from "../../lib/screener";

interface Props {
  index: number;
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove: () => void;
  /** 這個條件目前有幾檔股票符合（顯示在右邊，方便調整參數） */
  hitCount: number | null;
}

export default function ConditionRow({ index, condition: c, onChange, onRemove, hitCount }: Props) {
  const meta = KIND_META[c.kind];
  const params = meta.params;
  const unit = TF_UNIT[c.tf];
  // 「連續縮短 N 根」和「最近 N 天內」文字不同
  const nLabel = c.kind === "histShrink" ? "連續" : "最近";
  const nSuffix = c.kind === "histShrink" ? "根" : `${unit}內`;

  return (
    <div className="cond-row">
      <span className="cond-index" aria-hidden="true">
        {index + 1}
      </span>

      {/* 基本面條件不分日／週／月，所以不顯示週期 */}
      {meta.noTf ? (
        <span className="cond-tf-none muted small">基本面</span>
      ) : (
        <select aria-label="週期" value={c.tf} onChange={(e) => onChange({ ...c, tf: e.target.value as Timeframe })}>
          {(Object.keys(TF_LABEL) as Timeframe[]).map((tf) => (
            <option key={tf} value={tf}>
              {TF_LABEL[tf]}
            </option>
          ))}
        </select>
      )}

      <select
        aria-label="條件"
        className="cond-kind"
        value={c.kind}
        onChange={(e) => onChange(changeKind(c, e.target.value as ConditionKind))}
      >
        <optgroup label="技術指標">
          {KIND_ORDER.filter((k) => !KIND_META[k].noTf).map((k) => (
            <option key={k} value={k}>
              {KIND_META[k].label}
            </option>
          ))}
        </optgroup>
        <optgroup label="基本面">
          {KIND_ORDER.filter((k) => KIND_META[k].noTf).map((k) => (
            <option key={k} value={k}>
              {KIND_META[k].label}
            </option>
          ))}
        </optgroup>
      </select>

      {params.includes("band") && (
        <select aria-label="布林軌道" value={c.band} onChange={(e) => onChange({ ...c, band: e.target.value as Band })}>
          {(Object.keys(BAND_LABEL) as Band[]).map((b) => (
            <option key={b} value={b}>
              {BAND_LABEL[b]}
            </option>
          ))}
        </select>
      )}

      {params.includes("ma") && (
        <select
          aria-label="均線"
          value={c.ma}
          onChange={(e) => onChange({ ...c, ma: Number(e.target.value) as MaPeriod })}
        >
          {MA_PERIODS.map((m) => (
            <option key={m} value={m}>
              MA{m}
            </option>
          ))}
        </select>
      )}

      {params.includes("value") && (
        <label className="cond-param">
          {c.kind === "rsiRebound" ? "從" : ""}
          <NumberInput
            value={c.value}
            min={LIMITS.value.min}
            max={LIMITS.value.max}
            onChange={(v) => onChange({ ...c, value: v })}
            ariaLabel={meta.noTf ? "數值" : "RSI 門檻"}
          />
          {c.kind === "rsiRebound" ? "以下回升" : (meta.unit ?? "")}
        </label>
      )}

      {params.includes("n") && (
        <label className="cond-param">
          {nLabel}
          <NumberInput
            value={c.n}
            min={LIMITS.n.min}
            max={LIMITS.n.max}
            onChange={(v) => onChange({ ...c, n: Math.round(v) })}
            ariaLabel={c.kind === "histShrink" ? "連續根數" : "最近幾根內"}
          />
          {nSuffix}
        </label>
      )}

      <span className="cond-spacer" />
      {hitCount !== null && <span className="cond-hits muted">{hitCount} 檔符合</span>}
      <button type="button" className="icon-btn" onClick={onRemove} aria-label={`刪除條件 ${index + 1}`} title="刪除">
        ×
      </button>
    </div>
  );
}

/** 數字輸入框：離開時才把超出範圍的值修正回來，打字過程中不干擾 */
function NumberInput({
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      className="num-input"
      aria-label={ariaLabel}
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const v = e.target.valueAsNumber;
        if (Number.isFinite(v)) onChange(v);
      }}
      onBlur={(e) => onChange(clamp(e.target.valueAsNumber, min, max))}
    />
  );
}
