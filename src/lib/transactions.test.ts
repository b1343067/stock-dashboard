// 交易紀錄制投資組合的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import {
  buildLedger,
  cashFlows,
  fxAt,
  positionStats,
  positionsToHoldings,
  realizedBySale,
  sampleTransactions,
  sanitizeTransactions,
  totals,
  xirr,
  type Transaction,
} from "./transactions";

let n = 0;
const tx = (date: string, symbol: string, type: Transaction["type"], shares = 0, price = 0, fee = 0, amount = 0): Transaction => ({
  id: `x${++n}`,
  date,
  symbol,
  type,
  shares,
  price,
  fee,
  amount,
});

describe("buildLedger（移動平均成本法）", () => {
  it("兩次買進 → 平均成本含手續費", () => {
    const { positions } = buildLedger([tx("2024-01-01", "AAA", "buy", 10, 100, 10), tx("2024-02-01", "AAA", "buy", 10, 200, 10)]);
    expect(positions[0].shares).toBe(20);
    expect(positions[0].avgCost).toBe(151); // (1000+10+2000+10)/20
    expect(positions[0].invested).toBe(3020);
  });

  it("賣出 → 已實現 = 賣出金額 − 費用 − 股數 × 平均成本；平均成本不變", () => {
    const { positions } = buildLedger([
      tx("2024-01-01", "AAA", "buy", 10, 100),
      tx("2024-01-02", "AAA", "buy", 10, 200),
      tx("2024-03-01", "AAA", "sell", 5, 300, 5),
    ]);
    const p = positions[0];
    expect(p.realized).toBeCloseTo(5 * 300 - 5 - 5 * 150);
    expect(p.shares).toBe(15);
    expect(p.avgCost).toBeCloseTo(150);
  });

  it("輸入順序亂掉也會依日期計算；同一天先買後賣", () => {
    const { positions, warnings } = buildLedger([tx("2024-01-01", "AAA", "sell", 5, 120), tx("2024-01-01", "AAA", "buy", 10, 100)]);
    expect(warnings).toEqual([]);
    expect(positions[0].realized).toBeCloseTo(100);
  });

  it("賣超過持有股數 → 警告，只算持有的部分", () => {
    const { positions, warnings } = buildLedger([tx("2024-01-01", "AAA", "buy", 10, 100), tx("2024-02-01", "AAA", "sell", 15, 110, 15)]);
    expect(warnings[0]).toContain("只持有 10 股");
    expect(positions[0].shares).toBe(0);
    expect(positions[0].realized).toBeCloseTo(10 * 110 - 10 - 1000); // 手續費依比例 10/15
  });

  it("股利不影響成本", () => {
    const { positions } = buildLedger([tx("2024-01-01", "AAA", "buy", 10, 100), tx("2024-06-01", "AAA", "dividend", 0, 0, 0, 30)]);
    expect(positions[0].dividends).toBe(30);
    expect(positions[0].avgCost).toBe(100);
  });

  it("轉成持股：賣光的不列入，沿用舊持股的類型設定", () => {
    const { positions } = buildLedger([
      tx("2024-01-01", "AAA", "buy", 10, 100),
      tx("2024-01-01", "BBB", "buy", 10, 100),
      tx("2024-02-01", "BBB", "sell", 10, 100),
    ]);
    const hs = positionsToHoldings(positions, [{ id: "h1", symbol: "AAA", shares: 1, cost: 1, type: "short", tpPct: 30, slPct: 10 }]);
    expect(hs).toHaveLength(1);
    expect(hs[0]).toMatchObject({ id: "h1", symbol: "AAA", shares: 10, cost: 100, type: "short", tpPct: 30 });
  });
});

describe("xirr", () => {
  it("一年後拿回 110% → 10%", () => {
    expect(xirr([{ date: "2023-01-01", amount: -100 }, { date: "2024-01-01", amount: 110 }])).toBeCloseTo(0.1, 6);
  });
  it("兩年後拿回 121% → 每年 10%", () => {
    expect(xirr([{ date: "2022-01-01", amount: -100 }, { date: "2024-01-01", amount: 121 }])).toBeCloseTo(0.1, 3);
  });
  it("分批投入：結果讓淨現值 = 0", () => {
    const flows = [
      { date: "2022-01-01", amount: -1000 },
      { date: "2022-07-01", amount: -500 },
      { date: "2023-03-15", amount: 80 },
      { date: "2024-01-01", amount: 1700 },
    ];
    const r = xirr(flows)!;
    const npv = flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, (Date.parse(f.date) - Date.parse("2022-01-01")) / 86_400_000 / 365), 0);
    expect(Math.abs(npv)).toBeLessThan(1e-6);
  });
  it("虧損也算得出來（負報酬）", () => {
    expect(xirr([{ date: "2023-01-01", amount: -100 }, { date: "2024-01-01", amount: 50 }])).toBeCloseTo(-0.5, 6);
  });
  it("只有投入沒有回收、或少於兩筆 → null", () => {
    expect(xirr([{ date: "2023-01-01", amount: -100 }, { date: "2024-01-01", amount: -50 }])).toBeNull();
    expect(xirr([{ date: "2023-01-01", amount: -100 }])).toBeNull();
  });
});

