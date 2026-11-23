// AI 辦公室：人物偶爾說一句話（純函式，測試在 officeTalk.test.ts）
//
// 使用者要的是「偶爾、不常」：每 30 秒只有一個人開口、講 6 秒；剛打開頁面的前 8 秒大家安靜。
// 輪流講：一次說他今天報告的摘要（點對話框就打開那份報告），下一次說一句閒聊
// （跟著今天的市場氣氛、台灣時間、週末變化）。閒聊不可以有買賣建議（和報告同樣的規則）。

import type { DayPhase } from "./officeTime";
import type { OfficeMood } from "./officeMood";
import type { AiRoleKey } from "./types";

export const TALK_START = 8;
export const TALK_CYCLE = 30;
export const TALK_SHOW = 6;

/** t 秒時誰在說話（k = 第幾次）；沒人說話 → null。speakers = 今天有上班的人 */
export function talkAt(t: number, speakers: AiRoleKey[]): { role: AiRoleKey; k: number } | null {
  if (speakers.length === 0 || t < TALK_START) return null;
  const since = t - TALK_START;
  if (since % TALK_CYCLE >= TALK_SHOW) return null;
  const k = Math.floor(since / TALK_CYCLE);
  // 跳著輪（每次往後 2 位），比較不像照座位順序點名
  return { role: speakers[(k * 2) % speakers.length], k };
}

/** 閒聊台詞（中文原文，顯示時用 t() 翻譯；i18n.test.ts 會檢查有英文） */
export const ROLE_LINES: Record<AiRoleKey, string[]> = {
  tech: ["K 線又更新了，來看看。", "這根長下影線有點意思。", "RSI 我再確認一次。"],
  news: ["有新頭條進來了。", "財報行事曆排好了。", "先看標題，再點原文。"],
  fundamental: ["殖利率排行更新了。", "數字一律照素材，不自己算。", "咖啡續杯中。"],
  debate: ["偏多偏空，兩邊都要有理由。", "我先當一下空方。", "等等，反過來想想看？"],
  lead: ["大家辛苦了，重點我來整理。", "先看風險，再看機會。", "報告記得寫資料日期。"],
};
export const MOOD_LINES: Partial<Record<OfficeMood, string[]>> = {
  panic: ["警示燈又亮了，先看風險。", "波動好大，大家冷靜。"],
  down: ["大盤在修正，先看支撐在哪。"],
  up: ["今天氣氛不錯！", "漲多了也要留意過熱。"],
};
export const TIME_LINES: Partial<Record<DayPhase | "weekend", string[]>> = {
  weekend: ["週末還來加班…", "美股休市，整理一下這週的筆記。"],
  dawn: ["早安，美股剛收盤。"],
  night: ["美股快開盤了嗎？"],
};

export interface TalkContext {
  /** 每個人今天報告的一句話摘要（已經依語言選好）；沒有就只說閒聊 */
  summaries: Partial<Record<AiRoleKey, string>>;
  mood?: OfficeMood;
  phase?: DayPhase;
  weekend?: boolean;
}

/** 摘要太長時截斷（對話框很小） */
export function clip(text: string, max = 36): string {
  const chars = [...text.trim()];
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : chars.join("");
}

/**
 * 第 k 次說話的內容。kind = "report"（報告摘要，點了打開報告）或 "chat"（閒聊台詞的中文原文，要再 t()）。
 * 偶數次說摘要、奇數次閒聊；週末一律閒聊（報告是平日寫的）。
 */
export function talkLine(role: AiRoleKey, k: number, ctx: TalkContext): { kind: "report" | "chat"; text: string } {
  const summary = ctx.summaries[role];
  if (summary && k % 2 === 0 && !ctx.weekend) return { kind: "report", text: clip(summary) };
  const pool = [
    ...(ctx.weekend ? (TIME_LINES.weekend ?? []) : []),
    ...(ctx.mood ? (MOOD_LINES[ctx.mood] ?? []) : []),
    ...(!ctx.weekend && ctx.phase ? (TIME_LINES[ctx.phase] ?? []) : []),
    ...ROLE_LINES[role],
  ];
  return { kind: "chat", text: pool[Math.floor(k / 2) % pool.length] };
}
