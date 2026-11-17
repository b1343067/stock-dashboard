"""
指標的簡單自我檢查（不需要網路）
執行：python scripts/test_indicators.py
"""

import numpy as np
import pandas as pd

from data_quality import repair_daily, to_exchange_dates, validate_daily
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

    # ---- 自動修正小問題（006208.TW 一直抓不到的原因之一）----
    glitch = good.copy()
    glitch.iloc[5, glitch.columns.get_loc("High")] = glitch["Close"].iloc[5] * 0.9   # 最高價比收盤還低
    glitch.iloc[6, glitch.columns.get_loc("Low")] = 0                                 # 最低價是 0
    glitch.iloc[7, glitch.columns.get_loc("Close")] = float("nan")                    # 收盤價空白
    last = glitch.index[-1]
    sat = last + pd.Timedelta(days=(5 - last.dayofweek) % 7 or 7)                      # 下一個週六（補班日）
    glitch.loc[sat] = glitch.iloc[-1]
    fixed, notes = repair_daily(glitch)
    assert validate_daily(fixed) == [], f"修正後應該沒有問題：{validate_daily(fixed)}"
    assert len(fixed) == len(good) - 1, "刪掉空白收盤和週六兩筆"
    assert fixed["High"].iloc[5] >= fixed["Close"].iloc[5] and fixed["Low"].iloc[6] > 0
    assert any("高低價" in n for n in notes) and any("週末" in n for n in notes)
    # 大量週末日期（時區錯開）不修，交給檢查拒絕
    shifted, notes2 = repair_daily(bad)
    assert any("週末" in p for p in validate_daily(shifted)), "大量週末日期要被拒絕"

    # ---- 基本面（加碼 B）----
    from fundamentals import clean_info, merge_fundamentals, price_stats
    fidx = pd.bdate_range("2025-01-01", "2026-11-13")
    px = pd.DataFrame({"High": 110.0, "Low": 90.0, "Close": 100.0, "Dividends": 0.0}, index=fidx)
    px.loc[fidx[10], "High"] = 999.0                       # 一年多以前的高點不算
    px.loc[fidx[-30], "High"] = 120.0
    px.loc[fidx[-60], "Dividends"] = 1.0                   # 近 12 個月配息 1 + 0.5
    px.loc[fidx[-200], "Dividends"] = 0.5
    px.loc[fidx[20], "Dividends"] = 5.0                    # 一年多以前的配息不算
    st = price_stats(px)
    assert st["high52w"] == 120.0 and st["low52w"] == 90.0, st
    assert st["dividendYield"] == 1.5 and st["dividendTtm"] == 1.5, st
    assert price_stats(px.drop(columns=["Dividends"]))["dividendYield"] is None, "沒有配息欄位 → null"
    info = clean_info({"trailingPE": 25.123, "forwardPE": -3, "priceToBook": float("nan"), "marketCap": 1.5e12, "sector": "Technology"})
    assert info["pe"] == 25.12 and info["forwardPe"] is None and info["pb"] is None and info["marketCap"] == 1_500_000_000_000
    assert clean_info(None) == {} and clean_info({"foo": 1}) == {}, "抓不到或沒有欄位 → 空"
    prev = {"pe": 30.0, "sector": "Tech", "infoDate": "2026-11-01"}
    kept = merge_fundamentals(st, {}, prev, "2026-11-14")
    assert kept["pe"] == 30.0 and kept["infoDate"] == "2026-11-01", "info 抓不到時沿用上次的值與日期"
    fresh = merge_fundamentals(st, info, prev, "2026-11-14")
    assert fresh["pe"] == 25.12 and fresh["infoDate"] == "2026-11-14" and fresh["high52w"] == 120.0
    assert merge_fundamentals(st, {}, None, "2026-11-14")["pe"] is None

    # ---- 盤中預估的狀態：用狀態＋「下一根收盤」算出的指標，要等於把那根加進去完整重算 ----
    from indicators import add_indicators, live_base
    full = pd.DataFrame({"Open": close, "High": close + 1, "Low": close - 1, "Close": close, "Volume": 1}, index=idx)
    base = live_base(full["Close"].iloc[:-1])
    nxt = float(full["Close"].iloc[-1])
    ref = add_indicators(full).iloc[-1]
    assert abs((base["sum200"] + nxt) / 200 - ref["ma200"]) < 1e-4
    assert abs((base["sum20"] + nxt) / 20 - ref["ma20"]) < 1e-4
    a = 1 / 14
    d = nxt - base["close"]
    g = (1 - a) * base["avgGain"] + a * max(d, 0)
    l = (1 - a) * base["avgLoss"] + a * max(-d, 0)
    assert abs((100 - 100 / (1 + g / l)) - ref["rsi"]) < 1e-3, "RSI 遞推"
    e12 = base["ema12"] + 2 / 13 * (nxt - base["ema12"])
    e26 = base["ema26"] + 2 / 27 * (nxt - base["ema26"])
    sig = base["signal"] + 2 / 10 * ((e12 - e26) - base["signal"])
    assert abs((e12 - e26) - ref["macd"]) < 1e-4 and abs(sig - ref["signal"]) < 1e-4, "MACD 遞推"
    mean = (base["sum20"] + nxt) / 20
    var = (base["sumSq20"] + nxt ** 2) / 20 - mean ** 2
    assert abs(mean + 2 * var ** 0.5 - ref["bbUpper"]) < 1e-3, "布林上軌"

    # ---- 盤中的半根 K 棒要丟掉；收盤後才保留 ----
    from data_quality import drop_incomplete_today, latest_is_blank
    tw = pd.DataFrame({"Close": [100.0, 101.0]}, index=pd.DatetimeIndex(["2026-11-16", "2026-11-17"]))
    during = pd.Timestamp("2026-11-17 02:14", tz="UTC")   # 台北 10:14，盤中
    after = pd.Timestamp("2026-11-17 07:00", tz="UTC")    # 台北 15:00，收盤後
    assert len(drop_incomplete_today(tw, "2330.TW", during)[0]) == 1, "台股盤中要丟掉今天"
    assert drop_incomplete_today(tw, "2330.TW", after)[1] is None, "台股收盤後保留"
    us = pd.DataFrame({"Close": [100.0]}, index=pd.DatetimeIndex(["2026-11-16"]))
    # 紐約 11/16 21:14（台北 11/17 10:14）：美股已收盤，11/16 這根要保留
    assert drop_incomplete_today(us, "VOO", during)[1] is None, "美股收盤後保留"
    assert len(drop_incomplete_today(us, "VOO", pd.Timestamp("2026-11-16 18:00", tz="UTC"))[0]) == 0, "美股盤中丟掉"
    assert latest_is_blank(pd.DataFrame({"Close": [1.0, float("nan")]})) and not latest_is_blank(us)

    # ---- Yahoo 漏掉最新一天時，用 Finnhub 報價補上 ----
    from data_quality import expected_latest_us_day, fill_latest_from_quote
    q = {"c": 110.0, "o": 100.0, "h": 112.0, "l": 99.0, "t": int(pd.Timestamp("2026-11-16 21:00", tz="UTC").timestamp())}  # 紐約 11/16 16:00
    base = pd.DataFrame({"Open": [1.0, 1.0], "High": [2.0, 2.0], "Low": [0.5, 0.5], "Close": [1.5, float("nan")], "Volume": [10.0, float("nan")]},
                        index=pd.DatetimeIndex(["2026-11-13", "2026-11-16"]))
    filled, note = fill_latest_from_quote(base, q)
    assert filled["Close"].iloc[-1] == 110.0 and filled["Volume"].iloc[-1] == 0 and len(filled) == 2 and "Finnhub" in note, "收盤價空白 → 用 Finnhub 補"
    missing = base.iloc[:1]
    appended, _ = fill_latest_from_quote(missing, q)
    assert len(appended) == 2 and str(appended.index[-1].date()) == "2026-11-16", "整筆不見 → 補一筆"
    complete = base.copy(); complete.iloc[-1, complete.columns.get_loc("Close")] = 1.6
    assert fill_latest_from_quote(complete, q)[1] is None, "資料完整時不動"
    assert fill_latest_from_quote(missing, {"c": 0, "o": 0, "h": 0, "l": 0, "t": 0})[1] is None, "報價無效時不動"
    assert str(expected_latest_us_day(pd.Timestamp("2026-11-17 02:00", tz="UTC")).date()) == "2026-11-16", "紐約週一晚上 → 週一"
    assert str(expected_latest_us_day(pd.Timestamp("2026-11-16 15:00", tz="UTC")).date()) == "2026-11-13", "紐約週一盤中 → 上週五"
    assert str(expected_latest_us_day(pd.Timestamp("2026-11-15 15:00", tz="UTC")).date()) == "2026-11-13", "週日 → 週五"

    # ---- 英文名稱（加碼 C-2）：設定檔的 nameEn 會保留，沒填就沒有這個欄位 ----
    from data_io import normalize_watchlist
    wl = normalize_watchlist({"groups": [{"name": "台股", "tickers": [
        {"symbol": "0050.TW", "name": "元大台灣50", "nameEn": " Yuanta Taiwan 50 "},
        {"symbol": "VOO", "name": "Vanguard S&P 500 ETF"},
    ]}]})
    assert wl["tickers"][0]["nameEn"] == "Yuanta Taiwan 50"
    assert "nameEn" not in wl["tickers"][1]

    print(f"全部通過（RSI 與參考實作最大差異 {diff:.6f}）")


if __name__ == "__main__":
    main()
