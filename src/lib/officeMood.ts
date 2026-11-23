// AI 辦公室的「今日氣氛」：用 ML 實驗室 ③ 的市場狀態（ml-vol.json 的 regime）決定辦公室裡的樣子
//
// 為什麼要做？首頁一眼就能看出今天市場大概怎樣，不用先點進報告。
//   恐慌 → 電視上的警示燈閃、大家走路變快、頭上冒汗、電視 K 線往下
//   修正下跌 → 表情擔心、K 線往下
//   平穩 → 平常的樣子
//   上漲／反彈 → 大家微笑、K 線往上、桌子上方飄彩紙
// 美股、台股狀態不同時取「比較嚴重」的那一個（例如美股平穩、台股恐慌 → 恐慌），寧可提醒也不要漏掉。
// 這只是描述現況（近 20 天的漲跌、波動、離高點多遠），不是預測。測試在 officeMood.test.ts。

import type { MlVolData, RegimeKey } from "./ml";

export type OfficeMood = "panic" | "down" | "calm" | "up";

export interface MoodInfo {
  mood: OfficeMood;
  /** 市場狀態原本的分類、名稱與市場（顯示在左上角的小標籤） */
  key: RegimeKey;
  name: string;
  label: string;
  days: number;
}

const MOOD_OF: Record<RegimeKey, OfficeMood> = { panic: "panic", down: "down", calm: "calm", rally: "up", rebound: "up" };
/** 嚴重程度：數字越大越優先顯示 */
const SEVERITY: Record<OfficeMood, number> = { panic: 3, down: 2, up: 1, calm: 0 };

/** 從 ml-vol.json 算出今天的氣氛；沒有資料或格式不對 → null（辦公室照平常的樣子） */
export function officeMood(data: MlVolData | null | undefined): MoodInfo | null {
  const markets = Object.values(data?.regime ?? {}).filter((m) => m && m.key in MOOD_OF);
  let best: MoodInfo | null = null;
  for (const m of markets) {
    const mood = MOOD_OF[m.key];
    // 同樣嚴重時保留先出現的（設定檔順序：美股在前）
    if (!best || SEVERITY[mood] > SEVERITY[best.mood]) best = { mood, key: m.key, name: m.name, label: m.label, days: m.days };
  }
  return best;
}

/** 走路速度倍數：恐慌時大家匆匆忙忙 */
export function moodSpeed(mood: OfficeMood | undefined): number {
  return mood === "panic" ? 1.6 : 1;
}

/** 表情：上漲微笑、下跌／恐慌擔心 */
export function moodFace(mood: OfficeMood | undefined): "smile" | "flat" | "worried" {
  if (mood === "up") return "smile";
  if (mood === "down" || mood === "panic") return "worried";
  return "flat";
}

/**
 * 牆上電視的 9 根 K 線：[底部高度, 實體長度, 是否收漲]。
 * 平穩維持原本的小幅震盪；上漲一路墊高、下跌一路走低，恐慌跌得更急、K 棒更長。
 * 注意：電視掛在後牆上，畫面上往右本來就會往下斜（每根約 1.8px），所以上漲每根要墊高 2.6 才看得出往上。
 */
export function tvBars(mood: OfficeMood | undefined): [number, number, 0 | 1][] {
  const calm: [number, number, 0 | 1][] = [[54, 6, 1], [57, 5, 0], [55, 7, 1], [59, 6, 1], [62, 4, 0], [60, 8, 1], [64, 6, 1], [67, 5, 0], [65, 7, 1]];
  if (mood === "up") return calm.map((_, i) => [Math.round(51 + i * 2.6), 4 + (i % 2), i === 4 ? 0 : 1]);
  if (mood === "down") return calm.map((_, i) => [Math.round(68 - i * 1.6), 5 + (i % 3), i === 3 ? 1 : 0]);
  if (mood === "panic") return calm.map((_, i) => [Math.round(68 - i * 2), 6 + (i % 3) * 2, i === 2 ? 1 : 0]);
  return calm;
}
