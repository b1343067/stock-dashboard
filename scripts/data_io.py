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


def load_watchlist() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


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


def rebuild_index(watchlist: dict, fx: dict) -> dict:
    """
    依照「磁碟上目前存在的股票檔案」重建 index.json。
    抓失敗的股票會沿用舊檔案，所以這裡讀到的永遠是最新可用的資料。
    """
    previous = read_json(INDEX_PATH) or {}
    items = []
    for t in watchlist["tickers"]:
        payload = read_json(ticker_path(t["symbol"]))
        if not payload:
            continue   # 從來沒成功抓過的股票就不列出，避免前端讀到不存在的檔案
        items.append({
            "symbol": payload["symbol"],
            "name": payload.get("name", payload["symbol"]),
            "currency": payload.get("currency", "USD"),
            "lastDate": payload["lastDate"],
            "lastClose": payload["lastClose"],
            "changePct": payload["changePct"],
            "sample": bool(payload.get("sample", False)),
        })

    index = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        # 只要還有任何一檔是範例資料，網站就顯示「範例資料」提示
        "sample": any(i["sample"] for i in items),
        # 匯率抓不到時沿用上一次的值（修正 #3 會用到：台股要換成美元）
        "fx": fx or previous.get("fx", {}),
        "tickers": items,
    }
    write_json_atomic(INDEX_PATH, index)
    return index
