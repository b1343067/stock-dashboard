// 投資組合設定：短線上限、預設停利停損、提醒範圍、顯示幣別

import { useState } from "react";
import type { PortfolioSettings } from "../../lib/portfolio";
import { t } from "../../lib/i18n";

interface Props {
  settings: PortfolioSettings;
  onChange: (s: PortfolioSettings) => void;
}

const FIELDS: { key: Exclude<keyof PortfolioSettings, "displayCurrency">; label: string; min: number; max: number }[] = [
  { key: "shortCapPct", label: "短線比例上限 %", min: 0, max: 100 },
  { key: "defaultTpPct", label: "預設停利 %", min: 0.1, max: 999 },
  { key: "defaultSlPct", label: "預設停損 %", min: 0.1, max: 99.9 },
  { key: "alertPct", label: "距離幾 % 以內提醒", min: 0, max: 50 },
];

export default function SettingsPanel({ settings, onChange }: Props) {
  return (
    <details className="settings-panel">
      <summary>{t("設定")}</summary>
      <div className="form-grid">
        {FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span>{t(f.label)}</span>
            <SettingInput
              value={settings[f.key]}
              min={f.min}
              max={f.max}
              onCommit={(v) => onChange({ ...settings, [f.key]: v })}
            />
          </label>
        ))}
        <div className="field">
          <span>{t("總計顯示幣別")}</span>
          <div className="segmented" role="radiogroup" aria-label={t("顯示幣別")}>
            {(["USD", "TWD"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={settings.displayCurrency === c}
                className={settings.displayCurrency === c ? "active" : ""}
                onClick={() => onChange({ ...settings, displayCurrency: c })}
              >
                {c === "USD" ? t("美元") : t("台幣")}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="hint">{t("每檔短線部位也可以在「編輯」裡自訂停利停損 %，沒填就用這裡的預設值。")}</p>
    </details>
  );
}

/**
 * 數字輸入框：打字時先存在自己的狀態裡（允許暫時清空），
 * 只有合法的值才存進設定；離開輸入框時若不合法就恢復原值。
 */
function SettingInput({ value, min, max, onCommit }: { value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const valid = (v: number) => Number.isFinite(v) && v >= min && v <= max;
  return (
    <input
      className="text-input"
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step="any"
      value={draft}
      aria-invalid={!valid(Number(draft)) || draft.trim() === ""}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value.trim() !== "" && valid(v)) onCommit(v);
      }}
      onBlur={() => {
        const v = Number(draft);
        if (draft.trim() === "" || !valid(v)) setDraft(String(value));
      }}
    />
  );
}
