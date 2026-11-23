// AI 週報：格式檢查、日期計算、索引（純函式，測試在 aiWeekly.test.ts）
//
// 為什麼要週報？每日報告很細，一週看下來容易只記得最後一天。每週一的排程任務
// （和每日報告同一個，照 docs/daily-report-task.md）把上週的每日報告整理成一份：
// 這週市場怎麼走、哪些訊號一直出現、新聞的主題、下週要觀察什麼。
// 規則和每日報告一樣：只用公開資料（上週的每日報告本身）、不給買賣建議、refs 只能是觀察清單。

import { isDate, LIMITS, makeCheckers } from "./aiReport";
import type { AiWeekly } from "./types";

export const WEEKLY_LIMITS = { pointsMin: 3, pointsMax: 6, sections: 4, keep: 12 };

const DAY = 86_400_000;
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (t: Date) => t.toISOString().slice(0, 10);

/** 那一天所在那一週的週一 */
export function mondayOf(date: string): string {
  const t = toDate(date);
  const dow = (t.getUTCDay() + 6) % 7; // 週一 = 0
  return fmt(new Date(t.getTime() - dow * DAY));
}

/** 今天的「上一週」：週一～週五 */
export function previousWeek(today: string): { week: string; from: string; to: string } {
  const week = fmt(new Date(toDate(mondayOf(today)).getTime() - 7 * DAY));
  return { week, from: week, to: fmt(new Date(toDate(week).getTime() + 4 * DAY)) };
}

export interface WeeklyValidation {
  weekly: AiWeekly | null;
  errors: string[];
}

export function validateWeekly(raw: unknown, symbols?: Set<string>): WeeklyValidation {
  const errors: string[] = [];
  const w = raw as AiWeekly;
  if (!w || typeof w !== "object") return { weekly: null, errors: ["不是 JSON 物件"] };
  if (w.version !== 1) errors.push("version 必須是 1");
  if (typeof w.sample !== "boolean") errors.push("sample 必須是 true 或 false");
  if (!isDate(w.week)) errors.push("week 格式必須是 YYYY-MM-DD");
  else if (mondayOf(w.week) !== w.week) errors.push("week 必須是週一的日期");
  if (typeof w.generatedAt !== "string") errors.push("缺少 generatedAt");
  if (!Array.isArray(w.basedOn) || w.basedOn.length === 0 || !w.basedOn.every(isDate)) errors.push("basedOn 必須列出整理了哪幾天的每日報告");
  const { checkText, checkItems } = makeCheckers(errors, symbols);
  checkText(w.summary, "週報摘要", LIMITS.summaryZh);
  checkItems(w.points, "本週重點", WEEKLY_LIMITS.pointsMax, WEEKLY_LIMITS.pointsMin);
  if (!Array.isArray(w.sections) || w.sections.length > WEEKLY_LIMITS.sections) errors.push(`sections 最多 ${WEEKLY_LIMITS.sections} 段`);
  (Array.isArray(w.sections) ? w.sections : []).forEach((s, i) => {
    checkText(s?.heading, `第 ${i + 1} 段標題`, 20);
    checkItems(s?.items, `第 ${i + 1} 段`, LIMITS.itemsPerSection, 1);
  });
  return { weekly: errors.length ? null : w, errors };
}

/**
 * 正式週報比範例更嚴格：不能是範例；basedOn 的日期都要在那一週之後的 7 天內
 * （週一～週五的每日報告寫的是前一個交易日，所以範圍是週一～下週一）。
 */
export function checkWeeklyReport(raw: unknown, symbols: Set<string>): string[] {
  const { weekly, errors } = validateWeekly(raw, symbols);
  if (!weekly) return errors;
  const out: string[] = [];
  if (weekly.sample) out.push("正式週報的 sample 必須是 false");
  const end = fmt(new Date(toDate(weekly.week).getTime() + 7 * DAY));
  for (const d of weekly.basedOn) if (d < weekly.week || d > end) out.push(`basedOn 的 ${d} 不在這一週（${weekly.week} ～ ${end}）`);
  return out;
}

/** public/ai/weekly/index.json：有哪些週的週報（新的在前，最多 12 份） */
export interface WeeklyIndex {
  weeks: string[];
}

export function validWeeklyIndex(raw: unknown): raw is WeeklyIndex {
  const o = raw as WeeklyIndex;
  return !!o && Array.isArray(o.weeks) && o.weeks.every(isDate);
}

export function addWeek(prev: WeeklyIndex | null, week: string, max = WEEKLY_LIMITS.keep): { index: WeeklyIndex; removed: string[] } {
  const all = [...new Set([week, ...(prev?.weeks ?? [])])].sort().reverse();
  return { index: { weeks: all.slice(0, max) }, removed: all.slice(max) };
}

/** 週報標題用的日期範圍：週一～週五（例如 11/17–11/21） */
export function weekRange(week: string): string {
  const a = toDate(week);
  const b = new Date(a.getTime() + 4 * DAY);
  return `${a.getUTCMonth() + 1}/${a.getUTCDate()}–${b.getUTCMonth() + 1}/${b.getUTCDate()}`;
}
