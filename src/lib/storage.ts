// localStorage 小工具：讀寫都包在 try/catch 裡。
// 無痕模式或瀏覽器封鎖儲存空間時會丟錯，這時就用預設值，網頁照常運作。

import { useEffect, useState } from "react";

const PREFIX = "stockdash:";

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as T;
    // 如果預設值是物件，就和讀到的值合併（之後新增設定欄位時，舊的存檔也能用）
    if (isPlainObject(fallback) && isPlainObject(parsed)) return { ...fallback, ...parsed };
    return parsed;
  } catch {
    return fallback;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 寫不進去就算了，不影響畫面 */
  }
}

/** 像 useState 一樣用，但會自動存到 localStorage */
export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStorage(key, fallback));
  useEffect(() => writeStorage(key, value), [key, value]);
  return [value, setValue] as const;
}
