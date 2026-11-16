// 「現在的狀態」：用白話卡片描述最新一根 K 棒的指標（RSI、均線、MACD、布林）
// 判斷邏輯在 src/lib/signals.ts，這裡只負責顯示。

import { computeStatus, type Tone } from "../lib/signals";
import type { SeriesData, Timeframe } from "../lib/types";

interface Props {
  data: SeriesData;
  timeframe: Timeframe;
  /** 紅漲綠跌設定：偏多用「漲」的顏色、偏空用「跌」的顏色 */
  redUp: boolean;
}

const TF_NAME: Record<Timeframe, string> = { daily: "日線", weekly: "週線", monthly: "月線" };

function toneClass(tone: Tone, redUp: boolean): string {
  if (tone === "neutral") return "tone-neutral";
  return (tone === "bull") === redUp ? "tone-red" : "tone-green";
}

export default function StatusCards({ data, timeframe, redUp }: Props) {
  const items = computeStatus(data);
  if (items.length === 0) return null;
  const date = data.time[data.time.length - 1];
  // RSI 量表兩端的顏色：超賣區（跌深）、超買區（漲多）
  const lowZone = redUp ? "var(--green-soft)" : "var(--red-soft)";
  const highZone = redUp ? "var(--red-soft)" : "var(--green-soft)";

  return (
    <section aria-labelledby="status-title">
      <h3 className="block-title" id="status-title">
        現在的狀態 <small>{TF_NAME[timeframe]} · {date} 收盤</small>
      </h3>
      <div className="status-grid">
        {items.map((it) => (
          <div key={it.key} className="card status-card">
            <div className="status-head">
              <span>{it.title}</span>
              <span className={`status-tag ${toneClass(it.tone, redUp)}`}>{it.tag}</span>
            </div>
            <div className={`status-value num ${it.key === "ma" ? toneClass(it.tone, redUp) + "-text" : ""}`}>{it.value}</div>
            {it.gauge !== null ? (
              <>
                <div className="gauge" role="img" aria-label={`${it.title} 位置 ${it.gauge.toFixed(0)}`}>
                  {it.key === "rsi" && (
                    <>
                      <span className="gauge-zone" style={{ left: 0, width: "30%", background: lowZone }} />
                      <span className="gauge-zone" style={{ left: "70%", width: "30%", background: highZone }} />
                    </>
                  )}
                  <span className="gauge-pin" style={{ left: `${it.gauge}%` }} />
                </div>
                <div className="gauge-scale">
                  {it.key === "rsi" ? (
                    <>
                      <span>0</span>
                      <span>30</span>
                      <span>70</span>
                      <span>100</span>
                    </>
                  ) : (
                    <>
                      <span>下軌</span>
                      <span>中軌</span>
                      <span>上軌</span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="status-note">{it.note}</div>
            )}
          </div>
        ))}
      </div>
      <p className="hint">「偏多／偏空」「超買／超賣」只是描述指標狀態，不是買賣建議。</p>
    </section>
  );
}
