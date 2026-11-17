// 看盤頁「未來 5 天波動預測」卡片（ML 實驗室 ① 的結果，資料在 public/data/ml.json）
// 用途：停損要設多寬。預測只描述「波動幅度」，不預測方向。

import { useEffect, useState } from "react";
import { loadMlVol } from "../lib/data";
import { t } from "../lib/i18n";
import { pctileLabel, type MlVolData } from "../lib/ml";
import { LAB_HREF } from "../lib/route";

export default function VolForecastCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<MlVolData | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMlVol().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const v = data?.tickers[symbol];
  if (!data || !v) return null; // 沒有 ML 結果（例如範例資料）就不顯示這張卡
  const model = data.models.find((m) => m.key === v.model);
  const level = pctileLabel(v.pctile);
  return (
    <section className="card vol-card" aria-labelledby="vol-card-title">
      <div className="vol-head">
        <h3 id="vol-card-title" className="section-title">{t("未來 {0} 天波動預測", [data.horizon])}</h3>
        <a className="small" href={LAB_HREF}>{t("看方法與驗證 →")}</a>
      </div>
      <div className="vol-body">
        <div>
          <div className="vol-range num">±{v.range5.toFixed(2)}%</div>
          <div className="muted small">{t("未來 {0} 個交易日常見的漲跌範圍（約 68% 的機率落在這裡面）", [data.horizon])}</div>
        </div>
        <dl className="vol-facts">
          <div>
            <dt>{t("預測年化波動")}</dt>
            <dd className="num">{v.predAnn}%</dd>
          </div>
          <div>
            <dt>{t("和這檔近一年比")}</dt>
            <dd className={`vol-level lvl-${v.pctile !== null && v.pctile >= 60 ? "hi" : v.pctile !== null && v.pctile <= 40 ? "lo" : "mid"}`}>
              {t(level)}
              {v.pctile !== null && <small className="muted"> {t("（第 {0} 百分位）", [v.pctile])}</small>}
            </dd>
          </div>
          <div>
            <dt>{t("模型")}</dt>
            <dd>{t(model?.name ?? v.model)}</dd>
          </div>
        </dl>
      </div>
      <p className="hint">
        {v.model === "naive"
          ? t("這檔股票的模型在測試期輸給基準（{0}%），所以顯示基準：過去 20 天的波動。", [v.improvement ?? "—"])
          : t("這檔股票在測試期，模型的預測誤差比基準少 {0}%。", [v.improvement ?? "—"])}{" "}
        {t("只預測波動大小、不預測方向。停損距離比這個範圍還窄，容易被正常波動洗出場。資料日期 {0}。", [v.date])}
      </p>
    </section>
  );
}
