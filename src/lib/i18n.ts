// 多語系（加碼 C-2：英文版）
//
// 做法：用「中文原文」當 key，英文放在 i18n-en.ts 的對照表。
//   t("投資組合")                       → 英文模式回傳 "Portfolio"
//   t("距 MA{0} {1}%", [50, "+3.2"])    → 依對照表的語序代入 {0}、{1}
// 為什麼用中文原文當 key？程式碼照樣看得懂，而且查不到翻譯時直接顯示中文，網頁不會壞。
// i18n.test.ts 會檢查程式裡每個 t("…") 都有英文翻譯，避免漏翻。
//
// ⚠️ 模組最上層的常數（例如 KIND_META 的條件名稱）在載入時就決定了，
//    不能在那裡呼叫 t()，要在「顯示的地方」才 t(常數)。

import { useSyncExternalStore } from "react";
import { EN } from "./i18n-en";
import { readStorage, writeStorage } from "./storage";

export type Lang = "zh" | "en";

const KEY = "lang";

/** 第一次打開：瀏覽器語言是中文 → 中文，其他 → 英文；之後用使用者選的 */
function detect(): Lang {
  const saved = readStorage<unknown>(KEY, null);
  if (saved === "zh" || saved === "en") return saved;
  try {
    return /^zh/i.test(navigator.language) ? "zh" : "en";
  } catch {
    return "zh";
  }
}

let current: Lang = typeof window === "undefined" ? "zh" : detect();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  writeStorage(KEY, lang);
  applyDocumentLang();
  for (const l of listeners) l();
}

/** <html lang> 跟著切換（螢幕閱讀器、瀏覽器翻譯、字型選擇都會參考） */
export function applyDocumentLang(): void {
  try {
    document.documentElement.lang = current === "en" ? "en" : "zh-Hant-TW";
  } catch {
    /* 測試環境沒有 document */
  }
}

/** React 元件裡用：語言切換時重新渲染 */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => current,
    () => current,
  );
}

/** 只給測試用：直接設定語言、不寫 localStorage */
export function _setLangForTest(lang: Lang): void {
  current = lang;
}

/**
 * 翻譯。key 是中文原文；args 依序代入 {0}、{1}…（null／undefined 顯示空字串）。
 * 英文模式查不到時回傳中文（並代入參數），所以不會出現空白或錯誤。
 */
export function t(key: string, args?: readonly (string | number | boolean | null | undefined)[]): string {
  const template = current === "en" ? (EN[key] ?? key) : key;
  if (!args || args.length === 0) return template;
  return template.replace(/\{(\d+)\}/g, (_m, i: string) => {
    const v = args[Number(i)];
    // false 也顯示空白：原本 JSX 的 {條件 && "文字"} 不成立時什麼都不顯示
    return v === undefined || v === null || v === false ? "" : String(v);
  });
}

/** 數字、日期格式化用的地區代碼 */
export function locale(): string {
  return current === "en" ? "en-US" : "zh-TW";
}
