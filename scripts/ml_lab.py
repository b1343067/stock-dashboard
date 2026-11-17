"""
ML 實驗室：讀每日資料（public/data/<代號>.json），跑兩個實驗，寫出 public/data/ml.json
================================================================================
GitHub Actions 每天在抓完資料之後執行；也可以在本機跑：
  python scripts/ml_lab.py
計算邏輯在 ml.py（測試：python scripts/test_ml.py）。

安全機制：任何錯誤都不覆蓋舊的 ml.json（write_json_atomic 寫到一半失敗也不會產生壞檔），
結束碼 1 只會讓這一步變紅，workflow 設了 continue-on-error，不影響資料發布與通知。
"""

from __future__ import annotations

import math
import sys
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd

import ml
from data_io import DATA_DIR, load_watchlist, read_json, ticker_path, write_json_atomic

ML_PATH = DATA_DIR / "ml.json"
# 看盤頁的「波動預測」卡片只需要每檔的預測：另外存一個小檔，看盤頁不用下載整份實驗結果
ML_VOL_PATH = DATA_DIR / "ml-vol.json"
# 實驗室頁面的「預測 vs 實際」圖可以切換這幾檔
EXAMPLES = ["VOO", "QQQ", "NVDA", "TSLA", "2330.TW"]


def load_frames(symbols: list[str]) -> dict[str, pd.DataFrame]:
    frames = {}
    for s in symbols:
        p = read_json(ticker_path(s))
        if not p or p.get("sample"):
            continue  # 範例資料不拿來訓練
        d = p["daily"]
        df = pd.DataFrame(
            {"Open": d["open"], "High": d["high"], "Low": d["low"], "Close": d["close"], "Volume": d["volume"]},
            index=pd.DatetimeIndex(d["time"]),
        ).astype(float)
        frames[s] = df.dropna(subset=["Close"])
    return frames


def example_series(pred: pd.DataFrame, best: str) -> dict:
    """「預測 vs 實際」圖用的資料（年化波動 %）"""
    k = math.sqrt(ml.TRADING_DAYS) * 100
    out = {}
    for s in EXAMPLES:
        g = pred[pred["sym"] == s].sort_values("date")
        if g.empty:
            continue
        out[s] = {
            "time": [d.strftime("%Y-%m-%d") for d in g["date"]],
            "actual": [round(float(v) * k, 1) for v in g["y_vol"]],
            "naive": [round(float(v) * k, 1) for v in g["naive"]],
            "best": [round(float(v) * k, 1) for v in g[best]],
        }
    return out


def main() -> int:
    t0 = time.time()
    wl = load_watchlist()
    frames = load_frames([t["symbol"] for t in wl["tickers"]])
    if len(frames) < 5:
        print(f"可用的股票只有 {len(frames)} 檔（可能是範例資料），不執行 ML 實驗。")
        return 0
    samples = ml.build_samples(frames)
    blocks = ml.walk_forward_blocks(samples["date"])
    print(f"{len(frames)} 檔、{len(samples)} 個樣本、{len(blocks)} 段滾動驗證")

    vol_pred = ml.run_vol(samples, blocks)
    vol = ml.vol_summary(vol_pred)
    print("波動：", [(m["key"], m["improvement"]) for m in vol["models"]], "最佳", vol["best"])
    per_ticker = ml.per_ticker_improvement(vol_pred, vol["best"])
    current = ml.current_vol(samples, vol["best"], per_ticker)

    dir_pred = ml.run_direction(samples, blocks)
    direction = ml.direction_summary(dir_pred)
    print("方向：上漲比例", direction["baseRate"], [(m["key"], m["accuracy"], m.get("pValue")) for m in direction["models"]])

    # ③ 市場狀態分群（美股、台股大盤各自分）
    regimes = {}
    for sym, label in ml.REGIME_MARKETS.items():
        if sym in frames:
            res = ml.run_regimes(frames[sym])
            if res:
                regimes[sym] = {"label": label, **res}
                print(f"市場狀態 {sym}：{res['current']['name']}（第 {res['current']['days']} 天）")

    test_dates = vol_pred["date"]
    payload = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "horizon": ml.HORIZON,
        "symbols": len(frames),
        "samples": int(len(samples)),
        "trainStart": samples["date"].min().strftime("%Y-%m-%d"),
        "testStart": test_dates.min().strftime("%Y-%m-%d"),
        "testEnd": test_dates.max().strftime("%Y-%m-%d"),
        "refitEvery": ml.REFIT_EVERY,
        "cost": ml.COST,
        "features": {"vol": ml.VOL_FEATURES, "direction": ml.DIR_FEATURES},
        "vol": {**vol, "tickers": current, "examples": example_series(vol_pred, vol["best"])},
        "direction": direction,
        "regime": regimes,
    }
    write_json_atomic(ML_PATH, payload)
    write_json_atomic(ML_VOL_PATH, {
        "generatedAt": payload["generatedAt"],
        "horizon": ml.HORIZON,
        "models": [{"key": m["key"], "name": m["name"]} for m in vol["models"]],
        "tickers": current,
        # 今日總覽與 Discord 通知只需要「現在的市場狀態」
        "regime": {s: {"label": r["label"], **r["current"]} for s, r in regimes.items()},
    })
    print(f"已寫入 {ML_PATH}（{time.time() - t0:.0f} 秒）")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # 失敗時保留舊的 ml.json
        print(f"ML 實驗失敗（保留上一次的結果）：{e}")
        sys.exit(1)
