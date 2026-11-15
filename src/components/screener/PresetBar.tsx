// 常用組合：載入、儲存、刪除（使用者自己的組合存在瀏覽器 localStorage）

import { useState } from "react";
import { BUILTIN_PRESETS, type ScreenerPreset } from "../../lib/screener";

interface Props {
  presets: ScreenerPreset[];
  onLoad: (p: ScreenerPreset) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
  canSave: boolean;
}

export default function PresetBar({ presets, onLoad, onSave, onDelete, canSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onSave(n);
    setName("");
    setSaving(false);
  };

  return (
    <div className="preset-bar">
      <div className="preset-group">
        <span className="preset-label">範例組合</span>
        {BUILTIN_PRESETS.map((p) => (
          <button key={p.name} type="button" className="chip" onClick={() => onLoad(p)}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="preset-group">
        <span className="preset-label">我的組合</span>
        {presets.length === 0 && <span className="muted small">尚未儲存</span>}
        {presets.map((p) => (
          <span key={p.name} className="chip chip-saved">
            <button type="button" className="chip-main" onClick={() => onLoad(p)} title="載入">
              {p.name}
            </button>
            <button
              type="button"
              className="chip-x"
              aria-label={`刪除組合 ${p.name}`}
              title="刪除"
              onClick={() => {
                if (window.confirm(`確定刪除「${p.name}」？`)) onDelete(p.name);
              }}
            >
              ×
            </button>
          </span>
        ))}

        {saving ? (
          <form
            className="save-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              autoFocus
              className="text-input"
              placeholder="組合名稱"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSaving(false)}
            />
            <button type="submit" className="btn-primary" disabled={!name.trim()}>
              儲存
            </button>
            <button type="button" className="btn-ghost" onClick={() => setSaving(false)}>
              取消
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="btn-ghost"
            disabled={!canSave}
            title={canSave ? "把目前的條件存起來" : "請先新增條件"}
            onClick={() => setSaving(true)}
          >
            ＋ 儲存目前條件
          </button>
        )}
      </div>
    </div>
  );
}
