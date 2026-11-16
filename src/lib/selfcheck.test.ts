// 組合分析的「自我檢查」：用網站上實際的 VOO 資料，走完整個計算流程。
// 任何股票對自己的 Beta、相關係數都必須是 1；如果日期錯位（例如時區造成差一天）
// 或報酬沒有在共同交易日上計算，這個檢查就會失敗。
// 執行：npm test
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alignSeries, analyze, convertToUsd, correlation, dailyReturns, type PriceSeries } from "./analytics";
import type { TickerData } from "./types";

function load(symbol: string): TickerData {
  return JSON.parse(readFileSync(`public/data/${symbol}.json`, "utf8")) as TickerData;
}
const daily = (t: TickerData): PriceSeries => ({ time: t.daily.time, close: t.daily.close });

describe("自我檢查：VOO 對自己", () => {
  const voo = daily(load("VOO"));

  it("Beta = 1、相關係數 = 1（只有 VOO）", () => {
    const aligned = alignSeries({ VOO: voo });
    const res = analyze(aligned, { VOO: 1 }, "VOO", 0.04);
    expect(res.assets[0].beta).toBeCloseTo(1, 10);
    expect(res.weightedBeta).toBeCloseTo(1, 10);
    expect(res.corr[0][0]).toBe(1);
    expect(correlation(dailyReturns(aligned.prices.VOO), dailyReturns(aligned.prices.VOO))).toBeCloseTo(1, 10);
    expect(res.alpha).toBeCloseTo(0, 10); // 對自己沒有超額報酬
  });

  it("和台股一起對齊日期後，VOO 對自己仍然是 1", () => {
    // 加入台股會讓共同交易日變少（台股假日），但 VOO 對自己的關係不能被破壞
    const tw = load("0050.TW");
    const twUsd = convertToUsd(daily(tw), tw.currency, null, 32)!.series;
    const aligned = alignSeries({ VOO: voo, "0050.TW": twUsd });
    expect(aligned.time.length).toBeGreaterThan(200);
    const res = analyze(aligned, { VOO: 0.5, "0050.TW": 0.5 }, "VOO", 0.04);
    const vooStats = res.assets.find((a) => a.symbol === "VOO")!;
    expect(vooStats.beta).toBeCloseTo(1, 10);
    const i = res.symbols.indexOf("VOO");
    expect(res.corr[i][i]).toBe(1);
  });

  it("對照組：故意把日期錯開一天，相關係數會明顯下降（證明這個檢查抓得到錯位）", () => {
    const shifted: PriceSeries = { time: voo.time.slice(1), close: voo.close.slice(0, -1) };
    const aligned = alignSeries({ VOO: voo, SHIFTED: shifted });
    const r = correlation(dailyReturns(aligned.prices.VOO), dailyReturns(aligned.prices.SHIFTED));
    expect(r).toBeLessThan(0.3);
  });
});

describe("資料檢查：所有股票的日期", () => {
  const index = JSON.parse(readFileSync("public/data/index.json", "utf8")) as { tickers: { symbol: string }[] };
  for (const { symbol } of index.tickers) {
    it(`${symbol}：日期遞增、沒有重複、沒有週末`, () => {
      const t = load(symbol).daily.time;
      for (let i = 1; i < t.length; i++) expect(t[i] > t[i - 1], `${symbol} ${t[i - 1]} → ${t[i]}`).toBe(true);
      const weekend = t.filter((d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()));
      expect(weekend, `${symbol} 出現週末日期（可能是時區造成日期錯開）`).toEqual([]);
    });
  }
});
