// 今日總覽最上面的「市場狀態」：美股、台股大盤現在處於哪一種狀態（ML 實驗室 ③ 的結果）
// 這是描述現況（近 20 天的趨勢、波動、離高點多遠），不是預測。

import { useEffect, useState } from "react";
import { loadMlVol } from "../lib/data";
import { t } from "../lib/i18n";
import { REGIME_COLOR, type MlVolData } from "../lib/ml";
import { LAB_HREF } from "../lib/route";

export default function RegimeBar() {
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
  const markets = Object.values(data?.regime ?? {});
  if (markets.length === 0) return null;
  return (
    <a className="regime-bar card" href={`${LAB_HREF}`} aria-label={t("市場狀態（看說明）")}>
      <span className="regime-title">{t("市場狀態")}</span>
      {markets.map((m) => (
        <span key={m.label} className="regime-chip">
          <span className="muted small">{t(m.label)}</span>
          <i className="regime-dot" style={{ background: `var(${REGIME_COLOR[m.key]})` }} aria-hidden="true" />
          <b>{t(m.name)}</b>
          <span className="muted small">{t("第 {0} 天", [m.days])}</span>
        </span>
      ))}
      <span className="regime-go" aria-hidden="true">›</span>
    </a>
  );
}
