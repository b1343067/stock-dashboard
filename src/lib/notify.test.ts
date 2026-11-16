// 每日篩選通知的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import { buildMessages, buildState, chunk, evaluateRules, sanitizeNotifyConfig, toRuleJson } from "./notify";
import { makeCondition, sanitizeConditions, type ScreenerData, type ScreenerSeries, type ScreenerTicker } from "./screener";

function series(close: number[], rsi: number[]): ScreenerSeries {
  const nulls = () => close.map(() => null);
  return {
    time: close.map((_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`),
    close,
    ma10: nulls(), ma20: nulls(), ma50: nulls(), ma200: nulls(),
    rsi, macd: nulls(), signal: nulls(), hist: nulls(),
    bbUpper: nulls(), bbMiddle: nulls(), bbLower: nulls(),
  };
}
function tk(symbol: string, rsi: number, category = "科技"): ScreenerTicker {
  const s = series([100, 101], [50, rsi]);
  return { symbol, name: `${symbol} Inc`, category, currency: "USD", lastDate: "2026-01-02", lastClose: 101, changePct: 1, daily: s, weekly: s, monthly: s };
}
const data: ScreenerData = { generatedAt: "", bars: 2, tickers: [tk("AAA", 25), tk("BBB", 28, "金融"), tk("CCC", 60)] };

const cfg = sanitizeNotifyConfig({
  rules: [
    { name: "超賣", conditions: [{ kind: "rsiBelow", tf: "daily", value: 30 }] },
    { name: "只看科技", category: "科技", conditions: [{ kind: "rsiBelow", value: 30 }] },
    { name: "壞規則", conditions: [{ kind: "nope" }] },
    { conditions: [{ kind: "rsiBelow" }] },
  ],
});

describe("sanitizeNotifyConfig", () => {
  it("丟掉沒有名稱或沒有有效條件的規則，補預設值", () => {
    expect(cfg.rules.map((r) => r.name)).toEqual(["超賣", "只看科技"]);
    expect(cfg.rules[0]).toMatchObject({ mode: "and", category: "all" });
    expect(cfg.siteUrl).toMatch(/^https:\/\/.+\/$/);
    expect(cfg.onlyWhenMatched).toBe(true);
  });
  it("siteUrl 只接受 https", () => {
    expect(sanitizeNotifyConfig({ siteUrl: "javascript:alert(1)" }).siteUrl).toMatch(/^https:/);
  });
});

describe("evaluateRules", () => {
  it("用篩選器同一套判斷；分類範圍有作用；和昨天比較標出新的", () => {
    const res = evaluateRules(data, cfg.rules, { dataDate: "2026-01-01", rules: { 超賣: ["AAA"] } });
    expect(res[0].matches.map((m) => [m.ticker.symbol, m.isNew])).toEqual([["BBB", true], ["AAA", false]]); // 新的排前面
    expect(res[1].matches.map((m) => m.ticker.symbol)).toEqual(["AAA"]);
    expect(buildState(res, "2026-01-02")).toEqual({ dataDate: "2026-01-02", rules: { 超賣: ["BBB", "AAA"], 只看科技: ["AAA"] } });
  });
});

describe("buildMessages", () => {
  it("包含規則、股票連結、新增標記與免責聲明", () => {
    const msg = buildMessages(evaluateRules(data, cfg.rules, null), cfg, "2026-01-02").join("\n");
    expect(msg).toContain("2026-01-02");
    expect(msg).toContain("**超賣** — 2 檔（🆕 新增 2）");
    expect(msg).toContain("[AAA](<https://");
    expect(msg).toContain("#/AAA/daily>)");
    expect(msg).toContain("RSI 25.0");
    expect(msg).toContain("非投資建議");
  });
  it("都沒有符合時不送（onlyWhenMatched）", () => {
    const none = evaluateRules({ ...data, tickers: [tk("CCC", 60)] }, cfg.rules, null);
    expect(buildMessages(none, cfg, "2026-01-02")).toEqual([]);
    expect(buildMessages(none, { ...cfg, onlyWhenMatched: false }, "2026-01-02")).toHaveLength(1);
  });
  it("超過 Discord 2000 字上限會切成多則", () => {
    const parts = chunk(Array.from({ length: 100 }, (_, i) => `line ${i} ${"x".repeat(50)}`), 2000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 2000)).toBe(true);
    expect(chunk(["y".repeat(3000)], 2000)[0].length).toBe(2000);
  });
});

describe("toRuleJson", () => {
  it("去掉 id，貼回設定檔後條件相同", () => {
    const c = [makeCondition("maCrossUp")];
    const json = JSON.parse(toRuleJson("交叉", "and", "all", c));
    expect(json.conditions[0].id).toBeUndefined();
    expect(sanitizeConditions(json.conditions)[0]).toMatchObject({ kind: "maCrossUp", ma: 50, ma2: 200 });
  });
});
