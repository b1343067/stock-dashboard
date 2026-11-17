// 多語系的單元測試：翻譯函式本身，以及「程式裡每段中文都有英文翻譯」。執行：npm test
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { _setLangForTest, t } from "./i18n";
import { EN } from "./i18n-en";
import { BAND_LABEL, BUILTIN_PRESETS, KIND_META, TF_LABEL, TF_UNIT } from "./screener";
import { KIND_META as ALERT_META } from "./alerts";
import { TX_LABEL } from "./transactions";
import { RANGE_LABEL } from "./compare";
import { fmtBigMoney } from "./fundamentals";
import { SIGNAL_LABELS } from "./today";

afterEach(() => _setLangForTest("zh"));

describe("t()", () => {
  it("中文模式回傳原文並代入參數", () => {
    _setLangForTest("zh");
    expect(t("{0} 檔符合", [3])).toBe("3 檔符合");
  });
  it("英文模式依對照表的語序代入", () => {
    _setLangForTest("en");
    expect(t("距 MA{0} {1}{2}%", [50, "+", "3.2"])).toBe("+3.2% vs MA50");
  });
  it("查不到翻譯 → 顯示中文，不會壞掉", () => {
    _setLangForTest("en");
    expect(t("這句沒有翻譯 {0}", [1])).toBe("這句沒有翻譯 1");
  });
  it("null／undefined／false 參數顯示空白（等同 JSX 的 {條件 && 文字}）", () => {
    expect(t("{0}{1}{2}", [null, undefined, false])).toBe("");
  });
  it("市值單位：中文兆億、英文 T／B", () => {
    expect(fmtBigMoney(3.21e12)).toBe("3.21 兆");
    _setLangForTest("en");
    expect(fmtBigMoney(3.21e12)).toBe("3.21T");
    expect(fmtBigMoney(345.6e9)).toBe("345.6B");
  });
});

// ---- 檢查翻譯是否齊全 ----

const CJK = /[　-〿一-鿿＀-￯]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(f) && !/\.test\.|i18n/.test(f) ? [p] : [];
  });
}

describe("英文翻譯齊全", () => {
  it("程式裡每個 t(\"中文\") 都有英文", () => {
    const missing: string[] = [];
    for (const file of sourceFiles(join(__dirname, ".."))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bt\(("(?:[^"\\]|\\.)*")/g)) {
        const key = JSON.parse(m[1]) as string;
        if (CJK.test(key) && !(key in EN)) missing.push(`${file.replace(/.*src\//, "src/")}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("模組常數（條件名稱、單位、範例組合、分類）都有英文", () => {
    const labels = [
      ...Object.values(KIND_META).flatMap((m) => [m.label, m.unit ?? ""]),
      ...Object.values(TF_LABEL),
      ...Object.values(TF_UNIT),
      ...Object.values(BAND_LABEL),
      ...BUILTIN_PRESETS.map((p) => p.name),
      ...Object.values(ALERT_META).flatMap((m) => [m.label, m.unit]),
      ...Object.values(TX_LABEL),
      ...Object.values(RANGE_LABEL),
      ...SIGNAL_LABELS,
      "盤前", "盤後", "盤中", "已達停利", "已觸及停損", "接近停利", "接近停損",
    ];
    // ML 實驗室的模型名稱寫在 Python（scripts/ml.py 的 VOL_MODELS／DIR_MODELS），網頁用 t(name) 顯示
    const mlPy = readFileSync(join(__dirname, "../../scripts/ml.py"), "utf8");
    for (const block of mlPy.matchAll(/^(?:VOL_MODELS|DIR_MODELS|REGIME_NAMES|REGIME_MARKETS) = \{([\s\S]*?)^\}/gm)) {
      for (const m of block[1].matchAll(/:\s*"([^"]+)"/g)) labels.push(m[1]);
    }
    labels.push("偏高", "略高", "一般", "略低", "偏低");
    const config = JSON.parse(readFileSync(join(__dirname, "../../config/watchlist.json"), "utf8")) as { groups: { name: string }[] };
    labels.push(...config.groups.map((g) => g.name), "其他");
    const missing = labels.filter((l) => l && CJK.test(l) && !(l in EN));
    expect(missing).toEqual([]);
  });

  it("翻譯的 {0}、{1} 和原文一致（不能漏代入的數字）", () => {
    const bad = Object.entries(EN).filter(([k, v]) => {
      const ph = (s: string) => [...new Set(s.match(/\{\d+\}/g) ?? [])].sort().join();
      return ph(k) !== ph(v);
    });
    expect(bad).toEqual([]);
  });
});
