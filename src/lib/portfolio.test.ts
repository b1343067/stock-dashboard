// 投資組合計算的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  buildExport,
  computePortfolio,
  parseImport,
  sanitizeHoldings,
  sanitizeSettings,
  stopStatus,
  toUsd,
  type Holding,
  type Quote,
} from "./portfolio";

const fx = { USDTWD: 32 };
const q = (price: number, currency = "USD"): Quote => ({ price, currency, name: "", date: "2026-11-13" });
const h = (p: Partial<Holding>): Holding => ({
  id: "x", symbol: "AAA", shares: 1, cost: 100, type: "core", tpPct: null, slPct: null, ...p,
});

describe("toUsd（修正 #3：台幣要先換成美元）", () => {
  it("台幣除以匯率", () => expect(toUsd(3200, "TWD", fx)).toBe(100));
  it("美元不變", () => expect(toUsd(100, "USD", fx)).toBe(100));
  it("沒有匯率回傳 null，不亂算", () => expect(toUsd(3200, "TWD", {})).toBeNull());
});

describe("stopStatus", () => {
  // 成本 100、停利 120、停損 80、提醒 5%
  it("一般", () => expect(stopStatus(100, 120, 80, 5)).toBe("normal"));
  it("距停利 5% 以內", () => expect(stopStatus(115, 120, 80, 5)).toBe("tp-near")); // (120-115)/115 = 4.3%
  it("剛好超過 5% 不提醒", () => expect(stopStatus(114, 120, 80, 5)).toBe("normal")); // 5.26%
  it("已達停利", () => expect(stopStatus(121, 120, 80, 5)).toBe("tp-hit"));
  it("距停損 5% 以內", () => expect(stopStatus(84, 120, 80, 5)).toBe("sl-near")); // (84-80)/84 = 4.8%
  it("已觸及停損", () => expect(stopStatus(80, 120, 80, 5)).toBe("sl-hit"));
});

describe("computePortfolio", () => {
  const holdings = [
    h({ id: "a", symbol: "VOO", shares: 10, cost: 500, type: "core" }),
    h({ id: "b", symbol: "0050.TW", shares: 1000, cost: 80, type: "core" }),
    h({ id: "c", symbol: "NVDA", shares: 10, cost: 100, type: "short" }),
  ];
  const quotes = { VOO: q(600), "0050.TW": q(96, "TWD"), NVDA: q(116) };
  const s = computePortfolio(holdings, quotes, fx, DEFAULT_SETTINGS);

  it("台股市值換成美元後才加總", () => {
    // VOO 6000 + 0050 96000/32=3000 + NVDA 1160 = 10160
    expect(s.totalValueUsd).toBeCloseTo(10160);
    // 成本：5000 + 80000/32=2500 + 1000 = 8500
    expect(s.totalCostUsd).toBeCloseTo(8500);
    expect(s.totalPnlUsd).toBeCloseTo(1660);
    expect(s.totalReturnPct).toBeCloseTo((1660 / 8500) * 100);
  });

  it("單檔報酬率用原幣計算", () => {
    const tw = s.rows.find((r) => r.holding.symbol === "0050.TW")!;
    expect(tw.returnPct).toBeCloseTo(20);
    expect(tw.pnl).toBeCloseTo(16000); // 台幣
    expect(tw.pnlUsd).toBeCloseTo(500);
  });

  it("核心／短線比例與上限提醒", () => {
    expect(s.shortPct).toBeCloseTo((1160 / 10160) * 100);
    expect(s.shortOverCap).toBe(false);
    const tight = computePortfolio(holdings, quotes, fx, { ...DEFAULT_SETTINGS, shortCapPct: 10 });
    expect(tight.shortOverCap).toBe(true);
  });

  it("短線預設 ±20% 停利停損，並判斷接近停利", () => {
    const n = s.rows.find((r) => r.holding.symbol === "NVDA")!;
    expect(n.tpPrice).toBeCloseTo(120);
    expect(n.slPrice).toBeCloseTo(80);
    expect(n.status).toBe("tp-near"); // 116 距 120 約 3.4%
    expect(s.alertCount).toBe(1);
  });

  it("每檔可自訂停利停損", () => {
    const c = computePortfolio([h({ type: "short", tpPct: 50, slPct: 10 })], { AAA: q(100) }, fx, DEFAULT_SETTINGS);
    expect(c.rows[0].tpPrice).toBeCloseTo(150);
    expect(c.rows[0].slPrice).toBeCloseTo(90);
  });

  it("核心部位沒有停利停損", () => {
    expect(s.rows[0].tpPrice).toBeNull();
    expect(s.rows[0].status).toBe("none");
  });

  it("沒有報價的持股不算進總計", () => {
    const c = computePortfolio([h({ symbol: "ZZZ" }), h({ symbol: "VOO", cost: 500, shares: 1 })], { VOO: q(600) }, fx, DEFAULT_SETTINGS);
    expect(c.missingQuotes).toBe(1);
    expect(c.totalValueUsd).toBe(600);
    expect(c.totalCostUsd).toBe(500);
  });

  it("沒有匯率時台股不算進總計並標記", () => {
    const c = computePortfolio([holdings[1]], quotes, {}, DEFAULT_SETTINGS);
    expect(c.missingFx).toBe(true);
    expect(c.totalValueUsd).toBe(0);
  });

  it("沒有持股時不會除以零", () => {
    const c = computePortfolio([], {}, fx, DEFAULT_SETTINGS);
    expect(c.shortPct).toBeNull();
    expect(c.totalReturnPct).toBeNull();
  });
});

describe("驗證與匯入匯出", () => {
  it("丟掉格式錯誤的持股", () => {
    const [ok, dropped] = sanitizeHoldings([
      { symbol: "voo", shares: 1, cost: 1 },
      { symbol: "", shares: 1, cost: 1 },
      { symbol: "X", shares: -1, cost: 1 },
      { symbol: "Y", shares: 1, cost: "abc" },
      null,
    ]);
    expect(ok).toHaveLength(1);
    expect(ok[0].symbol).toBe("VOO"); // 自動轉大寫
    expect(ok[0].type).toBe("core");
    expect(dropped).toBe(4);
  });
  it("停損 ≥ 100% 視為無效，改用預設", () => {
    const [ok] = sanitizeHoldings([{ symbol: "A", shares: 1, cost: 1, type: "short", slPct: 150, tpPct: 30 }]);
    expect(ok[0].slPct).toBeNull();
    expect(ok[0].tpPct).toBe(30);
  });
  it("設定超出範圍時用預設值", () => {
    expect(sanitizeSettings({ shortCapPct: 500, alertPct: 3 })).toMatchObject({ shortCapPct: 30, alertPct: 3 });
  });
  it("匯出再匯入，資料一致", () => {
    const holdings = [h({ symbol: "VOO", shares: 3, cost: 450, type: "short", tpPct: 10, slPct: 5 })];
    const text = JSON.stringify(buildExport(holdings, { ...DEFAULT_SETTINGS, shortCapPct: 40 }));
    const back = parseImport(text);
    expect(back.holdings[0]).toMatchObject({ symbol: "VOO", shares: 3, cost: 450, type: "short", tpPct: 10, slPct: 5 });
    expect(back.settings.shortCapPct).toBe(40);
  });
  it("錯誤的檔案給中文錯誤訊息", () => {
    expect(() => parseImport("not json")).toThrow("JSON");
    expect(() => parseImport('{"foo":1}')).toThrow("holdings");
  });
});
