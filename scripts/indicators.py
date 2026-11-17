"""
技術指標計算模組
================
這個檔案只負責「計算」，不負責抓資料或存檔，
所以 fetch_data.py（真實資料）和 generate_sample_data.py（範例資料）都共用這裡的函式，
確保兩者算出來的格式完全一樣。

所有函式的輸入都是 pandas 的 DataFrame，欄位為：
    Open, High, Low, Close, Volume，索引（index）是日期。
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

# 要計算的均線天數
MA_WINDOWS = (10, 20, 50, 200)

# 日線輸出最近幾個交易日（約 5 年），避免 JSON 檔案太大
DAILY_KEEP_ROWS = 1260


# ---------------------------------------------------------------------------
# 單一指標
# ---------------------------------------------------------------------------

def sma(series: pd.Series, window: int) -> pd.Series:
    """簡單移動平均（Simple Moving Average）。資料不足 window 筆時為 NaN。"""
    return series.rolling(window=window, min_periods=window).mean()


def rsi_wilder(close: pd.Series, period: int = 14) -> pd.Series:
    """
    RSI，使用 Wilder 平滑法（修正 #1）。

    舊作業用的是「簡單平均」算漲跌幅，數字會和券商看盤軟體不一樣。
    Wilder 平滑法等同於 alpha = 1/period 的指數移動平均，
    這也是 TradingView、多數券商軟體使用的算法。
    """
    delta = close.diff()
    gain = delta.clip(lower=0)      # 只留上漲幅度
    loss = -delta.clip(upper=0)     # 只留下跌幅度（轉成正數）

    # adjust=False 代表用遞迴公式：今天平均 = 昨天平均 × (1 - α) + 今天值 × α
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - 100 / (1 + rs)
    # 完全沒有下跌時 avg_loss = 0，RS 為無限大，RSI 應為 100
    rsi = rsi.where(avg_loss != 0, 100.0)
    # 前面資料不足的部分維持 NaN
    rsi[avg_gain.isna()] = np.nan
    return rsi


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    """
    MACD(12, 26, 9)
      macd   = EMA12 - EMA26（快線，DIF）
      signal = macd 的 EMA9（慢線，DEA）
      hist   = macd - signal（柱狀體）
    """
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    out = pd.DataFrame({
        "macd": macd_line,
        "signal": signal_line,
        "hist": macd_line - signal_line,
    })
    # 前 slow 筆資料 EMA 還沒穩定，設為 NaN 避免畫出奇怪的線
    out.iloc[: slow - 1] = np.nan
    return out


def bollinger(close: pd.Series, window: int = 20, num_std: float = 2.0) -> pd.DataFrame:
    """
    布林通道（修正 #2，新增）
      中軌 = 20 日均線
      上軌 = 中軌 + 2 × 20 日標準差
      下軌 = 中軌 - 2 × 20 日標準差
    標準差使用母體標準差（ddof=0），和多數看盤軟體一致。
    """
    mid = close.rolling(window, min_periods=window).mean()
    std = close.rolling(window, min_periods=window).std(ddof=0)
    return pd.DataFrame({
        "bbUpper": mid + num_std * std,
        "bbMiddle": mid,
        "bbLower": mid - num_std * std,
    })


# ---------------------------------------------------------------------------
# 週線、月線
# ---------------------------------------------------------------------------

def resample_ohlcv(daily: pd.DataFrame, rule: str) -> pd.DataFrame:
    """
    把日線整理成週線（rule="W-FRI"）或月線（rule="ME"）。
      開盤 = 該期間第一天開盤
      最高 = 該期間最高
      最低 = 該期間最低
      收盤 = 該期間最後一天收盤
      成交量 = 加總
    日期標記用「該期間最後一個實際交易日」，而不是週五/月底，
    這樣遇到假日時圖上的日期才會是真的有交易的日子。
    """
    df = daily.copy()
    df["_date"] = df.index
    agg = df.resample(rule).agg({
        "Open": "first",
        "High": "max",
        "Low": "min",
        "Close": "last",
        "Volume": "sum",
        "_date": "last",
    })
    agg = agg.dropna(subset=["Close"])
    agg.index = pd.DatetimeIndex(agg["_date"])
    return agg.drop(columns="_date")


# ---------------------------------------------------------------------------
# 組合：一次算出某個週期的所有指標
# ---------------------------------------------------------------------------

def add_indicators(ohlcv: pd.DataFrame) -> pd.DataFrame:
    """在 OHLCV 表格上加上所有指標欄位，回傳新的 DataFrame。"""
    close = ohlcv["Close"]
    out = ohlcv.copy()
    for w in MA_WINDOWS:
        out[f"ma{w}"] = sma(close, w)
    out["rsi"] = rsi_wilder(close, 14)
    out = out.join(macd(close))
    out = out.join(bollinger(close))
    return out


def _clean(values, digits: int = 2) -> list:
    """把數字四捨五入到小數 2 位；NaN / 無限大轉成 None（JSON 裡的 null）。"""
    result = []
    for v in values:
        if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
            result.append(None)
        else:
            result.append(round(float(v), digits))
    return result


def frame_to_series_json(df: pd.DataFrame) -> dict:
    """
    把含指標的 DataFrame 轉成「欄位導向」的 JSON 結構：
        { "time": [...], "open": [...], "close": [...], "ma10": [...], ... }
    欄位導向比「一筆一個物件」小很多，前端也很好處理。
    """
    return {
        "time": [d.strftime("%Y-%m-%d") for d in df.index],
        "open": _clean(df["Open"]),
        "high": _clean(df["High"]),
        "low": _clean(df["Low"]),
        "close": _clean(df["Close"]),
        "volume": [int(v) if not pd.isna(v) else 0 for v in df["Volume"]],
        **{f"ma{w}": _clean(df[f"ma{w}"]) for w in MA_WINDOWS},
        "rsi": _clean(df["rsi"]),
        "macd": _clean(df["macd"], 4),     # MACD 數值常常很小，多留兩位
        "signal": _clean(df["signal"], 4),
        "hist": _clean(df["hist"], 4),
        "bbUpper": _clean(df["bbUpper"]),
        "bbMiddle": _clean(df["bbMiddle"]),
        "bbLower": _clean(df["bbLower"]),
    }


def _r(v, digits: int = 6):
    """狀態值保留 6 位小數（比畫面上的 2 位精確，盤中預估才會和收盤後的結果一致）；NaN → None"""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else round(f, digits)


def live_base(close: pd.Series, period: int = 14) -> dict:
    """
    「盤中預估」需要的計算狀態（今日總覽用）。
    網頁拿到即時價後，把它當成「下一根 K 棒的收盤」，用這些狀態直接算出新的指標，
    結果和收盤後用完整歷史重算的一模一樣，不用下載整檔 10 年資料：
      sumN       最近 N−1 根收盤的加總（N = 10/20/50/200）→ 新 MA_N = (sumN + 價格) ÷ N
      sumSq20    最近 19 根收盤的平方和 → 布林通道的標準差
      avgGain／avgLoss  Wilder RSI 的平均漲跌幅 → 新的 RSI
      ema12／ema26／signal  MACD 的指數平均 → 新的 DIF、DEA、柱狀體
    """
    c = close.dropna()
    out: dict = {"close": _r(c.iloc[-1]) if len(c) else None}
    for n in MA_WINDOWS:
        out[f"sum{n}"] = _r(c.iloc[-(n - 1):].sum()) if len(c) >= n - 1 else None
    out["sumSq20"] = _r((c.iloc[-19:] ** 2).sum()) if len(c) >= 19 else None
    delta = c.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    out["avgGain"] = _r(gain.iloc[-1]) if len(c) else None
    out["avgLoss"] = _r(loss.iloc[-1]) if len(c) else None
    ema12 = c.ewm(span=12, adjust=False).mean()
    ema26 = c.ewm(span=26, adjust=False).mean()
    sig = (ema12 - ema26).ewm(span=9, adjust=False).mean()
    enough = len(c) >= 26
    out["ema12"] = _r(ema12.iloc[-1]) if enough else None
    out["ema26"] = _r(ema26.iloc[-1]) if enough else None
    out["signal"] = _r(sig.iloc[-1]) if enough else None
    return out


def build_ticker_payload(daily: pd.DataFrame, meta: dict) -> dict:
    """
    輸入：完整的日線 OHLCV（建議 10 年，讓月線 MA 有足夠資料）
    輸出：要寫進 public/data/<代號>.json 的完整內容
    """
    daily = daily[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"]).sort_index()
    daily.index = pd.DatetimeIndex(daily.index).tz_localize(None).normalize()

    d = add_indicators(daily).tail(DAILY_KEEP_ROWS)   # 先用完整資料算，再截短，MA200 才會正確
    w = add_indicators(resample_ohlcv(daily, "W-FRI"))
    m = add_indicators(resample_ohlcv(daily, "ME"))

    last = d.iloc[-1]
    prev = d.iloc[-2] if len(d) > 1 else last
    change_pct = (last["Close"] / prev["Close"] - 1) * 100 if prev["Close"] else 0.0

    return {
        **meta,
        "lastDate": d.index[-1].strftime("%Y-%m-%d"),
        # 盤中預估用的狀態（用完整 10 年資料算，不是截斷後的）
        "liveBase": live_base(daily["Close"]),
        "lastClose": round(float(last["Close"]), 2),
        "changePct": round(float(change_pct), 2),
        "daily": frame_to_series_json(d),
        "weekly": frame_to_series_json(w),
        "monthly": frame_to_series_json(m),
    }
