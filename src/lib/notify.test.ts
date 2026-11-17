// 每日 Discord 通知的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import {
  buildMessages,
  buildState,
  evaluateSignals,
  findAlerts,
  fitLines,
  fmtPct,
  sanitizeNotifyConfig,
  stockLine,
  toRuleJson,
  withoutExcluded,
  dataKeyOf,
} from "./notify";
import { makeCondition, sanitizeConditions, type ScreenerData, type ScreenerSeries, type ScreenerTicker } from "./screener";

/** 測試用股票：close 是最近幾天收盤，rsi 同長度 */
function tk(symbol: string, close: number[], rsi: number[], extra: Partial<ScreenerTicker> = {}): ScreenerTicker {
  const nulls = () => close.map(() => null);
  const s: ScreenerSeries = {
    time: close.map((_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`),
    close,
    ma10: nulls(), ma20: nulls(), ma50: nulls(), ma200: nulls(),
    rsi, macd: nulls(), signal: nulls(), hist: nulls(),
    bbUpper: nulls(), bbMiddle: nulls(), bbLower: nulls(),
  };
  const last = close[close.length - 1];
  const prev = close[close.length - 2] ?? last;
  return {
    symbol, name: `${symbol} Inc`, category: "科技", currency: "USD", lastDate: "2026-01-03",
    lastClose: last, changePct: ((last / prev) - 1) * 100, daily: s, weekly: s, monthly: s, ...extra,
  };
}

const data: ScreenerData = {
  generatedAt: "",
  bars: 3,
  tickers: [
    tk("VOO", [100, 100, 101], [50, 50, 55]),
    tk("AAA", [100, 100, 93], [72, 70, 50]), // 跌 7%、RSI 3 天急跌 22 點
    tk("BBB", [100, 100, 100], [30, 25, 28]),
    tk("0050.TW", [100, 100, 90], [80, 70, 40]),
  ],
};

const cfg = sanitizeNotifyConfig({
  watch: ["AAA", "VOO"],
  exclude: ["0050.TW"],
  priceAlerts: [{ symbol: "AAA", below: 95 }, { symbol: "BBB", above: 0 }],
  danger: [{ name: "RSI 急轉直下", conditions: [{ kind: "rsiDrop", value: 15, n: 3 }] }],
  rules: [
    { name: "超賣", conditions: [{ kind: "rsiBelow", value: 30 }] },
    { name: "壞規則", conditions: [{ kind: "nope" }] },
  ],
});

describe("sanitizeNotifyConfig", () => {
  it("補預設值、丟掉壞規則與無效價位", () => {
    expect(cfg.benchmarks).toEqual(["VOO", "QQQ", "VT"]);
    expect(cfg.rules.map((r) => r.name)).toEqual(["超賣"]);
    expect(cfg.priceAlerts).toEqual([{ symbol: "AAA", above: null, below: 95 }]);
    expect(cfg.bigMovePct).toBe(5);
  });
  it("沒寫 danger 時用預設的危險訊號；siteUrl 只接受 https", () => {
    const d = sanitizeNotifyConfig({ siteUrl: "javascript:alert(1)" });
    expect(d.danger.map((r) => r.name)).toContain("RSI 急轉直下");
    expect(d.siteUrl).toMatch(/^https:\/\/.+\/$/);
  });
});

describe("訊號與特別注意", () => {
  it("exclude 的股票完全不出現", () => {
    expect(withoutExcluded(data, cfg).tickers.map((x) => x.symbol)).not.toContain("0050.TW");
  });

  it("危險訊號依股票合併，和昨天比較標出新的", () => {
    const hits = evaluateSignals(withoutExcluded(data, cfg), cfg.danger, { dataDate: "x", rules: { "RSI 急轉直下": ["AAA"] } }, cfg.watch);
    expect(hits.map((h) => [h.ticker.symbol, h.rules, h.isNew])).toEqual([["AAA", ["RSI 急轉直下"], false]]);
  });

  it("關注的股票：大跌、穿越價位、出現危險訊號都列入特別注意", () => {
    const d = withoutExcluded(data, cfg);
    const alerts = findAlerts(d, cfg, evaluateSignals(d, cfg.danger, null, cfg.watch));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ticker.symbol).toBe("AAA");
    expect(alerts[0].reasons).toEqual(["單日大跌 ▼ −7.00%", "跌破 95", "⚠️ RSI 急轉直下"]);
  });

  it("價位只在「穿越」那天通知，停在下方不會天天通知", () => {
    const stay = { ...data, tickers: [tk("AAA", [94, 93, 93], [50, 50, 50])] };
    expect(findAlerts(stay, { ...cfg, watch: [] }, [])).toEqual([]);
  });

  it("狀態一行：RSI、MACD、均線", () => {
    expect(stockLine(data.tickers[2])).toBe("RSI 28.0 超賣");
  });
});

describe("buildMessages", () => {
  const msgs = buildMessages(data, cfg, "2026-01-03", null);

  it("有大事時第一則是 🚨 特別注意，手機預覽直接看到重點", () => {
    expect(msgs[0].content).toBe("🚨 **特別注意（01/03）**：AAA 單日大跌 ▼ −7.00%");
    expect(msgs[0].embeds[0].title).toBe("🚨 特別注意");
  });

  it("每日摘要：市場、關注、危險、偏多；0 檔的不列", () => {
    const daily = msgs[1];
    expect(daily.content).toContain("每日摘要");
    expect(daily.embeds.map((e) => e.title)).toEqual(["📊 市場摘要（2026-01-03 收盤）", "👀 我關注的股票", "⚠️ 危險訊號（1 檔）", "✅ 偏多訊號（1 檔）"]);
    expect(daily.embeds[0].description).toContain("上漲 **1**・下跌 **1**・平盤 1（共 3 檔）"); // 0050 已排除
    expect(daily.embeds[3].description).toContain("BBB");
    expect(daily.embeds.at(-1)?.footer?.text).toContain("非投資建議");
    expect(JSON.stringify(msgs)).not.toContain("0050");
  });

  it("沒有大事時只有每日摘要；偏多訊號都沒有就不列那張卡", () => {
    const calm = { ...data, tickers: [tk("VOO", [100, 100, 101], [50, 50, 55])] };
    const m = buildMessages(calm, { ...cfg, priceAlerts: [] }, "2026-01-03", null);
    expect(m).toHaveLength(1);
    expect(m[0].embeds.map((e) => e.title)).toEqual(["📊 市場摘要（2026-01-03 收盤）", "👀 我關注的股票"]);
  });

  it("紀錄：每條規則今天符合的代號", () => {
    expect(buildState("2026-01-03", data, cfg)).toEqual({ dataDate: "2026-01-03", dataKey: "USD:2026-01-03", rules: { "RSI 急轉直下": ["AAA"], 超賣: ["BBB"] } });
  });
});

describe("小工具", () => {
  it("fmtPct：▲▼ 與真正的減號", () => {
    expect(fmtPct(2.9)).toBe("▲ +2.90%");
    expect(fmtPct(-0.38)).toBe("▼ −0.38%");
    expect(fmtPct(0)).toBe("0.00%");
  });
  it("fitLines：超過上限截斷並註明還有幾項", () => {
    const out = fitLines(Array.from({ length: 100 }, (_, i) => `line ${i} ${"x".repeat(50)}`), 1000);
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out).toMatch(/…還有 \d+ 項$/);
  });
  it("toRuleJson：去掉 id，貼回設定檔後條件相同", () => {
    const json = JSON.parse(toRuleJson("交叉", "and", "all", [makeCondition("maCrossUp")]));
    expect(json.conditions[0].id).toBeUndefined();
    expect(sanitizeConditions(json.conditions)[0]).toMatchObject({ kind: "maCrossUp", ma: 50, ma2: 200 });
  });
});

describe("dataKeyOf（同一份資料只通知一次）", () => {
  const mk = (us: string, tw: string): ScreenerData => ({
    generatedAt: "",
    bars: 1,
    tickers: [tk("VOO", [1, 1], [50, 50], { lastDate: us }), tk("2330.TW", [1, 1], [50, 50], { currency: "TWD", lastDate: tw })],
  });
  it("台股、美股的最新日期分開記", () => {
    expect(dataKeyOf(mk("2026-11-16", "2026-11-17"))).toBe("TWD:2026-11-17|USD:2026-11-16");
  });
  it("最新日期相同、但美股更新了 → 視為新資料（不會被誤判成已通知）", () => {
    expect(dataKeyOf(mk("2026-11-16", "2026-11-17"))).not.toBe(dataKeyOf(mk("2026-11-17", "2026-11-17")));
  });
});
