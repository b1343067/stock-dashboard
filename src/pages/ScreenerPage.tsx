// 第二階段：指標篩選器頁面
//
// 資料流：
//   screener.json ──► runScreen(資料, 條件, AND/OR) ──► 結果列表
//   目前的條件、AND/OR、我的組合 都存在 localStorage，下次打開還在。

import { useEffect, useMemo, useState } from "react";
import ConditionRow from "../components/screener/ConditionRow";
import PresetBar from "../components/screener/PresetBar";
import ResultsTable from "../components/screener/ResultsTable";
import { loadScreener } from "../lib/data";
import {
  describeCondition,
  evaluateCondition,
  makeCondition,
  newId,
  runScreen,
  sanitizeConditions,
  sanitizePresets,
  type CombineMode,
  type Condition,
  type ScreenerData,
  type ScreenerPreset,
} from "../lib/screener";
import { readStorage, writeStorage } from "../lib/storage";
import { filterByCategory, groupTickers } from "../lib/watchlist";

const KEY_CURRENT = "screener:current";
const KEY_PRESETS = "screener:presets";

interface CurrentState {
  mode: CombineMode;
  conditions: Condition[];
  /** 只篩選某個分類（"all" = 全部） */
  category: string;
}

// 第一次使用時的預設條件
const DEFAULT_STATE: CurrentState = {
  mode: "and",
  category: "all",
  conditions: [makeCondition("rsiBelow", "daily"), { ...makeCondition("maAbove", "daily"), ma: 200 }],
};

/** 從 localStorage 讀出目前的條件，並檢查格式 */
function loadCurrent(): CurrentState {
  const raw = readStorage<unknown>(KEY_CURRENT, null);
  if (!raw || typeof raw !== "object") return DEFAULT_STATE;
  const o = raw as Partial<CurrentState>;
  return {
    mode: o.mode === "or" ? "or" : "and",
    conditions: sanitizeConditions(o.conditions),
    category: typeof o.category === "string" && o.category ? o.category : "all",
  };
}

export default function ScreenerPage({ redUp }: { redUp: boolean }) {
  const [data, setData] = useState<ScreenerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<CurrentState>(loadCurrent);
  const [presets, setPresets] = useState<ScreenerPreset[]>(() => sanitizePresets(readStorage<unknown>(KEY_PRESETS, [])));

  useEffect(() => {
    loadScreener()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    writeStorage(KEY_CURRENT, state);
  }, [state]);
  useEffect(() => {
    writeStorage(KEY_PRESETS, presets);
  }, [presets]);

  const { mode, conditions } = state;
  const categoryOptions = useMemo(() => (data ? groupTickers(data.tickers) : []), [data]);
  // 存起來的分類如果已經不存在（設定檔改名或刪除），就當作「全部」
  const category = state.category === "all" || !data || categoryOptions.some((g) => g.name === state.category) ? state.category : "all";
  // 先依分類縮小範圍，再套用條件
  const universe = useMemo(() => (data ? filterByCategory(data.tickers, category) : []), [data, category]);
  const results = useMemo(() => runScreen(universe, conditions, mode), [universe, conditions, mode]);
  // 每個條件單獨有幾檔符合
  const hitCounts = useMemo(
    () => conditions.map((c) => (data ? universe.filter((t) => evaluateCondition(t, c).matched).length : null)),
    [data, universe, conditions],
  );

  const setConditions = (conds: Condition[]) => setState((s) => ({ ...s, conditions: conds }));
  const update = (i: number, c: Condition) => setConditions(conditions.map((x, j) => (j === i ? c : x)));
  const remove = (i: number) => setConditions(conditions.filter((_, j) => j !== i));
  const add = () => setConditions([...conditions, makeCondition("rsiBelow", conditions.at(-1)?.tf ?? "daily")]);

  // 載入組合時產生新的 id，避免和畫面上的舊條件衝突
  // 載入組合不改變目前選的分類
  const loadPreset = (p: ScreenerPreset) =>
    setState((s) => ({ ...s, mode: p.mode, conditions: p.conditions.map((c) => ({ ...c, id: newId() })) }));

  const savePreset = (name: string) => {
    const preset: ScreenerPreset = { name, mode, conditions };
    setPresets((ps) => {
      const exists = ps.some((p) => p.name === name);
      if (exists && !window.confirm(`已經有「${name}」，要覆蓋嗎？`)) return ps;
      return exists ? ps.map((p) => (p.name === name ? preset : p)) : [...ps, preset];
    });
  };

  return (
    <div className="screener">
      <div className="card">
        <div className="screener-head">
          <h2>指標篩選器</h2>
          <div className="toolbar">
            <label className="cat-filter">
              <span>範圍</span>
              <select
                aria-label="篩選範圍"
                value={category}
                onChange={(e) => setState((s) => ({ ...s, category: e.target.value }))}
              >
                <option value="all">全部分類{data ? `（${data.tickers.length} 檔）` : ""}</option>
                {categoryOptions.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}（{g.items.length} 檔）
                  </option>
                ))}
              </select>
            </label>
            <div className="segmented" role="radiogroup" aria-label="條件組合方式">
              <button
                type="button"
                role="radio"
                aria-checked={mode === "and"}
                className={mode === "and" ? "active" : ""}
                onClick={() => setState((s) => ({ ...s, mode: "and" }))}
              >
                全部符合（AND）
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "or"}
                className={mode === "or" ? "active" : ""}
                onClick={() => setState((s) => ({ ...s, mode: "or" }))}
              >
                任一符合（OR）
              </button>
            </div>
          </div>
        </div>

        <PresetBar
          presets={presets}
          onLoad={loadPreset}
          onSave={savePreset}
          onDelete={(name) => setPresets((ps) => ps.filter((p) => p.name !== name))}
          canSave={conditions.length > 0}
        />

        <div className="cond-list">
          {conditions.map((c, i) => (
            <ConditionRow
              key={c.id}
              index={i}
              condition={c}
              onChange={(nc) => update(i, nc)}
              onRemove={() => remove(i)}
              hitCount={hitCounts[i]}
            />
          ))}
        </div>

        <div className="cond-actions">
          <button type="button" className="btn-ghost" onClick={add}>
            ＋ 新增條件
          </button>
          {conditions.length > 0 && (
            <button type="button" className="btn-link" onClick={() => setConditions([])}>
              清除全部
            </button>
          )}
        </div>

        {conditions.length > 0 && (
          <p className="cond-summary">
            {conditions.map((c, i) => (
              <span key={c.id}>
                {i > 0 && <b className="joiner">{mode === "and" ? " 且 " : " 或 "}</b>}
                {describeCondition(c)}
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="card">
        {error ? (
          <p className="error">篩選資料讀取失敗：{error}</p>
        ) : !data ? (
          <p className="muted empty">載入中…</p>
        ) : (
          <>
            <ResultsTable results={results} conditions={conditions} redUp={redUp} />
            <p className="hint">
              資料日期：{data.tickers[0]?.lastDate ?? "—"}。「最近 N 天內」包含最新一根 K 棒；週線、月線的最新一根可能是尚未結束的本週／本月。
              篩選結果只是指標狀態，不代表買賣建議。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
