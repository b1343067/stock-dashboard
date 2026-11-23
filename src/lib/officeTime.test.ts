import { describe, expect, it } from "vitest";
import { clockHands, dayPhase, isWeekend, taipeiClock } from "./officeTime";

// 台灣 = UTC+8
const tw = (iso: string) => new Date(new Date(iso + "Z").getTime() - 8 * 3600_000);

describe("officeTime", () => {
  it("用台灣時間判斷，不管電腦在哪個時區", () => {
    expect(taipeiClock(tw("2026-11-23T08:30:00"))).toEqual({ h: 8, m: 30, dow: 1 });
  });
  it("清晨、白天、黃昏、夜晚", () => {
    expect(dayPhase(tw("2026-11-23T05:30:00"))).toBe("dawn");
    expect(dayPhase(tw("2026-11-23T12:00:00"))).toBe("day");
    expect(dayPhase(tw("2026-11-23T17:30:00"))).toBe("dusk");
    expect(dayPhase(tw("2026-11-23T22:00:00"))).toBe("night");
    expect(dayPhase(tw("2026-11-23T03:00:00"))).toBe("night");
  });
  it("週末（台灣時間的週六、週日）", () => {
    expect(isWeekend(tw("2026-11-28T10:00:00"))).toBe(true); // 週六
    expect(isWeekend(tw("2026-11-29T23:59:00"))).toBe(true); // 週日
    expect(isWeekend(tw("2026-11-30T00:01:00"))).toBe(false); // 週一（UTC 還是週日）
  });
  it("時鐘指針", () => {
    expect(clockHands(tw("2026-11-23T15:30:00"))).toEqual({ hour: 3.5 / 12, minute: 0.5 });
    expect(clockHands(tw("2026-11-23T00:00:00"))).toEqual({ hour: 0, minute: 0 });
  });
});
