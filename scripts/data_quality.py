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


# 少量異常可以自動修；超過這個比例就當作整份資料有問題
MAX_BAD_RATIO = 0.05


def repair_daily(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """
    修正「少量、可以安全修正」的資料問題，回傳 (修好的資料, 修了什麼)。
    為什麼要修而不是整檔拒絕？Yahoo 的台灣 ETF 偶爾會有幾天高低價錯誤，
    以前只要有一筆就整檔不更新，這檔股票就永遠抓不到（006208.TW 就是這樣）。
      - 收盤價是空的、或 ≤ 0：刪掉那幾天（太多的話不刪，交給 validate_daily 拒絕）
      - 開高低是空的：用收盤價補
      - 最高價比開盤／收盤還低、最低價比開盤／收盤還高：把高低價修正成包含開盤和收盤
      - 少量週末日期：刪掉（台股以前有週六補班交易日；大量週末日期代表時區錯開，不修、交給檢查拒絕）
      - 日期沒排序：重新排序
    """
    notes: list[str] = []
    out = df.copy()
    n = len(out)
    if n == 0:
        return out, notes

    if not pd.DatetimeIndex(out.index).is_monotonic_increasing:
        out = out.sort_index()
        notes.append("日期重新排序")

    close = out["Close"]
    bad_close = close.isna() | (close <= 0)
    if 0 < bad_close.sum() <= n * MAX_BAD_RATIO:
        out = out[~bad_close]
        notes.append(f"刪除 {int(bad_close.sum())} 筆空白或 ≤ 0 的收盤價")

    weekend = pd.DatetimeIndex(out.index).dayofweek >= 5
    if 0 < weekend.sum() <= len(out) * MAX_BAD_RATIO:
        out = out[~weekend]
        notes.append(f"刪除 {int(weekend.sum())} 筆週末交易日（例如台股補班日）")

    if {"Open", "High", "Low"} <= set(out.columns):
        c = out["Close"]
        o = out["Open"].where(out["Open"] > 0, c)
        filled = int((out["Open"] != o).sum())
        hi = pd.concat([out["High"], o, c], axis=1).max(axis=1)
        lo = pd.concat([out["Low"].where(out["Low"] > 0), o, c], axis=1).min(axis=1)
        fixed = int(((hi != out["High"]) | (lo != out["Low"])).sum())
        out["Open"], out["High"], out["Low"] = o, hi, lo
        if filled:
            notes.append(f"用收盤價補 {filled} 筆缺少的開盤價")
        if fixed:
            notes.append(f"修正 {fixed} 筆高低價（讓最高／最低包含開盤與收盤）")
    return out, notes


def validate_daily(df: pd.DataFrame, min_rows: int = 60) -> list[str]:
    """
    檢查日線資料，回傳問題清單（空清單 = 沒問題）。請先呼叫 repair_daily() 修掉小問題。
    剩下的都是「嚴重問題」：有任何一項就不寫檔，保留前一天的檔案（寧可顯示舊資料，也不要顯示錯的資料）。
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
        problems.append(f"有 {weekend} 筆週末日期（太多，可能是時區造成日期錯開）")

    close = df["Close"]
    if (close.dropna() <= 0).any():
        problems.append("有 ≤ 0 的收盤價")
    # 收盤價應該介於當天最高與最低之間（容許 0.5% 的四捨五入誤差）
    if {"High", "Low"} <= set(df.columns):
        bad = ((close > df["High"] * 1.005) | (close < df["Low"] * 0.995)).sum()
        if bad:
            problems.append(f"有 {int(bad)} 筆收盤價不在當天高低之間")
    return problems
