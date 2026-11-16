"""
資料品質：日期轉換與異常檢查
============================
為什麼需要這個檔案？
  yfinance 回傳的時間「通常」是交易所當地時間（美股 = 紐約、台股 = 台北），
  直接去掉時區就能得到正確的交易日。但如果某一版 yfinance 改成回傳 UTC 時間，
  台股「台北 11/14 00:00」= 「UTC 11/13 16:00」，去掉時區後日期會變成前一天，
  和美股對齊時就會差一天，Beta、相關係數全部算錯。
  所以這裡「明確地」先換成交易所時區，再取日期；並在寫檔前檢查資料有沒有異常。
"""

from __future__ import annotations

import pandas as pd

# 交易所時區：台股（.TW 上市、.TWO 上櫃）用台北，其餘用紐約
TZ_TAIPEI = "Asia/Taipei"
TZ_NEW_YORK = "America/New_York"


def exchange_tz(symbol: str) -> str:
    s = symbol.upper()
    return TZ_TAIPEI if s.endswith(".TW") or s.endswith(".TWO") else TZ_NEW_YORK


def to_exchange_dates(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """
    把索引轉成「交易所當地的日期」（不含時間、不含時區）。
      - 有時區（例如 UTC 或紐約）→ 先換成交易所時區，再取日期
      - 沒有時區 → 視為已經是當地日期
    """
    out = df.copy()
    idx = pd.DatetimeIndex(out.index)
    if idx.tz is not None:
        idx = idx.tz_convert(exchange_tz(symbol)).tz_localize(None)
    out.index = idx.normalize()
    return out


def validate_daily(df: pd.DataFrame, min_rows: int = 60) -> list[str]:
    """
    檢查日線資料，回傳問題清單（空清單 = 沒問題）。
    有任何問題就不寫檔，保留前一天的檔案（網站寧可顯示舊資料，也不要顯示錯的資料）。
    """
    problems: list[str] = []
    if len(df) < min_rows:
        return [f"筆數太少（{len(df)} 筆）"]
    idx = pd.DatetimeIndex(df.index)

    dup = int(idx.duplicated().sum())
    if dup:
        problems.append(f"有 {dup} 個重複日期")
    if not idx.is_monotonic_increasing:
        problems.append("日期沒有依序排列")
    weekend = int((idx.dayofweek >= 5).sum())
    if weekend:
        problems.append(f"有 {weekend} 筆週末日期（可能是時區造成日期錯開）")

    close = df["Close"]
    if (close.dropna() <= 0).any():
        problems.append("有 ≤ 0 的收盤價")
    # 收盤價應該介於當天最高與最低之間（容許 0.5% 的四捨五入誤差）
    if {"High", "Low"} <= set(df.columns):
        bad = ((close > df["High"] * 1.005) | (close < df["Low"] * 0.995)).sum()
        if bad:
            problems.append(f"有 {int(bad)} 筆收盤價不在當天高低之間")
    return problems
