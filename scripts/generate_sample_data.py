"""
產生「範例資料」（不需要網路）
==============================
用隨機漫步（幾何布朗運動）模擬股價，讓網站在還沒有真實資料時也能正常顯示。
GitHub Actions 第一次成功執行後，這些範例檔案就會被真實資料取代。

注意：這裡的價格都是亂數產生的，和真實股價無關。

執行：
  python scripts/generate_sample_data.py
"""

from __future__ import annotations

import zlib

import numpy as np
import pandas as pd

from data_io import load_watchlist, rebuild_index, ticker_path, write_json_atomic
from indicators import build_ticker_payload

YEARS = 10


def fake_ohlcv(symbol: str, end: pd.Timestamp) -> pd.DataFrame:
    # 用代號產生固定的亂數種子 → 每次執行結果一樣，方便比對
    rng = np.random.default_rng(zlib.crc32(symbol.encode()))
    dates = pd.bdate_range(end=end, periods=252 * YEARS)   # 只用平日當作交易日
    n = len(dates)

    start_price = rng.uniform(20, 400)
    drift = rng.uniform(0.02, 0.15) / 252          # 年化報酬 2%～15%
    vol = rng.uniform(0.15, 0.45) / np.sqrt(252)   # 年化波動 15%～45%
    log_ret = rng.normal(drift - vol**2 / 2, vol, n)
    close = start_price * np.exp(np.cumsum(log_ret))
    # 把整條價格等比例縮放，讓最後價格落在 50～500 之間，看起來比較像一般股票
    close = close * (rng.uniform(50, 500) / close[-1])

    # 由收盤價推出合理的開高低
    open_ = close * np.exp(rng.normal(0, vol / 2, n))
    high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, vol / 2, n)))
    low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, vol / 2, n)))
    volume = rng.integers(1_000_000, 50_000_000, n)

    return pd.DataFrame(
        {"Open": open_, "High": high, "Low": low, "Close": close, "Volume": volume},
        index=dates,
    )


def main() -> None:
    watchlist = load_watchlist()
    # 結束日設為「今天之前的最後一個平日」
    end = pd.Timestamp.today().normalize() - pd.offsets.BDay(1)
    for t in watchlist["tickers"]:
        df = fake_ohlcv(t["symbol"], end)
        payload = build_ticker_payload(df, {**t, "sample": True})
        write_json_atomic(ticker_path(t["symbol"]), payload)
        print(f"{t['symbol']}: {payload['lastDate']} 收盤 {payload['lastClose']}")
    # 範例匯率
    rebuild_index(watchlist, {"USDTWD": 32.0})
    print("範例資料產生完成")


if __name__ == "__main__":
    main()
