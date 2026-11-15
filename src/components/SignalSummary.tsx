// 指標摘要：用文字說明目前（最新一根 K 棒）的指標狀態。
// 這裡的判斷邏輯之後第二階段的「指標篩選器」也會用到。

import { lastValid } from "../lib/data";
import type { SeriesData, Timeframe } from "../lib/types";

interface Props {
  data: SeriesData;
  timeframe: Timeframe;
  currency: string;
  /** 紅漲綠跌設定：偏多用「漲」的顏色、偏空用「跌」的顏色 */
  redUp: boolean;
}

type Tone = "pos" | "neg" | "neutral";

interface Item {
  label: string;
  value: string;
  note: string;
  tone: Tone;
}

const TF_NAME: Record<Timeframe, string> = { daily: "日線", weekly: "週線", monthly: "月線" };

export default function SignalSummary({ data, timeframe, currency, redUp }: Props) {
  const n = data.close.length;
  const close = data.close[n - 1];
  const items: Item[] = [];

  // RSI
  const rsi = lastValid(data.rsi);
  if (rsi !== null) {
    items.push({
      label: "RSI(14)",
      value: rsi.toFixed(1),
      note: rsi >= 70 ? "超買區（≥70）" : rsi <= 30 ? "超賣區（≤30）" : "中性區間",
      tone: rsi >= 70 ? "neg" : rsi <= 30 ? "pos" : "neutral",
    });
  }

  // MACD：快線在慢線之上 = 偏多；柱狀體和前一根比是放大還縮小
  const m = data.macd[n - 1];
  const s = data.signal[n - 1];
  const h = data.hist[n - 1];
  const hPrev = data.hist[n - 2];
  if (m !== null && s !== null && h !== null) {
    const trend = hPrev === null ? "" : Math.abs(h) < Math.abs(hPrev) ? "，柱狀體縮短" : "，柱狀體放大";
    items.push({
      label: "MACD",
      value: h.toFixed(3),
      note: (m > s ? "DIF 在 DEA 之上（偏多）" : "DIF 在 DEA 之下（偏空）") + trend,
      tone: m > s ? "pos" : "neg",
    });
  }

  // 布林通道：%B = (收盤 - 下軌) / (上軌 - 下軌)，0 = 下軌、1 = 上軌
  const u = data.bbUpper[n - 1];
  const l = data.bbLower[n - 1];
  if (u !== null && l !== null && u > l) {
    const pctB = (close - l) / (u - l);
    items.push({
      label: "布林 %B",
      value: (pctB * 100).toFixed(0) + "%",
      note: close > u ? "突破上軌" : close < l ? "跌破下軌" : pctB >= 0.5 ? "位於中軌之上" : "位於中軌之下",
      tone: close > u ? "neg" : close < l ? "pos" : "neutral",
    });
  }

  // 均線：股價站上或跌破
  for (const k of ["ma20", "ma50", "ma200"] as const) {
    const v = data[k][n - 1];
    if (v === null) continue;
    const diff = (close / v - 1) * 100;
    items.push({
      label: k.toUpperCase(),
      value: v.toFixed(2),
      note: `${diff >= 0 ? "站上" : "跌破"}（${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%）`,
      tone: diff >= 0 ? "pos" : "neg",
    });
  }

  return (
    <div className="card">
      <h3 className="section-title">
        指標摘要 <span className="muted">· {TF_NAME[timeframe]} · {data.time[n - 1]} · 收盤 {close.toFixed(2)} {currency}</span>
      </h3>
      <div className="signal-grid">
        {items.map((it) => (
          <div key={it.label} className={`signal ${toneClass(it.tone, redUp)}`}>
            <div className="signal-label">{it.label}</div>
            <div className="signal-value">{it.value}</div>
            <div className="signal-note">{it.note}</div>
          </div>
        ))}
      </div>
      <p className="hint">「偏多／偏空」只是描述指標狀態，不代表買賣建議。</p>
    </div>
  );
}

/** 偏多 → 漲的顏色；偏空 → 跌的顏色（跟著紅漲綠跌設定） */
function toneClass(tone: Tone, redUp: boolean): string {
  if (tone === "neutral") return "tone-neutral";
  const bullish = tone === "pos";
  return bullish === redUp ? "tone-red" : "tone-green";
}
