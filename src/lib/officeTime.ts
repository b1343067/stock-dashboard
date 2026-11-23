// AI 辦公室跟著「台灣時間」變化（純函式，測試在 officeTime.test.ts）
//
// 為什麼用台灣時間而不是使用者電腦的時間？辦公室在台灣，看盤的節奏也是台灣的：
// 早上美股剛收盤、晚上 9 點半美股開盤。不管在哪裡打開網站，辦公室的天色都一樣。
// 淺色主題：清晨（粉橘天空）→ 白天 → 黃昏（橘色天空）→ 夜晚（夜景、開燈）；深色主題一律是夜景（原本的設計）。
// 週末：人物的台詞換成週末版本（見 officeTalk.ts）。

export type DayPhase = "dawn" | "day" | "dusk" | "night";

/** 台灣時間的小時、分鐘、星期（0 = 週日） */
export function taipeiClock(now: Date): { h: number; m: number; dow: number } {
  const t = new Date(now.getTime() + 8 * 3600_000);
  return { h: t.getUTCHours(), m: t.getUTCMinutes(), dow: t.getUTCDay() };
}

export function dayPhase(now: Date): DayPhase {
  const { h } = taipeiClock(now);
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 17) return "day";
  if (h >= 17 && h < 19) return "dusk";
  return "night";
}

export function isWeekend(now: Date): boolean {
  const { dow } = taipeiClock(now);
  return dow === 0 || dow === 6;
}

/** 清晨、黃昏的天空顏色（淺色主題用；白天用 CSS 的 --iso-sky，夜晚改畫夜景） */
export const PHASE_SKY: Partial<Record<DayPhase, string>> = { dawn: "#f4c6b8", dusk: "#f2a979" };

/** 時鐘指針的角度（0 = 12 點方向，順時針，單位：圈）：時針跟著分鐘慢慢走 */
export function clockHands(now: Date): { hour: number; minute: number } {
  const { h, m } = taipeiClock(now);
  return { hour: ((h % 12) + m / 60) / 12, minute: m / 60 };
}
