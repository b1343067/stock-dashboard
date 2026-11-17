"""
ML 實驗室（純函式，測試在 test_ml.py；執行入口是 ml_lab.py）
================================================================
兩個實驗，都用「滾動式驗證」（walk-forward）：
  ① 波動度預測：預測未來 5 個交易日的波動（實用：停損要設多寬）
  ② 漲跌方向實驗：預測 5 天後是漲是跌（誠實呈現：通常贏不了「永遠猜漲」）

避免「偷看未來」的三個原則（面試最常被問的就是這個）：
  1. 特徵只用「當天收盤以前」的資料（rolling、shift 都只往過去看；test_ml.py 會竄改未來價格驗證）
  2. 訓練資料的「答案結束日」必須早於測試區間的第一天（purge）：
     第 t 天的答案用到 t+1～t+5 天的價格，如果直接把測試前一天的樣本放進訓練，答案就和測試期重疊了
  3. 台股用美股大盤（VOO）的特徵時，只能用「前一天」的：台股收盤時，同一個日期的美股還沒開盤

模型都是 scikit-learn 的標準模型；資料是 49 檔股票合併在一起訓練（每檔資料只有 5 年，合併才夠多）。
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

HORIZON = 5            # 預測未來幾個交易日
TRADING_DAYS = 252
MIN_TRAIN_DATES = 378  # 前 1.5 年只拿來訓練，之後才開始測試
REFIT_EVERY = 21       # 每 21 個交易日（約一個月）重新訓練一次
COST = 0.001           # 策略回測：每期投入部位扣 0.1% 交易成本
MARKET = "VOO"

# 方向實驗的特徵（全部都是「比例」或「標準化」過的數字，不同價位的股票可以放在一起訓練）
DIR_FEATURES = [
    "ret1", "ret5", "ret20", "rsi", "macd_n", "dist20", "dist50", "dist200",
    "rv5", "rv22", "park5", "logvol", "mkt_ret5", "mkt_rv22",
]
# 波動實驗的特徵
VOL_FEATURES = ["l_abs", "l_rv5", "l_rv22", "l_rv66", "l_park5", "ret5", "ret20", "rsi", "dist50", "logvol", "l_mkt_rv5", "l_mkt_rv22"]


def _log(x: pd.Series) -> pd.Series:
    """波動常常接近 0，取 log 前先墊一個很小的下限，避免 −∞"""
    return np.log(x.clip(lower=1e-4))


def features(df: pd.DataFrame) -> pd.DataFrame:
    """
    單一股票的特徵（第 t 列只用到第 t 天以前的資料）。
    df：欄位 Open/High/Low/Close/Volume，索引是交易日。
    """
    c = df["Close"]
    r = np.log(c).diff()
    out = pd.DataFrame(index=df.index)
    out["ret1"] = r
    out["ret5"] = np.log(c / c.shift(5))
    out["ret20"] = np.log(c / c.shift(20))
    r2 = r**2
    out["abs"] = r.abs()
    out["rv5"] = np.sqrt(r2.rolling(5).mean())      # 用「均方根」：和預測目標的算法一致
    out["rv20"] = np.sqrt(r2.rolling(20).mean())
    out["rv22"] = np.sqrt(r2.rolling(22).mean())
    out["rv66"] = np.sqrt(r2.rolling(66).mean())
    # EWMA（RiskMetrics λ = 0.94）：業界風控常用的基準
    out["ewma"] = np.sqrt(r2.ewm(alpha=0.06, adjust=False).mean())
    # Parkinson 波動：用每天的最高、最低價估計，比只用收盤價更有效率
    hl = np.log(df["High"] / df["Low"]).clip(lower=0)
    out["park5"] = np.sqrt((hl**2 / (4 * math.log(2))).rolling(5).mean())
    # 技術指標（和網站一樣的 Wilder RSI）
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    out["rsi"] = (100 - 100 / (1 + up / dn)).where(dn != 0, 100.0) / 100
    macd = c.ewm(span=12, adjust=False).mean() - c.ewm(span=26, adjust=False).mean()
    out["macd_n"] = (macd - macd.ewm(span=9, adjust=False).mean()) / c
    for n in (20, 50, 200):
        out[f"dist{n}"] = c / c.rolling(n).mean() - 1
    # 成交量比：今天 ÷ 最近 20 天平均。Yahoo 偶爾某天成交量是 0（資料缺漏）：
    # 那天記為 0（= 和平常一樣），平均跳過缺漏的那天，不讓一天的缺漏拖累之後 20 天
    vol = df["Volume"].replace(0, np.nan)
    out["logvol"] = np.log(vol / vol.rolling(20, min_periods=10).mean()).fillna(0.0)
    # 短期趨勢外推（網站現在的方法）：最近 20 天收盤的回歸斜率，當作方向實驗的對照組
    x = np.arange(20) - 9.5
    out["trend"] = c.rolling(20).apply(lambda y: float(np.dot(x, y - y.mean()) / np.dot(x, x)), raw=True) / c
    for k in ("abs", "rv5", "rv22", "rv66", "park5"):
        out[f"l_{k}"] = _log(out[k])
    return out


def targets(df: pd.DataFrame) -> pd.DataFrame:
    """
    答案（只有這裡會用到「未來」的資料）：
      y_vol    未來 5 天日報酬的均方根（每日波動）
      y_up     5 天後收盤是否高於今天
      fwd_ret  未來 5 天的報酬（策略回測用）
      t_end    答案用到的最後一天（purge 用：訓練樣本的 t_end 必須早於測試期）
    """
    c = df["Close"]
    r2 = np.log(c).diff() ** 2
    fut = pd.concat([r2.shift(-k) for k in range(1, HORIZON + 1)], axis=1)
    out = pd.DataFrame(index=df.index)
    out["y_vol"] = np.sqrt(fut.mean(axis=1, skipna=False))
    future = c.shift(-HORIZON)
    out["fwd_ret"] = future / c - 1
    out["y_up"] = (future > c).astype(float).where(future.notna())
    idx = pd.Series(df.index, index=df.index)
    out["t_end"] = idx.shift(-HORIZON)
    return out


def market_features(frames: dict[str, pd.DataFrame], market: str = MARKET) -> pd.DataFrame | None:
    if market not in frames:
        return None
    f = features(frames[market])
    return pd.DataFrame({"mkt_ret5": f["ret5"], "mkt_rv5": f["rv5"], "mkt_rv22": f["rv22"]})


def attach_market(feat: pd.DataFrame, mkt: pd.DataFrame | None, is_us: bool) -> pd.DataFrame:
    """
    把大盤特徵接到個股上。美股用同一天的；台股只能用「前一天以前」的美股資料
    （台北 11/17 收盤時，紐約 11/17 還沒開盤，用了就是偷看未來）。
    """
    out = feat.copy()
    if mkt is None:
        for k in ("mkt_ret5", "mkt_rv5", "mkt_rv22"):
            out[k] = np.nan
    else:
        lookup = out.index if is_us else out.index - pd.Timedelta(days=1)
        m = mkt.sort_index().reindex(lookup, method="ffill")
        m.index = out.index
        out = out.join(m)
    out["l_mkt_rv5"] = _log(out["mkt_rv5"])
    out["l_mkt_rv22"] = _log(out["mkt_rv22"])
    return out


def build_samples(frames: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """49 檔合併成一張樣本表（每列 = 某檔某天），丟掉特徵還不完整的前幾個月"""
    mkt = market_features(frames)
    parts = []
    for sym, df in frames.items():
        is_us = not sym.upper().endswith((".TW", ".TWO"))
        f = attach_market(features(df), mkt, is_us)
        t = targets(df)
        s = f.join(t)
        s["sym"] = sym
        s["date"] = s.index
        parts.append(s)
    if not parts:
        return pd.DataFrame()
    allx = pd.concat(parts, ignore_index=True)
    need = list(set(DIR_FEATURES + VOL_FEATURES + ["rv20", "ewma", "trend"]))
    allx = allx.dropna(subset=need)
    return allx.sort_values(["date", "sym"]).reset_index(drop=True)


def walk_forward_blocks(dates: pd.Series, min_train: int = MIN_TRAIN_DATES, step: int = REFIT_EVERY) -> list[tuple[pd.Timestamp, pd.Timestamp | None]]:
    """把測試期切成一段一段（每段 step 個交易日），回傳 [(開始日, 結束日或 None)]"""
    u = sorted(pd.unique(dates))
    out = []
    for i in range(min_train, len(u), step):
        end = u[i + step] if i + step < len(u) else None
        out.append((pd.Timestamp(u[i]), None if end is None else pd.Timestamp(end)))
    return out


def train_mask(samples: pd.DataFrame, start: pd.Timestamp) -> pd.Series:
    """訓練樣本：答案結束日（t_end）早於測試期第一天，而且答案存在"""
    return samples["t_end"].notna() & (samples["t_end"] < start) & samples["y_vol"].notna()


# ---------------------------------------------------------------------------
# 評分
# ---------------------------------------------------------------------------

def qlike(y: np.ndarray, yhat: np.ndarray) -> float:
    """
    QLIKE：波動預測的標準評分（越小越好；預測太低的懲罰比太高重，符合風控的需要）
      QLIKE = 平均( y²/ŷ² − ln(y²/ŷ²) − 1 )，完全準確時 = 0
    """
    ratio = np.clip(y, 1e-6, None) ** 2 / np.clip(yhat, 1e-6, None) ** 2
    return float(np.mean(ratio - np.log(ratio) - 1))


def mae_ann_pct(y: np.ndarray, yhat: np.ndarray) -> float:
    """平均絕對誤差，換成「年化波動 %」比較直覺（例如 3.2 = 平均差 3.2 個百分點）"""
    return float(np.mean(np.abs(y - yhat)) * math.sqrt(TRADING_DAYS) * 100)


def paired_t_pvalue(diffs: np.ndarray) -> float:
    """
    單尾 t 檢定的 p 值：diffs 的平均是否 > 0。
    用「每 5 天取一次、每天先把 49 檔平均」的 diffs：樣本之間的重疊（5 天報酬）和同一天股票互相連動
    都會讓檢定看起來太顯著，這樣做比較保守、比較誠實。
    """
    from scipy import stats

    d = np.asarray(diffs, dtype=float)
    d = d[np.isfinite(d)]
    if len(d) < 3 or np.std(d, ddof=1) == 0:
        return 1.0
    t = np.mean(d) / (np.std(d, ddof=1) / math.sqrt(len(d)))
    return float(stats.t.sf(t, df=len(d) - 1))


# ---------------------------------------------------------------------------
# ① 波動度預測
# ---------------------------------------------------------------------------

VOL_MODELS = {
    "naive": "基準：過去 20 天的波動",
    "ewma": "基準：EWMA（λ = 0.94）",
    "har": "HAR 模型（線性迴歸）",
    "gbm": "梯度提升樹（ML）",
}
HAR_FEATURES = ["l_abs", "l_rv5", "l_rv22"]


def _fit_log_model(model, X: np.ndarray, y: np.ndarray):
    """
    在 log(波動) 上訓練，再換回波動。log 讓誤差比較對稱，但換回來會系統性偏低，
    所以用訓練資料估一個修正倍數 c（讓預測的平方平均 = 實際的平方平均）。
    """
    ly = np.log(np.clip(y, 1e-4, None))
    model.fit(X, ly)
    p = np.exp(model.predict(X))
    c = math.sqrt(float(np.mean(y**2) / np.mean(p**2)))
    return model, c


def _vol_models():
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.linear_model import LinearRegression

    return {
        "har": (LinearRegression(), HAR_FEATURES),
        "gbm": (HistGradientBoostingRegressor(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=200, random_state=0), VOL_FEATURES),
    }


def run_vol(samples: pd.DataFrame, blocks=None) -> pd.DataFrame:
    """滾動式驗證：每一段只用「答案已經揭曉」的過去樣本訓練，預測這一段。回傳測試期每個樣本的各模型預測"""
    blocks = blocks if blocks is not None else walk_forward_blocks(samples["date"])
    out = []
    for start, end in blocks:
        test = samples[(samples["date"] >= start) & ((samples["date"] < end) if end is not None else True) & samples["y_vol"].notna()]
        if test.empty:
            continue
        train = samples[train_mask(samples, start)]
        pred = test[["sym", "date", "y_vol"]].copy()
        pred["naive"] = test["rv20"].to_numpy()
        pred["ewma"] = test["ewma"].to_numpy()
        for key, (model, cols) in _vol_models().items():
            m, c = _fit_log_model(model, train[cols].to_numpy(), train["y_vol"].to_numpy())
            pred[key] = np.exp(m.predict(test[cols].to_numpy())) * c
        out.append(pred)
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def vol_summary(pred: pd.DataFrame) -> dict:
    y = pred["y_vol"].to_numpy()
    base = qlike(y, pred["naive"].to_numpy())
    models = []
    for key, name in VOL_MODELS.items():
        q = qlike(y, pred[key].to_numpy())
        models.append({"key": key, "name": name, "qlike": round(q, 4), "mae": round(mae_ann_pct(y, pred[key].to_numpy()), 2), "improvement": round((1 - q / base) * 100, 1)})
    best = min(models, key=lambda m: m["qlike"])["key"]
    return {"models": models, "best": best}


def current_vol(samples: pd.DataFrame, best: str, per_ticker: dict | None = None) -> dict:
    """
    每檔股票「現在」的波動預測：用所有答案已揭曉的資料訓練最佳模型，預測每檔最新一天。
    同時給「這個預測在這檔股票近一年是高還是低」（百分位），以及 5 天的常見漲跌範圍（±1 個標準差）。
    per_ticker：每檔在測試期「最佳模型比基準好多少」。某檔是負的（模型反而比較差，例如幾乎不波動的
    短期國庫券 ETF），那檔就改用基準的預測，並在 model 欄位註明，網頁會照實顯示。
    """
    last_date = samples["date"].max()
    latest = samples.sort_values("date").groupby("sym").tail(1)
    if best in ("naive", "ewma"):
        pred = latest["rv20" if best == "naive" else "ewma"].to_numpy()
    else:
        model, cols = _vol_models()[best]
        train = samples[train_mask(samples, last_date + pd.Timedelta(days=1))]
        m, c = _fit_log_model(model, train[cols].to_numpy(), train["y_vol"].to_numpy())
        pred = np.exp(m.predict(latest[cols].to_numpy())) * c
    out = {}
    per_ticker = per_ticker or {}
    for (_, row), p in zip(latest.iterrows(), pred):
        used = best
        imp = per_ticker.get(row["sym"])
        if imp is not None and imp < 0:
            p, used = row["rv20"], "naive"
        hist = samples[(samples["sym"] == row["sym"]) & (samples["date"] > row["date"] - pd.Timedelta(days=365))]["rv20"].to_numpy()
        pct = float(np.mean(hist <= p) * 100) if len(hist) else None
        out[row["sym"]] = {
            "date": row["date"].strftime("%Y-%m-%d"),
            "predAnn": round(float(p) * math.sqrt(TRADING_DAYS) * 100, 1),
            "range5": round(float(p) * math.sqrt(HORIZON) * 100, 2),
            "naiveAnn": round(float(row["rv20"]) * math.sqrt(TRADING_DAYS) * 100, 1),
            "pctile": None if pct is None else round(pct),
            "model": used,
            "improvement": imp,
        }
    return out


def per_ticker_improvement(pred: pd.DataFrame, best: str) -> dict:
    """每檔：最佳模型的 QLIKE 比基準少了幾 %（讓使用者知道這檔的預測該信幾分）"""
    out = {}
    for sym, g in pred.groupby("sym"):
        y = g["y_vol"].to_numpy()
        base = qlike(y, g["naive"].to_numpy())
        out[sym] = round((1 - qlike(y, g[best].to_numpy()) / base) * 100, 1) if base > 0 else None
    return out


# ---------------------------------------------------------------------------
# ② 漲跌方向實驗
# ---------------------------------------------------------------------------

DIR_MODELS = {
    "up": "基準：永遠猜漲",
    "trend": "基準：趨勢外推（網站原本的方法）",
    "logit": "邏輯迴歸",
    "gbm": "梯度提升樹（ML）",
}


def _dir_models():
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    return {
        "logit": make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=1000)),
        "gbm": HistGradientBoostingClassifier(max_iter=150, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=300, random_state=0),
    }


def run_direction(samples: pd.DataFrame, blocks=None) -> pd.DataFrame:
    """滾動式驗證；每個模型輸出「上漲機率」（score）與預測（>0.5 = 漲）"""
    blocks = blocks if blocks is not None else walk_forward_blocks(samples["date"])
    out = []
    for start, end in blocks:
        test = samples[(samples["date"] >= start) & ((samples["date"] < end) if end is not None else True) & samples["y_up"].notna()]
        if test.empty:
            continue
        train = samples[train_mask(samples, start) & samples["y_up"].notna()]
        pred = test[["sym", "date", "y_up", "fwd_ret"]].copy()
        pred["s_up"] = float(train["y_up"].mean())  # 永遠猜漲：機率 = 訓練期的上漲比例（AUC 會是 0.5）
        pred["s_trend"] = test["trend"].to_numpy()  # 斜率 > 0 就猜漲
        for key, model in _dir_models().items():
            model.fit(train[DIR_FEATURES].to_numpy(), train["y_up"].to_numpy().astype(int))
            pred[f"s_{key}"] = model.predict_proba(test[DIR_FEATURES].to_numpy())[:, 1]
        pred["p_up"] = 1.0
        pred["p_trend"] = (pred["s_trend"] > 0).astype(float)
        pred["p_logit"] = (pred["s_logit"] > 0.5).astype(float)
        pred["p_gbm"] = (pred["s_gbm"] > 0.5).astype(float)
        out.append(pred)
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def direction_summary(pred: pd.DataFrame) -> dict:
    """
    準確率、AUC、和「永遠猜漲」比的 t 檢定、策略回測（每 5 天換一次、不重疊）。
    """
    from sklearn.metrics import roc_auc_score

    y = pred["y_up"].to_numpy()
    base_rate = float(np.mean(y))
    dates = sorted(pd.unique(pred["date"]))
    every5 = set(dates[::HORIZON])  # 不重疊的期數（每期 5 天）
    p5 = pred[pred["date"].isin(every5)]
    correct_up = (p5["y_up"] == 1).astype(float)

    # 買進持有：每期平均持有全部股票
    bh = p5.groupby("date")["fwd_ret"].mean()
    models = []
    curves = {"time": [pd.Timestamp(d).strftime("%Y-%m-%d") for d in bh.index], "buyHold": _cum(bh)}
    for key, name in DIR_MODELS.items():
        acc = float(np.mean(pred[f"p_{key}"].to_numpy() == y))
        score = pred[f"s_{key}"].to_numpy()
        # 永遠猜漲沒有排序能力，AUC 定義上就是 0.5（各段的機率值不同，直接算會得到沒有意義的數字）
        auc = 0.5 if key == "up" or np.allclose(score, score[0]) else float(roc_auc_score(y, score))
        diffs = ((p5[f"p_{key}"] == p5["y_up"]).astype(float) - correct_up).groupby(p5["date"]).mean().to_numpy()
        entry = {"key": key, "name": name, "accuracy": round(acc * 100, 1), "auc": round(auc, 3), "vsUp": round((acc - base_rate) * 100, 1)}
        if key != "up":
            entry["pValue"] = round(paired_t_pvalue(diffs), 3)
            # 策略：只持有預測會漲的股票（等權重），扣交易成本；預測都不漲就空手
            held = p5[p5[f"p_{key}"] == 1]
            per = held.groupby("date")["fwd_ret"].mean().reindex(bh.index).fillna(0.0)
            share = (p5[f"p_{key}"] == 1).groupby(p5["date"]).mean().reindex(bh.index).fillna(0.0)
            per = per - COST * share
            entry["strategy"] = _stats(per)
            curves[key] = _cum(per)
        models.append(entry)
    years = []
    for yr, g in pred.groupby(pred["date"].dt.year):
        years.append({"year": int(yr), "baseRate": round(float(g["y_up"].mean()) * 100, 1), **{k: round(float(np.mean(g[f"p_{k}"] == g["y_up"])) * 100, 1) for k in DIR_MODELS}})
    return {"baseRate": round(base_rate * 100, 1), "models": models, "buyHold": _stats(bh), "curves": curves, "byYear": years, "periods": len(bh)}


def _cum(per: pd.Series) -> list[float]:
    return [round(float(v) * 100, 2) for v in (np.cumprod(1 + per.to_numpy()) - 1)]


def _stats(per: pd.Series) -> dict:
    """總報酬 %、年化報酬 %、夏普值（每期 5 天，一年約 50 期）"""
    a = per.to_numpy()
    if len(a) == 0:
        return {"total": None, "annual": None, "sharpe": None}
    total = float(np.prod(1 + a) - 1)
    years = len(a) * HORIZON / TRADING_DAYS
    sd = float(np.std(a, ddof=1)) if len(a) > 1 else 0.0
    return {
        "total": round(total * 100, 1),
        "annual": round(((1 + total) ** (1 / years) - 1) * 100, 1) if years > 0 and total > -1 else None,
        "sharpe": round(float(np.mean(a)) / sd * math.sqrt(TRADING_DAYS / HORIZON), 2) if sd > 0 else None,
    }
