// 篩選器頁最下方：「這些訊號過去準不準？」（訊號回測，lib/signalStats.ts）
// 預設收起來，展開時才下載 signal-stats.json（不影響篩選器的載入速度）。
// 每條規則顯示：過去出現幾次、之後 5 天／20 天的平均報酬與上漲機率，和「平常任何一天」比較，
// 結論文字由數字產生（verdictText），沒有參考價值就照實寫。

import { useState } from "react";
import { loadSignalStats } from "../../lib/data";
import { fmtPct, pnlClass } from "../../lib/format";
import { t } from "../../lib/i18n";
import { MIN_EVENTS, statVerdict, verdictText, type HorizonStat, type RuleStat, type SignalStatsFile } from "../../lib/signalStats";

const GROUPS: { key: RuleStat["group"]; label: string }[] = [
  { key: "danger", label: "危險訊號（Discord 通知）" },
  { key: "bullish", label: "偏多訊號（Discord 通知）" },
  { key: "preset", label: "篩選器範例組合" },
];

function Cell({ label, h, redUp }: { label: string; h: HorizonStat; redUp: boolean }) {
  return (
    <span className="sst-cell">
      <span className="muted small">{t(label)}</span>
      <b className={`num ${pnlClass(h.avg, redUp)}`}>{fmtPct(h.avg, 2, true)}</b>
      <span className="muted small num">{t("上漲 {0}", [fmtPct(h.win, 0)])}</span>
    </span>
  );
}

export default function SignalStatsCard({ redUp }: { redUp: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "none">("idle");
  const [data, setData] = useState<SignalStatsFile | null>(null);

  const onToggle = (open: boolean) => {
    if (!open || state !== "idle") return;
    setState("loading");
    void loadSignalStats().then((d) => {
      setData(d);
      setState(d ? "ok" : "none");
    });
  };

  return (
    <details className="card sst" onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="sst-summary">
        <span className="section-title">{t("📊 這些訊號過去準不準？")}</span>
        <span className="muted small">{t("用過去 5 年的資料重播每條規則")}</span>
      </summary>
      {state === "loading" && <p className="muted empty">{t("載入中…")}</p>}
      {state === "none" && <p className="muted empty">{t("目前沒有回測結果（資料更新後會產生）。")}</p>}
      {data && (
        <>
          <div className="sst-row sst-base">
            <span className="sst-name">
              <b>{t("平常（任何一天）")}</b>
              <span className="muted small">{t("比較的基準：同一批股票、同一段期間")}</span>
            </span>
            <Cell label="5 天後" h={data.baseline.h5} redUp={redUp} />
            <Cell label="20 天後" h={data.baseline.h20} redUp={redUp} />
          </div>
          {GROUPS.map((g) => {
            const rows = data.rules.filter((r) => r.group === g.key);
            if (rows.length === 0) return null;
            return (
              <section key={g.key} className="sst-group">
                <h4 className="sst-group-title">{t(g.label)}</h4>
                {rows.map((r) => {
                  const v = statVerdict(r, data.baseline);
                  return (
                    <div key={r.name} className="sst-row">
                      <span className="sst-name">
                        <b>{t(r.name)}</b>
                        <span className="muted small">{t("出現 {0} 次（{1} 檔）", [r.events, r.symbols])}</span>
                        <span className={`sst-verdict sst-${v}`}>{t(verdictText(r, v))}</span>
                      </span>
                      <Cell label="5 天後" h={r.h5} redUp={redUp} />
                      <Cell label="20 天後" h={r.h20} redUp={redUp} />
                    </div>
                  );
                })}
              </section>
            );
          })}
          <p className="hint">
            {t(
              "回測期間 {0} ～ {1}、{2} 檔股票。只算訊號「第一天出現」，並從隔天收盤價開始算（通知是隔天早上才送出）。和平常的 20 天平均報酬差 1 個百分點以上才算有差別；少於 {3} 次不下結論。",
              [data.from ?? "—", data.to ?? "—", data.tickers, MIN_EVENTS],
            )}
          </p>
          <p className="hint">
            {t("限制：觀察清單是現在挑的股票（整體偏強），所以要和「平常」比；大盤急跌時很多檔同一天出現訊號，彼此不是獨立的樣本。過去的統計不代表未來，也不是買賣建議。")}
            {data.skipped.length > 0 && " " + t("週線、月線、基本面條件無法回測，略過：{0}。", [data.skipped.map((s) => t(s)).join("、")])}
          </p>
        </>
      )}
    </details>
  );
}
