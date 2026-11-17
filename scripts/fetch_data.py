"""
每日資料更新腳本（由 GitHub Actions 執行）
=========================================
流程：
  1. 讀取 config/watchlist.json 的觀察清單（依分類分組）
  2. 分批（每批 BATCH_SIZE 檔）用 yfinance 抓 10 年日線，批次之間稍微休息，避免被 Yahoo 限流
  3. 計算指標（日／週／月線），寫成 public/data/<代號>.json
  4. 抓 USD/TWD 匯率（最新值 + 歷史，歷史寫進 public/data/fx.json）與無風險利率
  5. 基本面：52 週高低、殖利率從日線算；本益比等從 Ticker.info 讀（抓不到沿用上次）
  6. 重建 public/data/index.json、screener.json

安全機制：
  - 每檔失敗會自動重試（間隔越來越長）；全部跑完後，下載失敗的再統一重試一輪
  - 某一檔抓不到或資料異常 → 不覆蓋，保留前一天的檔案；任何一檔出錯都不會中斷整個更新
  - 匯率抓不到 → 沿用前一次的匯率
  - 全部都失敗 → 結束碼 1（Actions 會顯示紅色失敗通知你），但不會動到任何檔案

本機執行：
  pip install -r scripts/requirements.txt
  python scripts/fetch_data.py
"""

from __future__ import annotations

import os
import sys
import time

import json
import urllib.parse
import urllib.request

import pandas as pd
import yfinance as yf

from data_io import FX_PATH, STATUS_PATH, load_watchlist, read_json, rebuild_index, ticker_path, write_json_atomic
from data_quality import (
    drop_incomplete_today,
    exchange_tz,
    expected_latest_us_day,
    fill_latest_from_quote,
    latest_is_blank,
    repair_daily,
    to_exchange_dates,
    validate_daily,
    TZ_NEW_YORK,
)
from fundamentals import clean_info, merge_fundamentals, price_stats
from indicators import build_ticker_payload

HISTORY_PERIOD = "10y"   # 抓 10 年，月線的均線才算得出來
MIN_ROWS = 60            # 少於這個筆數視為資料異常
RETRIES = 3              # 每檔最多重試次數
BATCH_SIZE = 10          # 每批幾檔
BATCH_PAUSE = 3          # 批次之間休息幾秒
FINAL_RETRY_PAUSE = 30   # 第二輪重試前休息幾秒（Yahoo 暫時限流時通常等一下就好）
# 測試時可設 FETCH_SLEEP_SCALE=0 跳過所有等待
SLEEP_SCALE = float(os.environ.get("FETCH_SLEEP_SCALE", "1"))


def pause(seconds: float) -> None:
    time.sleep(seconds * SLEEP_SCALE)


def download_daily(symbol: str) -> pd.DataFrame | None:
    """抓單一股票的日線，失敗會重試，最後還是失敗就回傳 None。"""
    for attempt in range(1, RETRIES + 1):
        try:
            # auto_adjust=True：價格已含除權息調整，K 線和指標才會連續
            df = yf.Ticker(symbol).history(period=HISTORY_PERIOD, interval="1d", auto_adjust=True)
            if df is not None and len(df) >= MIN_ROWS and df["Close"].notna().sum() >= MIN_ROWS:
                # 明確換成「交易所當地日期」，避免時區造成台股、美股差一天
                return to_exchange_dates(df, symbol)
            print(f"  [{symbol}] 第 {attempt} 次：資料筆數不足（{0 if df is None else len(df)} 筆）")
        except Exception as e:  # yfinance 的錯誤種類很多，這裡統一處理
            print(f"  [{symbol}] 第 {attempt} 次失敗：{e}")
        pause(2 ** attempt)  # 2、4、8 秒：越等越久，給伺服器喘息時間
    return None


def fetch_fx(fx_config: dict) -> tuple[dict, dict]:
    """
    抓匯率。回傳 (最新匯率, 歷史匯率)：
      最新：{"USDTWD": 32.45}，抓不到的就不放，rebuild_index 會沿用舊值
      歷史：{"USDTWD": {"time": [...], "close": [...]}}，第四階段把台股報酬換成美元時用
    """
    latest, history = {}, {}
    for name, yahoo_symbol in fx_config.items():
        try:
            df = yf.Ticker(yahoo_symbol).history(period="10y", interval="1d")
            close = df["Close"].dropna()
            if len(close) > 0:
                latest[name] = round(float(close.iloc[-1]), 4)
                # 匯率以台北日期為準（和台股對齊）
                close = to_exchange_dates(close.to_frame(), "TWD.TW")["Close"]
                history[name] = {
                    "time": [d.strftime("%Y-%m-%d") for d in close.index],
                    "close": [round(float(v), 4) for v in close],
                }
        except Exception as e:
            print(f"  匯率 {name} 抓取失敗：{e}")
    return latest, history


