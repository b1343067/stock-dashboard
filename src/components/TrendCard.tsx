// 短期趨勢外推（修正 #4：舊作業叫「AI 預測」，其實是線性回歸外推，所以改名）
// 同時顯示歷史準確度，並和最簡單的「明天價格 = 今天價格」比較，讓使用者知道它到底準不準。

import { useMemo } from "react";
import { fmtNum } from "../lib/format";
import { backtestAccuracy, type AccuracyStats } from "../lib/trend";

export const TREND_LOOKBACK = 20; // 用最近 20 個交易日
export const TREND_HORIZON = 5; // 外推 5 個交易日

interface Props {
  closes: number[];
  lastDate: string;
  currency: string;
  market: "US" | "TW";
  projection: { time: string; value: number }[];
  showOnChart: boolean;
  onToggle: () => void;
}

export default function TrendCard({ closes, lastDate, currency, market, projection, showOnChart, onToggle }: Props) {
  // 歷史準確度：過去約一年，每天用「當時以前」的資料外推，再和實際價格比
  const acc = useMemo(
    () => [1, TREND_HORIZON].map((h) => backtestAccuracy(closes, TREND_LOOKBACK, h, 250)).filter((x): x is AccuracyStats => x !== null),
    [closes],
  );
  const last = closes[closes.length - 1];
  const future = projection.slice(1); // 第一個點是今天收盤，用來把虛線接起來

  return (
    <div className="card">
      <div className="trend-head">
        <h3 className="section-title">
          短期趨勢外推 <span className="muted">· 最近 {TREND_LOOKBACK} 個交易日線性回歸</span>
        </h3>
        <label className="check">
          <input type="checkbox" checked={showOnChart} onChange={onToggle} /> 在日線圖上顯示虛線
        </label>
      </div>

      <div className="trend-grid">
        <div>
          <table className="data-table">
            <thead>
              <tr>
                <th>交易日</th>
                <th className="num">外推價格</th>
                <th className="num">相對今天</th>
              </tr>
            </thead>
            <tbody>
              <tr className="muted">
                <td>{lastDate}（最新收盤）</td>
                <td className="num">{fmtNum(last, 2)}</td>
                <td className="num">—</td>
              </tr>
              {future.map((p) => (
                <tr key={p.time}>
                  <td>{p.time}</td>
                  <td className="num">{fmtNum(p.value, 2)}</td>
                  <td className="num">
                    {p.value >= last ? "+" : ""}
                    {((p.value / last - 1) * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            幣別 {currency}。日期只算交易日（跳過週末{market === "US" ? "與美股休市日" : "；台股國定假日未排除"}）。
            回歸直線是「最適合過去 {TREND_LOOKBACK} 天」的線，不一定通過最新收盤價，所以第一天可能和今天有落差。
          </p>
        </div>

        <div>
          <table className="data-table">
            <thead>
              <tr>
                <th>歷史準確度（近 {acc[0]?.samples ?? 0} 次）</th>
                {acc.map((a) => (
                  <th key={a.horizon} className="num">
                    {a.horizon === 1 ? "隔天" : `${a.horizon} 天後`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>趨勢外推 平均誤差</td>
                {acc.map((a) => (
                  <td key={a.horizon} className={`num ${a.trendMape <= a.naiveMape ? "better" : ""}`}>
                    {a.trendMape.toFixed(2)}%
                  </td>
                ))}
              </tr>
              <tr>
                <td>「明天 = 今天」平均誤差</td>
                {acc.map((a) => (
                  <td key={a.horizon} className={`num ${a.naiveMape < a.trendMape ? "better" : ""}`}>
                    {a.naiveMape.toFixed(2)}%
                  </td>
                ))}
              </tr>
              <tr>
                <td>外推誤差較小的比例</td>
                {acc.map((a) => (
                  <td key={a.horizon} className="num">
                    {a.winRate.toFixed(0)}%
                  </td>
                ))}
              </tr>
              <tr>
                <td>漲跌方向猜對</td>
                {acc.map((a) => (
                  <td key={a.horizon} className="num">
                    {Number.isFinite(a.directionHit) ? `${a.directionHit.toFixed(0)}%` : "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          {acc.length > 0 && (
            <p className="hint">
              {acc.every((a) => a.naiveMape < a.trendMape)
                ? "這檔股票過去一年，趨勢外推的誤差比「明天價格 = 今天價格」還大，"
                : "趨勢外推在部分情況誤差較小，但差距有限，"}
              代表單靠過去走勢的直線無法可靠預測股價。粗體 = 誤差較小的方法；方向猜對率 50% 左右等於丟銅板。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
