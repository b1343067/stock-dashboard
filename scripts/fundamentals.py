"""
基本面資料（加碼 B）
====================
分兩種來源：
  1. 從日線「自己算」：52 週高低點、近 12 個月殖利率（配息加總 ÷ 最新收盤）
     → 不需要額外的網路請求，每天都一定有
  2. 從 Yahoo 的 Ticker.info 讀：本益比、預估本益比、股價淨值比、市值、產業
     → 這個 API 比較不穩定（常被限流、欄位會缺），所以失敗時沿用上一次的值，
       不會因為基本面抓不到就讓整檔股票更新失敗

ETF 沒有本益比、產業等欄位，這些會是 null，網頁顯示「—」。
"""

from __future__ import annotations

import math
from datetime import timedelta

import pandas as pd

# 從 Ticker.info 取哪些欄位 → 輸出 JSON 的欄位名稱
INFO_FIELDS = {
    "trailingPE": "pe",
    "forwardPE": "forwardPe",
    "priceToBook": "pb",
    "marketCap": "marketCap",
    "sector": "sector",
    "industry": "industry",
    "quoteType": "quoteType",
}
# 不合理的值當作沒有資料（Yahoo 偶爾會給 0、負數或天文數字）
PE_MAX = 1000


def _num(v, digits: int = 2):
    """轉成數字並四捨五入；NaN、無限大、不是數字 → None（JSON 的 null）"""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, digits)


def price_stats(daily: pd.DataFrame) -> dict:
    """
    從日線算 52 週高低點與近 12 個月殖利率。
    daily 需要 High、Low、Close 欄位；有 Dividends 欄位（yfinance 會附）才算得出殖利率。
    價格已含除權息調整，所以 52 週高低點是「調整後」的價格，和 K 線圖一致。
    """
    d = daily.dropna(subset=["Close"]).sort_index()
    if d.empty:
        return {"high52w": None, "low52w": None, "dividendYield": None, "dividendTtm": None}
    last_day = pd.Timestamp(d.index[-1])
    year = d[d.index > last_day - timedelta(days=365)]
    last_close = float(d["Close"].iloc[-1])
    out = {
        "high52w": _num(year["High"].max()),
        "low52w": _num(year["Low"].min()),
        "dividendYield": None,
        "dividendTtm": None,
    }
    if "Dividends" in d.columns and last_close > 0:
        ttm = float(year["Dividends"].fillna(0).clip(lower=0).sum())
        out["dividendTtm"] = _num(ttm, 4)
        out["dividendYield"] = _num(ttm / last_close * 100)  # 百分比，例如 1.35 代表 1.35%
    return out


def clean_info(info: dict | None) -> dict:
    """從 Ticker.info 取出需要的欄位並檢查合理性；全部缺少時回傳空 dict"""
    if not isinstance(info, dict):
        return {}
    out: dict = {}
    for src, dst in INFO_FIELDS.items():
        v = info.get(src)
        if dst in ("sector", "industry", "quoteType"):
            out[dst] = v if isinstance(v, str) and v.strip() else None
        elif dst == "marketCap":
            n = _num(v, 0)
            out[dst] = int(n) if n and n > 0 else None
        else:
            n = _num(v)
            out[dst] = n if n is not None and 0 < n < PE_MAX else None
    if all(v is None for v in out.values()):
        return {}
    return out


def merge_fundamentals(stats: dict, info: dict, previous: dict | None, today: str) -> dict:
    """
    合併兩種來源。info 抓不到（空 dict）時沿用上一次檔案裡的值，並保留上一次的 infoDate，
    網頁就能顯示「資料日期」，使用者知道這是幾天前的數字。
    """
    prev = previous if isinstance(previous, dict) else {}
    if info:
        info_part = {**{k: None for k in INFO_FIELDS.values()}, **info, "infoDate": today}
    else:
        info_part = {k: prev.get(k) for k in INFO_FIELDS.values()}
        info_part["infoDate"] = prev.get("infoDate")
    return {**stats, **info_part}