def fetch_risk_free(symbol: str | None) -> float | None:
    """
    無風險利率：用美國 13 週國庫券殖利率（^IRX），報價單位是「年化 %」，例如 4.25。
    回傳小數（0.0425）；抓不到回傳 None，沿用上一次的值。
    """
    if not symbol:
        return None
    try:
        close = yf.Ticker(symbol).history(period="1mo", interval="1d")["Close"].dropna()
        if len(close) > 0:
            v = float(close.iloc[-1]) / 100
            if 0 <= v < 0.25:   # 合理範圍檢查
                return round(v, 5)
    except Exception as e:
        print(f"  無風險利率抓取失敗：{e}")
    return None


def fetch_info(symbol: str) -> dict:
    """
    讀 Ticker.info（本益比、市值等）。只試一次：這些數字一天變化不大，
    抓不到就沿用上一次的值，不值得為它多等、增加被限流的機會。
    設 FETCH_INFO=0 可以整個跳過（例如 Yahoo 限流嚴重時）。
    """
    if os.environ.get("FETCH_INFO", "1") == "0":
        return {}
    try:
        return clean_info(yf.Ticker(symbol).info)
    except Exception as e:
        print(f"  [{symbol}] 基本面讀取失敗（沿用上次）：{e}")
        return {}


