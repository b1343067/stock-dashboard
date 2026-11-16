// K 線畫圖工具列：趨勢線、水平線、復原、清除
// 只負責按鈕；畫線的判斷在 src/lib/drawings.ts，實際畫在 StockChart 上。

import type { DrawMode } from "../lib/drawings";

interface Props {
  mode: DrawMode;
  onMode: (m: DrawMode) => void;
  count: number;
  /** 趨勢線已經點了第一下、等第二下 */
  waiting: boolean;
  onUndo: () => void;
  onClear: () => void;
}

const TOOLS: [Exclude<DrawMode, "none">, string, string][] = [
  ["trend", "╱ 趨勢線", "在 K 線上點兩下畫一條趨勢線"],
  ["hline", "— 水平線", "在 K 線上點一下畫支撐／壓力線"],
];

export default function DrawingTools({ mode, onMode, count, waiting, onUndo, onClear }: Props) {
  // 提示文字：讓使用者知道下一步要做什麼
  const hint =
    mode === "trend" ? (waiting ? "再點一下終點完成（Esc 取消）" : "點一下趨勢線的起點") : mode === "hline" ? "在想要的價位點一下" : count > 0 ? `已畫 ${count} 條` : "";
  return (
    <div className="draw-tools" role="toolbar" aria-label="畫圖工具">
      {TOOLS.map(([m, label, title]) => (
        <button
          key={m}
          type="button"
          className={`chip${mode === m ? " on draw-on" : ""}`}
          aria-pressed={mode === m}
          title={title}
          onClick={() => onMode(mode === m ? "none" : m)}
        >
          {label}
        </button>
      ))}
      <button type="button" className="chip" disabled={count === 0} onClick={onUndo} title="刪除最後畫的一條">
        ↶ 復原
      </button>
      <button type="button" className="chip" disabled={count === 0} onClick={onClear} title="刪除這檔股票這個週期畫的全部線">
        清除
      </button>
      {hint && <span className="draw-hint muted small">{hint}</span>}
    </div>
  );
}
