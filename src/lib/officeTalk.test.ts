import { describe, expect, it } from "vitest";
import { clip, MOOD_LINES, ROLE_LINES, talkAt, talkLine, TALK_CYCLE, TALK_SHOW, TALK_START, TIME_LINES } from "./officeTalk";
import type { AiRoleKey } from "./types";

const all: AiRoleKey[] = ["tech", "news", "fundamental", "debate", "lead"];

describe("talkAt（誰在說話）", () => {
  it("剛打開時安靜；之後每 30 秒只有 6 秒有人說話（不常）", () => {
    expect(talkAt(0, all)).toBeNull();
    expect(talkAt(TALK_START - 0.1, all)).toBeNull();
    let talking = 0;
    for (let t = 0; t < 600; t += 0.5) if (talkAt(t, all)) talking++;
    expect(talking / 1200).toBeLessThan(TALK_SHOW / TALK_CYCLE + 0.01);
  });
  it("一次只有一個人，而且大家輪得到", () => {
    const who = new Set<string>();
    for (let k = 0; k < 10; k++) who.add(talkAt(TALK_START + k * TALK_CYCLE + 1, all)!.role);
    expect(who.size).toBe(5);
  });
  it("沒有人上班 → 沒人說話", () => {
    expect(talkAt(100, [])).toBeNull();
  });
});

describe("talkLine（說什麼）", () => {
  it("偶數次說報告摘要（太長會截斷），奇數次閒聊", () => {
    const ctx = { summaries: { tech: "這是一段很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長的摘要" } };
    const a = talkLine("tech", 0, ctx);
    expect(a.kind).toBe("report");
    expect([...a.text].length).toBeLessThanOrEqual(36);
    expect(a.text.endsWith("…")).toBe(true);
    expect(talkLine("tech", 1, ctx).kind).toBe("chat");
  });
  it("沒有報告 → 只閒聊；週末一律閒聊、用週末台詞", () => {
    expect(talkLine("news", 0, { summaries: {} }).kind).toBe("chat");
    const w = talkLine("tech", 0, { summaries: { tech: "摘要" }, weekend: true });
    expect(w.kind).toBe("chat");
    expect(TIME_LINES.weekend).toContain(w.text);
  });
  it("恐慌時會說氣氛台詞", () => {
    const lines = Array.from({ length: 10 }, (_, k) => talkLine("lead", k * 2 + 1, { summaries: {}, mood: "panic" }).text);
    expect(lines.some((l) => MOOD_LINES.panic!.includes(l))).toBe(true);
  });
  it("閒聊台詞不可以有買賣建議（和報告同樣的禁用詞）", () => {
    const every = [...Object.values(ROLE_LINES).flat(), ...Object.values(MOOD_LINES).flat(), ...Object.values(TIME_LINES).flat()];
    for (const l of every) expect(l).not.toMatch(/買進|買入|賣出|目標價|加碼|減碼/);
  });
  it("clip 短的不動", () => {
    expect(clip(" 短句 ")).toBe("短句");
  });
});

describe("閒聊台詞都有英文", () => {
  it("i18n-en.ts 查得到每一句", async () => {
    const { EN } = await import("./i18n-en");
    const every = [...Object.values(ROLE_LINES).flat(), ...Object.values(MOOD_LINES).flat(), ...Object.values(TIME_LINES).flat()];
    expect(every.filter((l) => !(l in EN))).toEqual([]);
  });
});
