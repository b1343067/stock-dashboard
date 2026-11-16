// 看盤頁的「基本面」卡片：52 週區間（含目前位置）、殖利率、本益比、股價淨值比、市值
// 數字來自資料檔的 fundamentals 欄位（scripts/fundamentals.py）；計算與文字在 src/lib/fundamentals.ts。

import { fmtBigMoney, pctFrom, peComment, rangePosition } from "../lib/fundamentals";
import { fmtFixed } from "../lib/format";
import type { Fundamentals } from "../lib/types";

interface Props {
  data: Fundamentals | undefined;
  close: number;
  currency: string;
  sample: boolean;
}

export default function FundamentalsCard({ data, close, currency, sample }: Props) {
  if (!data) {
    // 舊資料檔還沒有基本面（下次每日更新後就會有）
    return (
      <div className="card fund-card">
        <h3 className="section-title">基本面</h3>
        <p className="muted small">這檔股票還沒有基本面資料，下次每日更新後就會出現。</p>
      </div>
    );
  }
  const pos = rangePosition(close, data.low52w, data.high52w);
  const fromHigh = pctFrom(close, data.high52w);
  const fromLow = pctFrom(close, data.low52w);
  const isEtf = data.quoteType === "ETF";
  const f2 = (v: number | null) => (v === null ? "—" : fmtFixed(v, 2));

  return (
    <div className="card fund-card">
      <h3 className="section-title">
        基本面
        {data.sector && !isEtf && <span className="badge fund-sector">{data.sector}</span>}
        {isEtf && <span className="badge fund-sector">ETF</span>}
      </h3>

      {/* 52 週區間：一條橫桿，圓點是現在的位置 */}
      <div className="fund-range" aria-label="52 週區間">
        <div className="fund-range-labels num">
          <span>
            52 週低 <b>{f2(data.low52w)}</b>
          </span>
          <span>
            52 週高 <b>{f2(data.high52w)}</b>
          </span>
        </div>
        <div className="fund-bar">
          {pos !== null && <i className="fund-dot" style={{ left: `${pos * 100}%` }} title={`目前 ${fmtFixed(close, 2)}`} />}
        </div>
        <div className="fund-range-labels muted small num">
          <span>{fromLow === null ? "" : `高於低點 ${fromLow.toFixed(1)}%`}</span>
          <span>{fromHigh === null ? "" : `距高點 ${fromHigh.toFixed(1)}%`}</span>
        </div>
      </div>

      <dl className="fund-grid">
        <div>
          <dt>殖利率（近 12 個月）</dt>
          <dd className="num">{data.dividendYield === null ? "—" : `${data.dividendYield.toFixed(2)}%`}</dd>
          <dd className="muted small">
            {data.dividendTtm ? `每股配息 ${fmtFixed(data.dividendTtm, 2)} ${currency}` : "近一年沒有配息"}
          </dd>
        </div>
        <div>
          <dt>本益比</dt>
          <dd className="num">{f2(data.pe)}</dd>
          <dd className="muted small">{peComment(data.pe)}</dd>
        </div>
        <div>
          <dt>預估本益比</dt>
          <dd className="num">{f2(data.forwardPe)}</dd>
          <dd className="muted small">用分析師預估的明年獲利算</dd>
        </div>
        <div>
          <dt>股價淨值比</dt>
          <dd className="num">{f2(data.pb)}</dd>
          <dd className="muted small">股價是每股淨值的幾倍</dd>
        </div>
        <div>
          <dt>市值</dt>
          <dd className="num">{fmtBigMoney(data.marketCap)}</dd>
          <dd className="muted small">{data.marketCap ? currency : isEtf ? "ETF 不適用" : ""}</dd>
        </div>
      </dl>
      <p className="hint">
        {sample ? "範例資料：數字是隨機產生的。" : ""}
        52 週高低與殖利率每天從價格計算（價格已含除權息調整）；本益比、市值來自 Yahoo Finance
        {data.infoDate ? `，資料日期 ${data.infoDate}` : "，目前抓不到"}。
      </p>
    </div>
  );
}