describe("每檔與整體報酬", () => {
  const txs = [
    tx("2023-01-01", "AAA", "buy", 10, 100),
    tx("2023-07-01", "AAA", "dividend", 0, 0, 0, 20),
    tx("2023-10-01", "AAA", "sell", 5, 120),
    tx("2023-01-01", "0050.TW", "buy", 1000, 100),
  ];
  const ledger = buildLedger(txs);
  const stats = positionStats(txs, ledger, { AAA: 130, "0050.TW": 110 }, "2024-01-01");

  it("總損益 = 已實現 + 未實現 + 股利", () => {
    const a = stats.find((s) => s.symbol === "AAA")!;
    expect(a.realized).toBeCloseTo(100);
    expect(a.unrealized).toBeCloseTo(150);
    expect(a.totalPnl).toBeCloseTo(270);
    expect(a.totalReturnPct).toBeCloseTo(27);
    expect(a.xirr).not.toBeNull();
  });

  it("整體用美元：台股每筆依當天匯率換算", () => {
    const hist = { time: ["2022-12-30", "2023-06-30"], close: [30, 32] };
    const tt = totals(txs, stats, hist, 32, "2024-01-01");
    // 0050 買進 100,000 台幣 ÷ 30 = 3,333.33 美元；AAA 1,000 美元
    expect(tt.investedUsd).toBeCloseTo(1000 + 100_000 / 30, 4);
    expect(tt.realizedUsd).toBeCloseTo(100);
    expect(tt.dividendsUsd).toBeCloseTo(20);
    // 未實現：AAA 150 美元 + 0050 10,000 台幣 ÷ 最新 32
    expect(tt.unrealizedUsd).toBeCloseTo(150 + 10_000 / 32, 4);
    expect(tt.xirr).not.toBeNull();
    expect(tt.missing).toEqual([]);
  });

  it("沒有報價的股票列在 missing，不算進總計", () => {
    const s2 = positionStats(txs, ledger, { AAA: 130 }, "2024-01-01");
    expect(totals(txs, s2, null, 32, "2024-01-01").missing).toEqual(["0050.TW"]);
  });

  it("每筆賣出的已實現損益", () => {
    expect([...realizedBySale(txs).values()][0]).toBeCloseTo(100);
  });

  it("cashFlows：買進為負、賣出與股利為正，最後加上市值", () => {
    expect(cashFlows(txs.filter((t) => t.symbol === "AAA"), 650, "2024-01-01").map((f) => f.amount)).toEqual([-1000, 20, 600, 650]);
  });
});

describe("fxAt", () => {
  const h = { time: ["2024-01-02", "2024-01-03", "2024-01-05"], close: [30, 31, 32] };
  it("找當天或之前最近的一天", () => {
    expect(fxAt(h, "2024-01-03", 33)).toBe(31);
    expect(fxAt(h, "2024-01-04", 33)).toBe(31);
    expect(fxAt(h, "2025-01-01", 33)).toBe(32);
    expect(fxAt(h, "2023-01-01", 33)).toBe(30);
  });
  it("沒有歷史 → 最新匯率", () => expect(fxAt(null, "2024-01-01", 33)).toBe(33));
});

describe("sanitizeTransactions", () => {
  it("丟掉壞資料", () => {
    const [ok, dropped] = sanitizeTransactions([
      { date: "2024-01-01", symbol: "aaa", type: "buy", shares: 1, price: 10 },
      { date: "2024-13-01", symbol: "AAA", type: "buy", shares: 1, price: 10 },
      { date: "2024-01-01", symbol: "AAA", type: "dividend", amount: 0 },
      { date: "2024-01-01", symbol: "AAA", type: "swap", shares: 1, price: 1 },
      null,
    ]);
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ symbol: "AAA", fee: 0, amount: 0 });
    expect(dropped).toBe(4);
  });
  it("範例交易格式都正確", () => {
    const s = sampleTransactions();
    expect(sanitizeTransactions(s)[0]).toHaveLength(s.length);
    expect(buildLedger(s).warnings).toEqual([]);
  });
});
