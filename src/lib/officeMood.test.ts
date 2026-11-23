import { describe, expect, it } from "vitest";
import { moodFace, moodSpeed, officeMood, tvBars } from "./officeMood";
import type { MlVolData } from "./ml";

const now = (key: string, label: string) => ({ key, name: key, label, since: "2026-11-01", days: 5, date: "2026-11-20", ret20: 0, vol20: 10, dd: 0 });
const data = (...r: ReturnType<typeof now>[]) => ({ regime: Object.fromEntries(r.map((x) => [x.label, x])) }) as unknown as MlVolData;

describe("officeMood", () => {
  it("沒有資料 → null", () => {
    expect(officeMood(null)).toBeNull();
    expect(officeMood({} as MlVolData)).toBeNull();
  });
  it("對應：rally／rebound → up", () => {
    expect(officeMood(data(now("rally", "VOO")))?.mood).toBe("up");
    expect(officeMood(data(now("rebound", "VOO")))?.mood).toBe("up");
    expect(officeMood(data(now("calm", "VOO")))?.mood).toBe("calm");
  });
  it("兩個市場取比較嚴重的", () => {
    const m = officeMood(data(now("calm", "VOO"), now("panic", "0050")));
    expect(m?.mood).toBe("panic");
    expect(m?.label).toBe("0050");
    expect(officeMood(data(now("rally", "VOO"), now("down", "0050")))?.mood).toBe("down");
    expect(officeMood(data(now("calm", "VOO"), now("rally", "0050")))?.mood).toBe("up");
  });
  it("一樣嚴重時保留美股（先出現的）", () => {
    expect(officeMood(data(now("down", "VOO"), now("down", "0050")))?.label).toBe("VOO");
  });
  it("不認得的狀態略過", () => {
    expect(officeMood(data(now("weird", "VOO")))).toBeNull();
  });
});

describe("氣氛的樣子", () => {
  it("電視 K 線的方向跟著氣氛", () => {
    const first = (m: Parameters<typeof tvBars>[0]) => tvBars(m)[0][0];
    const last = (m: Parameters<typeof tvBars>[0]) => tvBars(m).at(-1)![0];
    expect(last("up")).toBeGreaterThan(first("up"));
    expect(last("down")).toBeLessThan(first("down"));
    expect(last("panic")).toBeLessThan(first("panic"));
    for (const m of ["up", "down", "panic", "calm", undefined] as const) {
      expect(tvBars(m)).toHaveLength(9);
      // 電視範圍是 48～80（牆上的高度），K 線不能畫出去
      for (const [z, h] of tvBars(m)) {
        expect(z).toBeGreaterThanOrEqual(50);
        expect(z + h + 2).toBeLessThanOrEqual(80);
      }
    }
  });
  it("表情與速度", () => {
    expect(moodFace("up")).toBe("smile");
    expect(moodFace("panic")).toBe("worried");
    expect(moodFace(undefined)).toBe("flat");
    expect(moodSpeed("panic")).toBeGreaterThan(1);
    expect(moodSpeed("calm")).toBe(1);
  });
});
