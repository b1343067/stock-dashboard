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
  buildNewsEmbeds,
  statLines,
} from "./notify";
import type { NewsItem } from "./finnhub";
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

describe("新聞與財報卡片", () => {
  const now = 1_800_000_000;
  const n = (id: string, headline: string, url: string, hoursAgo: number, source = "Reuters", symbol: string | null = null): NewsItem => ({ id, symbol, headline, source, url, datetime: now - hoursAgo * 3600 });
  const c = sanitizeNotifyConfig({ watch: ["NVDA", "TSLA", "AAPL"] });
  const bundle = {
    market: [
      n("m1", "Fed holds rates steady", "https://r/1", 2),
      n("m2", "Random blog post", "https://b/2", 1, "Blog"),
      n("m3", "Old news [archive]", "https://r/3", 30),
      n("m4", "Nvidia (NVDA) jumps", "https://x/a_(b)", 3),
      ...Array.from({ length: 6 }, (_, i) => n(`f${i}`, `Filler ${i}`, `https://f/${i}`, 4, "Blog")),
    ],
    watch: {
      NVDA: [n("w1", "Nvidia (NVDA) jumps", "https://other/nvda", 3, "CNBC", "NVDA"), n("w2", "Nvidia new chip", "https://c/2", 5, "CNBC", "NVDA"), n("w3", "Nvidia third", "https://c/3", 6, "CNBC", "NVDA"), n("w4", "Nvidia fourth", "https://c/4", 7, "CNBC", "NVDA")],
      TSLA: [n("t1", "Tesla old", "https://c/t", 40, "CNBC", "TSLA")],
    },
    earnings: [
      { symbol: "NVDA", date: "2027-01-17", hour: "amc", epsEstimate: 1 },
      { symbol: "WMT", date: "2027-01-16", hour: "bmo", epsEstimate: 1 },
    ],
  };
  const embeds = buildNewsEmbeds(bundle, c, now, "2027-01-15");
  const byTitle = (p: string) => embeds.find((e) => e.title.startsWith(p))!;

  it("重大財經新聞：最多 5 則、24 小時內、主要媒體優先", () => {
    const d = byTitle("📰").description;
    expect(d.split("\n").filter((l) => l.startsWith("•"))).toHaveLength(5);
    expect(d.indexOf("Fed holds rates")).toBeLessThan(d.indexOf("Random blog"));
    expect(d).not.toContain("Old news");
    expect(d).toContain("Reuters · 2 小時前");
  });

  it("網址括號被編碼，連結不會壞", () => {
    expect(byTitle("📰").description).toContain("(https://x/a_%28b%29)");
  });

  it("關注股票新聞：每檔最多 2 則、同一則新聞不重複、24 小時內", () => {
    const d = byTitle("🔎").description;
    expect(d).not.toContain("Nvidia (NVDA) jumps"); // 已經在重大新聞出現過（同標題）
    expect(d).toContain("Nvidia new chip");
    expect(d).toContain("Nvidia third");
    expect(d).not.toContain("Nvidia fourth");
    expect(d).not.toContain("TSLA"); // TSLA 的新聞超過 24 小時
  });

  it("財報提醒：只列 watch 清單，附星期、盤前盤後、幾天後與規則", () => {
    const d = byTitle("📅").description;
    expect(d).toContain("**NVDA** 01/17（週日） 盤後・2 天後");
    expect(d).not.toContain("WMT");
    expect(d).toContain("財報前一週不開新倉");
  });

  it("沒有金鑰或抓取失敗（null）→ 整段略過；只有部分失敗 → 其他照常", () => {
    expect(buildNewsEmbeds(null, c, now, "2027-01-15")).toEqual([]);
    expect(buildNewsEmbeds({ market: null, watch: null, earnings: bundle.earnings }, c, now, "2027-01-15").map((e) => e.title)).toEqual(["📅 財報提醒（7 天內）"]);
  });

  it("每日摘要的卡片順序：市場 → 財經新聞 → 關注 → 關注新聞 → 財報 → 訊號", () => {
    const calm = { ...data, tickers: data.tickers.filter((x) => x.symbol === "VOO") };
    const titles = buildMessages(calm, { ...c, watch: ["VOO", "NVDA"], priceAlerts: [] }, "2027-01-15", null, bundle, now).flatMap((m) => m.embeds.map((e) => e.title.slice(0, 2)));
    expect(titles).toEqual(["📊", "📰", "👀", "🔎", "📅"].map((x) => x.slice(0, 2)));
  });
});

describe("市場狀態（ML 實驗室 ③）", () => {
  it("放在市場摘要第一行；沒有資料就不列", () => {
    const regime = { VOO: { label: "美股（VOO）", key: "down" as const, name: "修正下跌", since: "2026-10-30", days: 12, date: "2026-11-16", ret20: -3, vol20: 20, dd: -5 } };
    const withR = buildMessages(data, cfg, "2026-01-03", null, null, 1, regime);
    const market = withR.flatMap((m) => m.embeds).find((e) => e.title.startsWith("📊"))!;
    expect(market.description.split("\n")[0]).toBe("市場狀態：美股（VOO） **修正下跌**（第 12 天）");
    const without = buildMessages(data, cfg, "2026-01-03", null).flatMap((m) => m.embeds).find((e) => e.title.startsWith("📊"))!;
    expect(without.description).not.toContain("市場狀態");
  });
});

describe("訊號回測附註（statLines）", () => {
  const h = (n: number, avg: number | null, win: number | null) => ({ n, avg, win });
  const stats = {
    generatedAt: "x",
    from: "2021-01-01",
    to: "2026-01-01",
    tickers: 10,
    baseline: { h5: h(100, 0.4, 55), h20: h(100, 1.73, 58.4) },
    rules: [
      { name: "MACD 死亡交叉", group: "danger" as const, events: 100, symbols: 5, h5: h(100, 0.4, 56), h20: h(100, 1.49, 58.6), lastDate: null },
      { name: "少", group: "danger" as const, events: 5, symbols: 2, h5: h(5, 1, 60), h20: h(5, -2, 40), lastDate: null },
    ],
    skipped: [],
  };
  const hit = (rules: string[]) => ({ ticker: {} as ScreenerTicker, rules, isNew: false });

  it("只列今天出現的規則，附上平常的基準；樣本少要標示", () => {
    const lines = statLines([hit(["MACD 死亡交叉"]), hit(["MACD 死亡交叉", "少", "沒統計"])], stats);
    expect(lines[0]).toBe("📈 過去 5 年出現後 20 天（平常 +1.7%／上漲 58%）");
    expect(lines.slice(1)).toEqual(["・MACD 死亡交叉 +1.5%／上漲 59%", "・少 -2.0%／上漲 40%（樣本少）"]);
  });
  it("沒有回測資料或沒有對應的規則 → 不附", () => {
    expect(statLines([hit(["MACD 死亡交叉"])], null)).toEqual([]);
    expect(statLines([hit(["沒統計"])], stats)).toEqual([]);
  });
});
