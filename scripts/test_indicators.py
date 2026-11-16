"""
指標的簡單自我檢查（不需要網路）
執行：python scripts/test_indicators.py
"""

import numpy as np
import pandas as pd

from data_quality import to_exchange_dates, validate_daily
from indicators import bollinger, macd, resample_ohlcv, rsi_wilder


def rsi_reference(close: list[float], period: int = 14) -> list[float]:
    """用最原始的 Wilder 公式（迴圈）算 RSI，拿來比對 pandas 版本。"""
    gains = [max(close[i] - close[i - 1], 0) for i in range(1, len(close))]
    losses = [max(close[i - 1] - close[i], 0) for i in range(1, len(close))]
    out = [np.nan] * len(close)
    # Wilder 原版：第一個平均用前 14 天的簡單平均
    # pandas ewm(adjust=False) 則是從第一筆開始遞迴，前期會有些微差異，
    # 但經過約 100 筆後兩者幾乎相同，所以只比對後段。
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_g = (avg_g * (period - 1) + gains[i]) / period
        avg_l = (avg_l * (period - 1) + losses[i]) / period
        out[i + 1] = 100 - 100 / (1 + avg_g / avg_l) if avg_l else 100.0
    return out


def main() -> None:
    rng = np.random.default_rng(0)
    idx = pd.bdate_range("2020-01-01", periods=500)
    close = pd.Series(100 * np.exp(np.cumsum(rng.normal(0, 0.02, 500))), index=idx)

    ours = rsi_wilder(close).to_numpy()
    ref = np.array(rsi_reference(close.tolist()))
    diff = np.nanmax(np.abs(ours[200:] - ref[200:]))
    assert diff < 0.01, f"RSI 差異過大：{diff}"
    assert np.isnan(ours[:13]).all(), "前 13 筆 RSI 應為空值"

    bb = bollinger(close)
    last = close.iloc[-20:]
    assert abs(bb["bbMiddle"].iloc[-1] - last.mean()) < 1e-9
    assert abs(bb["bbUpper"].iloc[-1] - (last.mean() + 2 * last.std(ddof=0))) < 1e-9

    m = macd(close)
    assert abs(m["hist"].iloc[-1] - (m["macd"].iloc[-1] - m["signal"].iloc[-1])) < 1e-12

    df = pd.DataFrame({"Open": close, "High": close + 1, "Low": close - 1, "Close": close, "Volume": 1}, index=idx)
    wk = resample_ohlcv(df, "W-FRI")
    assert wk["Close"].iloc[-1] == close.iloc[-1], "週線最後收盤應等於日線最後收盤"
    assert wk.index[-1] == idx[-1], "週線日期應為最後實際交易日"
    assert wk["Volume"].sum() == 500

    # ---- 日期與時區（避免台股、美股差一天）----
    # 台股：台北 2026-11-13（週五）00:00 = UTC 2026-11-12 16:00
    tw_utc = pd.DataFrame({"Close": [100.0]}, index=pd.DatetimeIndex(["2026-11-12 16:00"], tz="UTC"))
    assert str(to_exchange_dates(tw_utc, "0050.TW").index[0].date()) == "2026-11-13", "UTC 時間要換成台北日期"
    tw_local = pd.DataFrame({"Close": [100.0]}, index=pd.DatetimeIndex(["2026-11-13"], tz="Asia/Taipei"))
    assert str(to_exchange_dates(tw_local, "0050.TW").index[0].date()) == "2026-11-13"
    # 美股：紐約 2026-11-13 00:00 = UTC 2026-11-13 05:00
    us_utc = pd.DataFrame({"Close": [100.0]}, index=pd.DatetimeIndex(["2026-11-13 05:00"], tz="UTC"))
    assert str(to_exchange_dates(us_utc, "BRK-B").index[0].date()) == "2026-11-13", "代號含 - 也要正確"

    # ---- 資料檢查 ----
    good = pd.DataFrame({"Open": close, "High": close + 1, "Low": close - 1, "Close": close}, index=idx)
    assert validate_daily(good) == []
    bad = good.copy()
    bad.index = bad.index + pd.Timedelta(days=1)  # 週五 → 週六
    assert any("週末" in p for p in validate_daily(bad)), "錯開一天要被抓到"
    dup = pd.concat([good, good.iloc[[-1]]])
    assert any("重複" in p for p in validate_daily(dup))
    wrong = good.copy()
    wrong.iloc[10, wrong.columns.get_loc("Close")] = wrong["High"].iloc[10] * 2
    assert any("高低" in p for p in validate_daily(wrong))

    print(f"全部通過（RSI 與參考實作最大差異 {diff:.6f}）")


if __name__ == "__main__":
    main()
