// 組合分析與趨勢外推的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import {
  alignSeries,
  analyze,
  backtestStats,
  buyAndHold,
  convertToUsd,
  correlation,
  covariance,
  dailyReturns,
  maxDrawdown,
  maxSharpe,
  portfolioPerf,
  projectToBox,
  sliceFrom,
} from "./analytics";
import { backtestAccuracy, extrapolate, linearFit, nextTradingDays } from "./trend";

/** 固定種子的亂數，讓測試每次結果一樣 */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("基本統計", () => {
  it("共變異數、相關係數", () => {
    expect(covariance([1, 2, 3], [2, 4, 6])).toBeCloseTo(2);
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
  });
  it("日報酬", () => {
    expect(dailyReturns([100, 110, 99])).toEqual([0.1, -0.1].map((x) => expect.closeTo(x, 10)));
  });
  it("最大回撤與位置", () => {
    const r = maxDrawdown([100, 120, 90, 130, 104]);
    expect(r.mdd).toBeCloseTo(-0.25); // 120 → 90
    expect(r.peakIdx).toBe(1);
    expect(r.troughIdx).toBe(2);
  });
  it("一路上漲時回撤為 0", () => {
    expect(maxDrawdown([1, 2, 3]).mdd).toBe(0);
  });
});

describe("換匯與對齊", () => {
  it("台股用當天（或前一筆）匯率換成美元", () => {
    const tw = { time: ["2026-01-02", "2026-01-05", "2026-01-06"], close: [320, 330, 340] };
    const fx = { time: ["2026-01-02", "2026-01-06"], close: [32, 34] };
    const r = convertToUsd(tw, "TWD", fx, 33)!;
    expect(r.approx).toBe(false);
    expect(r.series.close).toEqual([10, 330 / 32, 10]); // 01-05 沒匯率 → 用 01-02 的
  });
  it("沒有歷史匯率時用最新匯率並標記為近似", () => {
    const r = convertToUsd({ time: ["a"], close: [330] }, "TWD", null, 33)!;
    expect(r.approx).toBe(true);
    expect(r.series.close[0]).toBe(10);
  });
  it("不認得的幣別回傳 null", () => {
    expect(convertToUsd({ time: [], close: [] }, "JPY", null, 1)).toBeNull();
  });
  it("對齊只留共同日期", () => {
    const a = alignSeries({
      US: { time: ["d1", "d2", "d3"], close: [1, 2, 3] },
      TW: { time: ["d2", "d3", "d4"], close: [20, 30, 40] },
    });
    expect(a.time).toEqual(["d2", "d3"]);
    expect(a.prices.TW).toEqual([20, 30]);
    expect(sliceFrom(a, "d3").prices.US).toEqual([3]);
  });
});

describe("analyze：Beta、Alpha、CAPM", () => {
  // 造一個市場 M，A = 2 倍市場報酬、B = 市場報酬 + 每天固定多 0.1%
  const r = rng(42);
  const n = 300;
  const m = [100];
  const a = [100];
  const b = [100];
  for (let i = 1; i < n; i++) {
    const rm = (r() - 0.5) * 0.02;
    m.push(m[i - 1] * (1 + rm));
    a.push(a[i - 1] * (1 + 2 * rm));
    b.push(b[i - 1] * (1 + rm + 0.001));
  }
  const time = m.map((_, i) => `t${String(i).padStart(4, "0")}`);
  const aligned = { time, prices: { M: m, A: a, B: b } };
  const res = analyze(aligned, { A: 0.5, B: 0.5 }, "M", 0.04);

  it("個股 Beta", () => {
    expect(res.assets[0].beta).toBeCloseTo(2, 6);
    expect(res.assets[1].beta).toBeCloseTo(1, 6);
  });
  it("加權 Beta = Σ 權重 × Beta", () => {
    expect(res.weightedBeta).toBeCloseTo(1.5, 6);
  });
  it("Jensen's Alpha：B 每天多 0.1%，年化約 25.2%", () => {
    expect(res.assets[1].alpha).toBeCloseTo(0.252, 6);
  });
  it("CAPM 預期報酬 = rf + β × (E(Rm) − rf)", () => {
    const em = res.marketExpected;
    expect(res.assets[0].capm).toBeCloseTo(0.04 + 2 * (em - 0.04), 6);
  });
  it("可指定市場預期報酬", () => {
    const r2 = analyze(aligned, { A: 0.5, B: 0.5 }, "M", 0.04, 0.1);
    expect(r2.assets[0].capm).toBeCloseTo(0.04 + 2 * 0.06, 6);
  });
  it("相關係數矩陣對角線為 1、對稱", () => {
    expect(res.corr[0][0]).toBe(1);
    expect(res.corr[0][1]).toBeCloseTo(res.corr[1][0]);
  });
});

