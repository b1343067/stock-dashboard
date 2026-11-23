import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAiMessage, shouldSendAi } from "./aiDiscord";
import type { AiReport } from "./types";

const sample = JSON.parse(readFileSync("public/ai/sample-report.json", "utf8")) as AiReport;
const real = { ...sample, sample: false, date: "2026-11-24" } as AiReport;

describe("aiDiscord", () => {
  it("主管摘要＋重點，附網站連結與免責聲明", () => {
    const m = buildAiMessage(real, "https://example.com/")!;
    const e = m.embeds[0];
    expect(e.title).toBe("🏢 AI 主管今日重點（2026-11-24）");
    expect(e.description).toContain(real.roles.lead.summary.zh);
    expect(e.description).toContain("1. ");
    expect(e.description).toContain("(https://example.com/)");
    expect(e.footer!.text).toContain("非投資建議");
  });
  it("範例報告、主管休假 → 不送", () => {
    expect(buildAiMessage(sample, "x")).toBeNull();
    expect(buildAiMessage({ ...real, roles: { ...real.roles, lead: { ...real.roles.lead, status: "off" } } } as AiReport, "x")).toBeNull();
    expect(buildAiMessage(null, "x")).toBeNull();
  });
  it("同一天只送一次", () => {
    expect(shouldSendAi("2026-11-23", real)).toBe(true);
    expect(shouldSendAi("2026-11-24", real)).toBe(false);
    expect(shouldSendAi(null, real)).toBe(true);
    expect(shouldSendAi(null, sample)).toBe(false);
  });
});
