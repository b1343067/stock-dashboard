"""
讀寫 JSON 檔案的共用工具
========================
重點：「先寫到暫存檔，成功後再換名」，這樣就算寫到一半程式當掉，
網站讀到的也一定是完整的舊檔案或完整的新檔案，不會是壞掉的半個檔案。
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # 專案根目錄
CONFIG_PATH = ROOT / "config" / "watchlist.json"         # 觀察清單設定
DATA_DIR = ROOT / "public" / "data"                      # 前端讀取的資料夾
INDEX_PATH = DATA_DIR / "index.json"                     # 總表（清單 + 匯率）
SCREENER_PATH = DATA_DIR / "screener.json"               # 篩選器用的精簡資料
FX_PATH = DATA_DIR / "fx.json"                           # 歷史匯率（第四階段換算台股報酬用）

# 篩選器每個週期保留最近幾根 K 棒（條件最多看「最近 20 根」，再多留一些緩衝）
SCREENER_BARS = 30
# 篩選器需要的欄位（不含開高低量，讓檔案小一點）
SCREENER_FIELDS = (
    "time", "close", "ma10", "ma20", "ma50", "ma200",
    "rsi", "macd", "signal", "hist", "bbUpper", "bbMiddle", "bbLower",
)


def infer_currency(symbol: str) -> str:
    """台股（.TW 上市、.TWO 上櫃）是台幣，其他都當美元。"""
    s = symbol.upper()
    return "TWD" if s.endswith(".TW") or s.endswith(".TWO") else "USD"


def normalize_watchlist(raw: dict) -> dict:
    """
    把 config/watchlist.json 整理成程式好用的格式：
      {
        "fx": {...}, "riskFree": "^IRX",
        "categories": ["大盤與債券", "科技", ...],          # 依設定檔順序
        "tickers": [{"symbol", "name", "currency", "category"}, ...]
      }
    設定檔是人手改的，所以這裡會：
      - 代號去空白、轉大寫；沒填名稱就用代號
      - 幣別依代號自動判斷（也可以在設定檔寫 "currency" 覆蓋）
      - 重複的代號只保留第一個，並印出警告
    也相容舊格式（直接一個 "tickers" 清單，沒有分類）。
    """
    groups = raw.get("groups")
    if groups is None:  # 舊格式
        groups = [{"name": "未分類", "tickers": raw.get("tickers", [])}]

    categories: list[str] = []
    tickers: list[dict] = []
    seen: set[str] = set()
    for g in groups:
        cat = str(g.get("name") or "未分類").strip()
        for t in g.get("tickers", []):
            symbol = str(t.get("symbol", "")).strip().upper()
            if not symbol:
                print(f"  ⚠️ 分類「{cat}」有一筆沒有代號，已略過")
                continue
            if symbol in seen:
                print(f"  ⚠️ 代號 {symbol} 重複出現，只保留第一個")
                continue
            seen.add(symbol)
            tickers.append({
                "symbol": symbol,
                "name": str(t.get("name") or symbol).strip(),
                "currency": t.get("currency") or infer_currency(symbol),
                "category": cat,
            })
        if cat not in categories:
            categories.append(cat)
    return {
        "fx": raw.get("fx", {}),
        "riskFree": raw.get("riskFree"),
        "categories": categories,
        "tickers": tickers,
    }


def load_watchlist() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return normalize_watchlist(json.load(f))


def ticker_path(symbol: str) -> Path:
    """每檔股票一個檔案，例如 public/data/BRK-B.json、public/data/0050.TW.json"""
    return DATA_DIR / f"{symbol}.json"


def write_json_atomic(path: Path, data: dict) -> None:
    """安全寫入：先寫 .tmp，確認寫完再取代正式檔案。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        # separators 去掉多餘空白，讓檔案小一點
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)   # os.replace 在同一個磁碟上是「原子操作」


def read_json(path: Path) -> dict | None:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def rebuild_index(watchlist: dict, fx: dict, risk_free: float | None = None, generated_at: str | None = None) -> dict:
    """
    依照「磁碟上目前存在的股票檔案」重建 index.json。
    抓失敗的股票會沿用舊檔案，所以這裡讀到的永遠是最新可用的資料。
    名稱、分類以設定檔為準（改名或換分類不用重抓資料）。
    generated_at：不填就用現在時間；只想更新格式（例如加分類）時可以沿用舊的時間。
    """
    previous = read_json(INDEX_PATH) or {}
    items = []
    for t in watchlist["tickers"]:
        payload = read_json(ticker_path(t["symbol"]))
        if not payload:
            continue   # 從來沒成功抓過的股票就不列出，避免前端讀到不存在的檔案
        items.append({
            "symbol": payload["symbol"],
            "name": t["name"],
            "currency": payload.get("currency", t["currency"]),
            "category": t["category"],
            "lastDate": payload["lastDate"],
            "lastClose": payload["lastClose"],
            "changePct": payload["changePct"],
            "sample": bool(payload.get("sample", False)),
        })

    index = {
        "generatedAt": generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        # 只要還有任何一檔是範例資料，網站就顯示「範例資料」提示
        "sample": any(i["sample"] for i in items),
        # 匯率抓不到時沿用上一次的值（修正 #3 會用到：台股要換成美元）
        "fx": fx or previous.get("fx", {}),
        # 無風險利率（年化小數，例如 0.0425），抓不到沿用上一次；第四階段算夏普值、Alpha 用
        "riskFree": risk_free if risk_free is not None else previous.get("riskFree"),
        # 分類順序（只列出有資料的分類），側邊欄依這個順序分組
        "categories": [c for c in watchlist["categories"] if any(i["category"] == c for i in items)],
        "tickers": items,
    }
    write_json_atomic(INDEX_PATH, index)
    build_screener(watchlist, index["generatedAt"])
    return index


def build_screener(watchlist: dict, generated_at: str) -> dict:
    """
    產生 public/data/screener.json（第二階段：指標篩選器用）。
    內容是每檔股票、每個週期「最近 SCREENER_BARS 根」的指標，
    這樣篩選器只要下載一個小檔案，不用把幾十檔的完整資料都抓下來。
    和 index.json 一樣，只讀磁碟上現有的檔案，所以抓失敗的股票會沿用舊資料。
    """
    items = []
    for t in watchlist["tickers"]:
        payload = read_json(ticker_path(t["symbol"]))
        if not payload:
            continue
        item = {k: payload[k] for k in ("symbol", "currency", "lastDate", "lastClose", "changePct")}
        item["name"] = t["name"]
        item["category"] = t["category"]
        for tf in ("daily", "weekly", "monthly"):
            series = payload[tf]
            item[tf] = {f: series[f][-SCREENER_BARS:] for f in SCREENER_FIELDS}
        items.append(item)
    screener = {"generatedAt": generated_at, "bars": SCREENER_BARS, "tickers": items}
    write_json_atomic(SCREENER_PATH, screener)
    return screener