def finnhub_quote(symbol: str) -> dict | None:
    """
    Yahoo 漏掉美股最新一天時的備援：Finnhub 報價（GitHub Secrets 的 FINNHUB_API_KEY）。
    沒有金鑰或失敗就回傳 None（不影響原本的流程）。金鑰放標頭、不放網址，錯誤訊息也不會印出金鑰。
    免費額度每分鐘 60 次，每次呼叫後休息 1.1 秒。
    """
    key = os.environ.get("FINNHUB_API_KEY", "").strip()
    if not key:
        return None
    req = urllib.request.Request(
        f"https://finnhub.io/api/v1/quote?symbol={urllib.parse.quote(symbol)}",
        headers={"X-Finnhub-Token": key},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as e:  # 網路、額度、格式錯誤都一樣：放棄備援
        print(f"  [{symbol}] Finnhub 備援失敗：{type(e).__name__}")
        return None
    finally:
        pause(1.1)


def needs_backfill(df: pd.DataFrame, symbol: str) -> bool:
    """美股、而且最新一天的收盤價空白或整筆缺漏 → 需要用 Finnhub 補"""
    if exchange_tz(symbol) != TZ_NEW_YORK or df.empty:
        return False
    valid = df["Close"].dropna()
    if valid.empty:
        return False
    return latest_is_blank(df) or pd.Timestamp(valid.index[-1]) < expected_latest_us_day()


# 每檔的更新結果（最後寫進 public/data/status.json，不用登入 GitHub 也能看到哪檔失敗、為什麼）
STATUS: dict[str, dict] = {}


def process_symbol(t: dict) -> str:
    """
    抓一檔、修正小問題、檢查、計算、寫檔。回傳結果：
      "ok"        成功
      "download"  下載失敗（之後會再重試一輪）
      "invalid"   資料有嚴重問題或計算失敗（不重試，保留舊檔）
    任何錯誤都在這裡處理掉，不會往外丟，確保單檔失敗不會中斷整個更新。
    """
    symbol = t["symbol"]
    try:
        df = download_daily(symbol)
        if df is None:
            print(f"  [{symbol}] 下載失敗，保留前一天的檔案")
            STATUS[symbol] = {"result": "download", "reason": f"下載失敗（已重試 {RETRIES} 次）"}
            return "download"
        # 盤中執行（例如推程式碼觸發）時，丟掉今天還沒收盤的半根 K 棒
        df, partial = drop_incomplete_today(df, symbol)
        # Yahoo 漏掉美股最新一天 → 用 Finnhub 的收盤價補上（有設定金鑰才會做）
        backfill = None
        if needs_backfill(df, symbol):
            df, backfill = fill_latest_from_quote(df, finnhub_quote(symbol))
        # 最新一天的收盤價是空的（而且沒補到）：修正時會被刪掉，但要記下來，讓備援排程知道要重抓
        blank_latest = latest_is_blank(df)
        df, notes = repair_daily(df)
        if partial:
            notes.insert(0, partial)
        if backfill:
            notes.insert(0, backfill)
        if notes:
            print(f"  [{symbol}] 自動修正：{'；'.join(notes)}")
        problems = validate_daily(df, MIN_ROWS)
        if problems:
            print(f"  [{symbol}] 資料異常：{'；'.join(problems)}，保留前一天的檔案")
            STATUS[symbol] = {"result": "invalid", "reason": "；".join(problems), "repaired": notes}
            return "invalid"
        # 基本面：失敗不影響價格資料，最多就是沿用上一次的數字
        previous = (read_json(ticker_path(symbol)) or {}).get("fundamentals")
        today = pd.Timestamp(df.index[-1]).strftime("%Y-%m-%d")
        fundamentals = merge_fundamentals(price_stats(df), fetch_info(symbol), previous, today)
        payload = build_ticker_payload(df, {**t, "sample": False, "fundamentals": fundamentals})
        write_json_atomic(ticker_path(symbol), payload)
        print(f"  [{symbol}] 完成，最後日期 {payload['lastDate']} 收盤 {payload['lastClose']}")
        STATUS[symbol] = {"result": "ok", "lastDate": payload["lastDate"], "rows": len(df), "repaired": notes}
        if blank_latest:
            STATUS[symbol]["incompleteLatest"] = True
        return "ok"
    except Exception as e:  # 保險：任何意料外的錯誤都只影響這一檔
        print(f"  [{symbol}] 發生錯誤：{e}，保留前一天的檔案")
        STATUS[symbol] = {"result": "invalid", "reason": f"程式錯誤：{e}"}
        return "invalid"


def write_status(tickers: list[dict], fx: dict, risk_free: float | None) -> None:
    """
    寫出 public/data/status.json：這次更新每一檔的結果。
    失敗的股票網站上仍顯示前一天的資料；這個檔案讓人知道哪些沒更新、原因是什麼。
    """
    from datetime import datetime, timezone

    results = {t["symbol"]: STATUS.get(t["symbol"], {"result": "skipped"}) for t in tickers}
    write_json_atomic(STATUS_PATH, {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "summary": {
            "total": len(results),
            "ok": sum(r["result"] == "ok" for r in results.values()),
            "failed": [s for s, r in results.items() if r["result"] != "ok"],
            # 成功但「最新一天收盤價是空的」：備援排程會再抓一次
            "incomplete": [s for s, r in results.items() if r.get("incompleteLatest")],
            "fx": "ok" if fx else "沿用上次",
            "riskFree": "ok" if risk_free is not None else "沿用上次",
        },
        "tickers": results,
    })


def main() -> int:
    watchlist = load_watchlist()
    tickers = watchlist["tickers"]
    results: dict[str, str] = {}

    # 第一輪：分批抓
    batches = [tickers[i : i + BATCH_SIZE] for i in range(0, len(tickers), BATCH_SIZE)]
    for n, batch in enumerate(batches, start=1):
        print(f"\n=== 第 {n}/{len(batches)} 批（{len(batch)} 檔）===")
        for t in batch:
            results[t["symbol"]] = process_symbol(t)
        if n < len(batches):
            pause(BATCH_PAUSE)

    # 第二輪：下載失敗的再試一次（常見原因是暫時被限流或網路不穩）
    retry = [t for t in tickers if results[t["symbol"]] == "download"]
    if retry:
        print(f"\n=== 第二輪重試 {len(retry)} 檔：{[t['symbol'] for t in retry]} ===")
        pause(FINAL_RETRY_PAUSE)
        for t in retry:
            results[t["symbol"]] = process_symbol(t)

    ok = [s for s, r in results.items() if r == "ok"]
    failed = [s for s, r in results.items() if r != "ok"]

    fx, fx_history = fetch_fx(watchlist.get("fx", {}))
    print(f"匯率：{fx or '抓取失敗，沿用舊值'}")
    risk_free = fetch_risk_free(watchlist.get("riskFree"))
    print(f"無風險利率：{risk_free if risk_free is not None else '抓取失敗，沿用舊值'}")

    if not ok:
        print("所有股票都抓取失敗，不更新任何檔案。")
        return 1

    if fx_history:
        write_json_atomic(FX_PATH, fx_history)
    rebuild_index(watchlist, fx, risk_free)
    write_status(tickers, fx, risk_free)
    print(f"\n成功 {len(ok)} 檔，失敗 {len(failed)} 檔：{failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