describe("夏普值最佳化", () => {
  it("投影後權重在範圍內且總和為 1", () => {
    const w = projectToBox([0.9, 0.05, 0.05, 0], 0.05, 0.45);
    expect(w.reduce((x, y) => x + y)).toBeCloseTo(1, 9);
    for (const x of w) {
      expect(x).toBeGreaterThanOrEqual(0.05 - 1e-12);
      expect(x).toBeLessThanOrEqual(0.45 + 1e-12);
    }
  });

  it("結果符合限制，且夏普值不低於等權重與隨機權重", () => {
    const mu = [0.12, 0.08, 0.1, 0.06];
    const cov = [
      [0.09, 0.02, 0.03, 0.01],
      [0.02, 0.04, 0.01, 0.005],
      [0.03, 0.01, 0.06, 0.01],
      [0.01, 0.005, 0.01, 0.02],
    ];
    const res = maxSharpe(mu, cov, 0.03);
    expect(res.ok).toBe(true);
    expect(res.weights.reduce((x, y) => x + y)).toBeCloseTo(1, 6);
    res.weights.forEach((x) => {
      expect(x).toBeGreaterThanOrEqual(0.05 - 1e-9);
      expect(x).toBeLessThanOrEqual(0.45 + 1e-9);
    });
    const r = rng(7);
    for (let k = 0; k < 200; k++) {
      const w = projectToBox(mu.map(() => r()), 0.05, 0.45);
      expect(res.sharpe).toBeGreaterThanOrEqual(portfolioPerf(w, mu, cov, 0.03).sharpe - 1e-9);
    }
  });

  it("檔數太少無法滿足 5%～45% 限制", () => {
    const res = maxSharpe([0.1, 0.1], [[0.04, 0], [0, 0.04]], 0.03);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("至少需要 3 檔");
  });

  it("預期超額報酬全部 ≤ 0 時不最佳化", () => {
    const res = maxSharpe([0.01, 0.02, 0.02], [[0.04, 0, 0], [0, 0.04, 0], [0, 0, 0.04]], 0.05);
    expect(res.ok).toBe(false);
  });
});

describe("回測（修正 #5：起始日買進持有）", () => {
  const aligned = {
    time: ["2025-01-02", "2025-07-02", "2026-01-02"],
    prices: { A: [100, 50, 200], B: [10, 20, 10] },
  };
  it("在起始日依權重買進，之後不再平衡", () => {
    // A 買 50 股、B 買 500 股
    expect(buyAndHold(aligned, { A: 0.5, B: 0.5 }, 10000)).toEqual([10000, 12500, 15000]);
  });
  it("從不同起始日開始，結果不同（不是用今天的權重回推）", () => {
    const later = sliceFrom(aligned, "2025-07-02");
    // 起始日 A=50、B=20 → A 買 100 股、B 買 250 股 → 100×200 + 250×10
    expect(buyAndHold(later, { A: 0.5, B: 0.5 }, 10000)).toEqual([10000, 22500]);
  });
  it("統計數字", () => {
    const s = backtestStats(aligned.time, [10000, 8000, 12000], 0);
    expect(s.totalReturn).toBeCloseTo(0.2);
    expect(s.maxDrawdown).toBeCloseTo(-0.2);
    expect(s.mddPeak).toBe("2025-01-02");
    expect(s.mddTrough).toBe("2025-07-02");
    expect(s.cagr).toBeCloseTo(1.2 ** (365.25 / 365) - 1, 4);
  });
});

describe("短期趨勢外推（修正 #4）", () => {
  it("直線資料外推剛好落在線上", () => {
    expect(linearFit([1, 3, 5, 7])).toEqual({ slope: 2, intercept: 1 });
    expect(extrapolate([1, 3, 5, 7], 4, 2)).toEqual([9, 11]);
  });
  it("預測日期跳過週末與美股休市日", () => {
    // 2026-11-25 是週三，11-26 感恩節休市，11-28、29 是週末
    expect(nextTradingDays("2026-11-25", 3, "US")).toEqual(["2026-11-27", "2026-11-30", "2026-12-01"]);
    // 台股只跳過週末
    expect(nextTradingDays("2026-11-25", 3, "TW")).toEqual(["2026-11-26", "2026-11-27", "2026-11-30"]);
  });
  it("回測準確度：完美直線時趨勢外推誤差為 0，勝過 naive", () => {
    const closes = Array.from({ length: 100 }, (_, i) => 100 + i);
    const acc = backtestAccuracy(closes, 20, 1, 50)!;
    expect(acc.samples).toBe(50);
    expect(acc.trendMape).toBeCloseTo(0, 9);
    expect(acc.naiveMape).toBeGreaterThan(0);
    expect(acc.winRate).toBe(100);
    expect(acc.directionHit).toBe(100);
  });
  it("回測只用當時以前的資料（不偷看未來）", () => {
    // 前 60 天上漲、之後突然下跌：第一個下跌日的預測不應該知道會跌
    const closes = [...Array.from({ length: 60 }, (_, i) => 100 + i), 100];
    const acc = backtestAccuracy(closes, 20, 1, 1)!;
    expect(acc.directionHit).toBe(0);
  });
  it("資料不足時回傳 null", () => {
    expect(backtestAccuracy([1, 2, 3], 20, 1)).toBeNull();
  });
});
