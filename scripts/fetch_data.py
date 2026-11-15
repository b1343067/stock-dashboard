"""
每日資料更新腳本（由 GitHub Actions 執行）
=========================================
流程：
  1. 讀取 config/watchlist.json 的觀察清單
  2. 逐檔用 yfinance 抓 10 年日線
  3. 計算指標（日／週／月線），寫成 public/data/<代號>.json
  4. 抓 USD/TWD 匯率
  5. 重建 public/data/index.json

安全機制：
  - 某一檔抓不到或資料異常 → 不覆蓋，保留前一天的檔案
  - 匯率抓不到 → 沿用前一次的匯率
  - 全部都失敗 → 結束碼 1（Actions 會顯示紅色失敗通知你），但不會動到任何檔案

本機執行：
  pip install -r scripts/requirements.txt
  python scripts/fetch_data.py
"""

from __future__ import annotations

import sys
import time

import pandas as pd
import yfinance as yf

from data_io import load_watchlist, rebuild_index, ticker_path, write_json_atomic
from indicators import build_ticker_payload

HISTORY_PERIOD = "10y"   # 抓 10 年，月線的均線才算得出來
MIN_ROWS = 60            # 少於這個筆數視為資料異常
RETRIES = 3              # 每檔最多重試次數


def download_daily(symbol: str) -> pd.DataFrame | None:
    """抓單一股票的日線，失敗會重試，最後還是失敗就回傳 None。"""
    for attempt in range(1, RETRIES + 1):
        try:
            # auto_adjust=True：價格已含除權息調整，K 線和指標才會連續
            df = yf.Ticker(symbol).history(period=HISTORY_PERIOD, interval="1d", auto_adjust=True)
            if df is not None and len(df) >= MIN_ROWS and df["Close"].notna().sum() >= MIN_ROWS:
                return df
            print(f"  [{symbol}] 第 {attempt} 次：資料筆數不足（{0 if df is None else len(df)} 筆）")
        except Exception as e:  # yfinance 的錯誤種類很多，這裡統一處理
            print(f"  [{symbol}] 第 {attempt} 次失敗：{e}")
        time.sleep(2 * attempt)
    return None


def fetch_fx(fx_config: dict) -> dict:
    """抓匯率，例如 {"USDTWD": 32.45}。抓不到的就不放，rebuild_index 會沿用舊值。"""
    result = {}
    for name, yahoo_symbol in fx_config.items():
        try:
            df = yf.Ticker(yahoo_symbol).history(period="5d", interval="1d")
            close = df["Close"].dropna()
            if len(close) > 0:
                result[name] = round(float(close.iloc[-1]), 4)
        except Exception as e:
            print(f"  匯率 {name} 抓取失敗：{e}")
    return result


def main() -> int:
    watchlist = load_watchlist()
    ok, failed = [], []

    for t in watchlist["tickers"]:
        symbol = t["symbol"]
        print(f"抓取 {symbol} ...")
        df = download_daily(symbol)
        if df is None:
            failed.append(symbol)
            print(f"  [{symbol}] 放棄，保留前一天的檔案")
            continue
        try:
            payload = build_ticker_payload(df, {**t, "sample": False})
            write_json_atomic(ticker_path(symbol), payload)
            ok.append(symbol)
            print(f"  [{symbol}] 完成，最後日期 {payload['lastDate']} 收盤 {payload['lastClose']}")
        except Exception as e:
            failed.append(symbol)
            print(f"  [{symbol}] 計算指標失敗：{e}，保留前一天的檔案")

    fx = fetch_fx(watchlist.get("fx", {}))
    print(f"匯率：{fx or '抓取失敗，沿用舊值'}")

    if not ok:
        print("所有股票都抓取失敗，不更新任何檔案。")
        return 1

    rebuild_index(watchlist, fx)
    print(f"\n成功 {len(ok)} 檔，失敗 {len(failed)} 檔：{failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
