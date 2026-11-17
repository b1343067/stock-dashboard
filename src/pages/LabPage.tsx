// 🧪 ML 實驗室（#/lab）：兩個機器學習實驗的方法、結果與結論
//   ① 波動度預測（實用：預測未來 5 天的波動幅度）
//   ② 漲跌方向實驗（誠實：大多贏不了「永遠猜漲」）
// 資料：public/data/ml.json（scripts/ml_lab.py 每天用滾動式驗證重新計算）。結論文字由數字產生（src/lib/ml.ts）。

import { useEffect, useMemo, useState } from "react";
import LabLineChart, { type LabLine } from "../components/lab/LabLineChart";
import RegimeChart from "../components/lab/RegimeChart";
import { loadMl } from "../lib/data";
import { t } from "../lib/i18n";
import { REGIME_COLOR, dirConclusion, fmtP, volConclusion, type MlData } from "../lib/ml";
import { MARKET_HREF, chartHref } from "../lib/route";

// 圖表數值格式（放在模組層級：同一個函式，圖表才不會每次重畫都重建）
const fmtVol = (v: number) => `${v.toFixed(1)}%`;
const fmtRet = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export default function LabPage() {
  const [data, setData] = useState<MlData | null | undefined>(undefined);
  const [example, setExample] = useState<string>("VOO");
  const [regimeMarket, setRegimeMarket] = useState<string>("VOO");

  useEffect(() => {
    let cancelled = false;
    void loadMl().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const volLines = useMemo<LabLine[]>(() => {
    const ex = data?.vol.examples[example];
    if (!data || !ex) return [];
    const best = data.vol.models.find((m) => m.key === data.vol.best);
    return [
      { name: t("實際波動"), slot: "s1", time: ex.time, values: ex.actual },
      { name: t("基準：過去 20 天"), slot: "s2", time: ex.time, values: ex.naive, dashed: true },
      { name: t(best?.name ?? "模型"), slot: "s3", time: ex.time, values: ex.best },
    ];
  }, [data, example]);

  const dirLines = useMemo<LabLine[]>(() => {
    if (!data) return [];
    const c = data.direction.curves;
    const slots: LabLine["slot"][] = ["s2", "s3", "s4"];
    return [
      { name: t("買進持有"), slot: "s1", time: c.time, values: c.buyHold },
      ...data.direction.models
        .filter((m) => m.key !== "up" && Array.isArray(c[m.key]))
        .map((m, i) => ({ name: t(m.name), slot: slots[i % 3], time: c.time, values: c[m.key] as number[] })),
    ];
  }, [data]);

  if (data === undefined) return <div className="card"><p className="muted">{t("載入中…")}</p></div>;
  if (data === null) {
    return (
      <div className="card">
        <h2>{t("🧪 ML 實驗室")}</h2>
        <p className="muted">{t("還沒有 ML 實驗結果（每天早上資料更新時才會計算）。")}</p>
      </div>
    );
  }

  const vc = volConclusion(data.vol);
  const dc = dirConclusion(data.direction);
  const tickers = Object.entries(data.vol.tickers).sort((a, b) => (b[1].improvement ?? -999) - (a[1].improvement ?? -999));

  return (
    <div className="lab">
      <div className="market-head">
        <div>
          <a className="back-link" href={MARKET_HREF}>{t("← 市場總覽")}</a>
          <h2>{t("🧪 ML 實驗室")}</h2>
          <p className="muted small">
            {t("{0} 檔股票、{1} 個樣本；訓練從 {2} 開始，測試期 {3} ～ {4}（只用過去的資料預測未來）。每天早上重新計算。", [
              data.symbols,
              data.samples.toLocaleString(),
              data.trainStart,
              data.testStart,
              data.testEnd,
            ])}
          </p>
        </div>
      </div>

      {/* 方法 */}
      <section className="card" aria-labelledby="lab-method">
        <h3 id="lab-method" className="section-title">{t("怎麼驗證：滾動式驗證（walk-forward）")}</h3>
        <div className="wf" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="wf-row">
              <span className="wf-train" style={{ width: `${45 + i * 12}%` }}>{t("訓練")}</span>
              <span className="wf-gap">{t("空 5 天")}</span>
              <span className="wf-test">{t("測試 1 個月")}</span>
            </div>
          ))}
        </div>
        <ul className="lab-points">
          <li>{t("每個月重新訓練一次，只用「當時已經知道答案」的資料，預測下一個月；一路往前滾，最後把所有測試結果合起來評分。")}</li>
          <li>{t("訓練和測試之間空出 5 天：預測的是未來 5 天，不空開的話，訓練資料的答案會和測試期重疊，結果會假準。")}</li>
          <li>{t("特徵只用當天收盤以前的資料；自動測試會竄改未來的價格，確認今天的特徵完全不變。")}</li>
          <li>{t("台股用美股大盤的資料時只用前一天的（台股收盤時，同一天的美股還沒開盤）。")}</li>
        </ul>
      </section>

      {/* ① 波動 */}
      <section className="card" aria-labelledby="lab-vol">
        <h3 id="lab-vol" className="section-title">{t("① 波動度預測：未來 {0} 個交易日的波動有多大", [data.horizon])}</h3>
        <p className="lab-verdict good">✅ {t(vc.key, vc.args)}</p>
        <div className="table-scroll">
          <table className="data-table lab-table">
            <thead>
              <tr>
                <th>{t("方法")}</th>
                <th className="num">{t("QLIKE（越小越好）")}</th>
                <th className="num">{t("平均誤差（年化波動）")}</th>
                <th className="num">{t("比基準好")}</th>
              </tr>
            </thead>
            <tbody>
              {data.vol.models.map((m) => (
                <tr key={m.key} className={m.key === data.vol.best ? "best" : ""}>
                  <td>{t(m.name)}{m.key === data.vol.best && <span className="best-tag">{t("最佳")}</span>}</td>
                  <td className="num">{m.qlike.toFixed(4)}</td>
                  <td className="num">{t("{0} 個百分點", [m.mae.toFixed(2)])}</td>
                  <td className="num">{m.key === "naive" ? "—" : `${m.improvement > 0 ? "+" : ""}${m.improvement}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lab-chart-head">
          <h4 className="sub-title">{t("預測 vs 實際（年化波動）")}</h4>
          <div className="segmented" role="radiogroup" aria-label={t("選擇股票")}>
            {Object.keys(data.vol.examples).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={example === s} className={example === s ? "active" : ""} onClick={() => setExample(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
        {volLines.length > 0 && <LabLineChart lines={volLines} format={fmtVol} label={t("預測 vs 實際（年化波動）")} />}

        <h4 className="sub-title">{t("每檔股票：模型比基準好多少")}</h4>
        <ul className="lab-tickers">
          {tickers.map(([s, v]) => (
            <li key={s} className={v.model === "naive" ? "fallback" : ""}>
              <a href={chartHref(s)}>{s}</a>
              <span className={`num ${(v.improvement ?? 0) >= 0 ? "pos" : "neg"}`}>{v.improvement === null ? "—" : `${v.improvement > 0 ? "+" : ""}${v.improvement}%`}</span>
            </li>
          ))}
        </ul>
        <p className="hint">
          {t("49 檔合在一起訓練，大部分股票模型比較準；少數幾乎不波動或很特別的股票（例如短期國庫券 ETF）模型反而比較差，這些股票在看盤頁會改顯示基準的預測（灰色）。")}{" "}
          {t("用途：停損距離如果比「未來 5 天常見的波動範圍」還窄，很容易被正常波動洗出場。")}
        </p>
      </section>

      {/* ② 方向 */}
      <section className="card" aria-labelledby="lab-dir">
        <h3 id="lab-dir" className="section-title">{t("② 漲跌方向實驗：{0} 個交易日後會漲還是跌", [data.horizon])}</h3>
        <p className={`lab-verdict ${dc.beat ? "good" : "bad"}`}>{dc.beat ? "✅" : "❌"} {t(dc.key, dc.args)}</p>
        <div className="table-scroll">
          <table className="data-table lab-table">
            <thead>
              <tr>
                <th>{t("方法")}</th>
                <th className="num">{t("準確率")}</th>
                <th className="num">{t("比永遠猜漲")}</th>
                <th className="num">AUC</th>
                <th className="num">{t("p 值")}</th>
                <th className="num">{t("策略年化報酬")}</th>
                <th className="num">{t("夏普值")}</th>
              </tr>
            </thead>
            <tbody>
              {data.direction.models.map((m) => (
                <tr key={m.key}>
                  <td>{t(m.name)}</td>
                  <td className="num">{m.accuracy}%</td>
                  <td className={`num ${m.vsUp > 0 ? "pos" : m.vsUp < 0 ? "neg" : ""}`}>{m.key === "up" ? "—" : `${m.vsUp > 0 ? "+" : ""}${m.vsUp}`}</td>
                  <td className="num">{m.auc.toFixed(3)}</td>
                  <td className="num">{fmtP(m.pValue)}</td>
                  <td className="num">{m.key === "up" ? fmtRet(data.direction.buyHold.annual ?? 0) : m.strategy?.annual === null || !m.strategy ? "—" : fmtRet(m.strategy.annual)}</td>
                  <td className="num">{(m.key === "up" ? data.direction.buyHold.sharpe : m.strategy?.sharpe)?.toFixed(2) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          {t("「永遠猜漲」的策略就是買進持有。其他策略：每 5 天只持有模型預測會漲的股票，扣 {0}% 交易成本。AUC 0.5 = 和亂猜一樣；p 值 < 0.05 才算有證據比永遠猜漲好。", [(data.cost * 100).toFixed(1)])}
        </p>

        <h4 className="sub-title">{t("策略累積報酬（測試期）")}</h4>
        <LabLineChart lines={dirLines} format={fmtRet} zeroLine label={t("策略累積報酬（測試期）")} />

        <h4 className="sub-title">{t("每年的準確率")}</h4>
        <div className="table-scroll">
          <table className="data-table lab-table">
            <thead>
              <tr>
                <th>{t("年份")}</th>
                {data.direction.models.map((m) => (
                  <th key={m.key} className="num">{t(m.name)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.direction.byYear.map((y) => (
                <tr key={y.year}>
                  <td>{y.year}</td>
                  {data.direction.models.map((m) => (
                    <td key={m.key} className="num">{y[m.key]}%</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ③ 市場狀態 */}
      {data.regime && Object.keys(data.regime).length > 0 && (() => {
        const markets = data.regime;
        const key = markets[regimeMarket] ? regimeMarket : Object.keys(markets)[0];
        const m = markets[key];
        return (
          <section className="card" aria-labelledby="lab-regime" id="regime">
            <div className="lab-chart-head">
              <h3 id="lab-regime" className="section-title">{t("③ 市場狀態分群：現在的市場是什麼樣子")}</h3>
              <div className="segmented" role="radiogroup" aria-label={t("選擇市場")}>
                {Object.entries(markets).map(([s, mk]) => (
                  <button key={s} type="button" role="radio" aria-checked={key === s} className={key === s ? "active" : ""} onClick={() => setRegimeMarket(s)}>
                    {t(mk.label)}
                  </button>
                ))}
              </div>
            </div>
            <div className="regime-now">
              <i className="regime-dot big" style={{ background: `var(${REGIME_COLOR[m.current.key]})` }} aria-hidden="true" />
              <div>
                <div className="regime-now-name">{t(m.current.name)}</div>
                <div className="muted small">
                  {t("從 {0} 開始，第 {1} 個交易日（資料日期 {2}）", [m.current.since, m.current.days, m.current.date])}
                </div>
              </div>
              <dl className="vol-facts regime-facts">
                <div><dt>{t("近 20 天報酬")}</dt><dd className="num">{fmtRet(m.current.ret20)}</dd></div>
                <div><dt>{t("近 20 天年化波動")}</dt><dd className="num">{m.current.vol20}%</dd></div>
                <div><dt>{t("距離一年高點")}</dt><dd className="num">{m.current.dd}%</dd></div>
              </dl>
            </div>
            <RegimeChart market={m} />
            <div className="table-scroll">
              <table className="data-table lab-table">
                <thead>
                  <tr>
                    <th>{t("狀態")}</th>
                    <th className="num">{t("佔的時間")}</th>
                    <th className="num">{t("近 20 天報酬")}</th>
                    <th className="num">{t("年化波動")}</th>
                    <th className="num">{t("距離高點")}</th>
                    <th className="num">{t("平均持續")}</th>
                    <th className="num">{t("之後 20 天平均報酬")}</th>
                    <th className="num">{t("之後 20 天上漲機率")}</th>
                  </tr>
                </thead>
                <tbody>
                  {m.states.map((st) => (
                    <tr key={st.key} className={st.key === m.current.key ? "best" : ""}>
                      <td>
                        <i className="swatch" style={{ background: `var(${REGIME_COLOR[st.key]})` }} /> {t(st.name)}
                        {st.key === m.current.key && <span className="best-tag">{t("現在")}</span>}
                      </td>
                      <td className="num">{st.share}%</td>
                      <td className="num">{fmtRet(st.ret20)}</td>
                      <td className="num">{st.vol20}%</td>
                      <td className="num">{st.dd}%</td>
                      <td className="num">{st.avgDays === null ? "—" : t("{0} 天", [st.avgDays])}</td>
                      <td className="num">{st.fwdRet === null ? "—" : fmtRet(st.fwdRet)}</td>
                      <td className="num">{st.fwdUp === null ? "—" : `${st.fwdUp}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">
              {t("用 K-means 把每一天依「近 20 天報酬、近 20 天波動、距離一年高點」分成 4 群，名稱依各群的特性自動命名。這是描述現況，不是預測；「之後 20 天」是歷史上的平均，樣本不多（約 5 年），不代表這次一定會一樣。")}
            </p>
          </section>
        );
      })()}

      <section className="card" aria-labelledby="lab-why">
        <h3 id="lab-why" className="section-title">{t("為什麼波動預測得到，漲跌方向卻預測不了？")}</h3>
        <ul className="lab-points">
          <li>{t("波動有「群聚」現象：大波動之後常跟著大波動、平靜之後常跟著平靜，這個規律很穩定，所以預測得到。")}</li>
          <li>{t("方向不一樣：如果過去的價格能預測漲跌，交易者會馬上利用它，規律很快就被交易掉了，剩下的接近隨機。")}</li>
          <li>{t("「永遠猜漲」看起來很準，是因為這段期間是多頭（大部分時候在漲），不是因為它聰明；換到空頭時期就會失準。")}</li>
          <li>{t("所以網站的「短期趨勢外推」只當作示範：它在這裡就是一個輸給基準的對照組。")}</li>
        </ul>
        <p className="hint">{t("本頁是學習用的實驗，不是投資建議。模型和結果每天會隨新資料改變。")}</p>
      </section>
    </div>
  );
}
