"""
ML 實驗室的自我檢查。執行：python scripts/test_ml.py
最重要的是「沒有偷看未來」：竄改未來的價格，今天的特徵必須完全不變。
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

import ml


def fake_prices(n: int = 800, seed: int = 0, garch: bool = True) -> pd.DataFrame:
    """隨機產生的股價。garch=True 時波動會「群聚」（大波動之後常跟著大波動），波動模型應該學得到"""
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2021-01-04", periods=n)
    r = np.zeros(n)
    var = 0.0002
    for i in range(n):
        if garch:
            var = 0.00001 + 0.12 * (r[i - 1] ** 2 if i else 0) + 0.85 * var
        r[i] = rng.normal(0.0004, math.sqrt(var if garch else 0.0002))
    c = 100 * np.exp(np.cumsum(r))
    hl = np.abs(rng.normal(0, 0.01, n)) + 0.002
    return pd.DataFrame(
        {"Open": c * (1 - hl / 4), "High": c * (1 + hl / 2), "Low": c * (1 - hl / 2), "Close": c, "Volume": rng.integers(1_000_000, 5_000_000, n).astype(float)},
        index=idx,
    )


def test_no_lookahead() -> None:
    df = fake_prices()
    t = 500
    a = ml.features(df).iloc[: t + 1]
    tampered = df.copy()
    tampered.iloc[t + 1 :] *= 3.0  # 把第 t 天之後的價格全部改掉
    b = ml.features(tampered).iloc[: t + 1]
    pd.testing.assert_frame_equal(a, b, check_exact=False, rtol=1e-12)


def test_targets_use_only_future() -> None:
    df = fake_prices(200)
    tg = ml.targets(df)
    t = 100
    # 答案結束日 = 5 個交易日之後
    assert tg["t_end"].iloc[t] == df.index[t + ml.HORIZON]
    # 答案只和 t+1～t+5 有關：改掉 t 天以前的價格（保持 t 天收盤不變）不影響波動答案
    tampered = df.copy()
    tampered.iloc[: t, tampered.columns.get_loc("Close")] *= 0.5
    assert abs(ml.targets(tampered)["y_vol"].iloc[t] - tg["y_vol"].iloc[t]) < 1e-15
    # 最後 5 天沒有答案
    assert tg["y_vol"].iloc[-ml.HORIZON :].isna().all() and tg["y_up"].iloc[-ml.HORIZON :].isna().all()


def test_taiwan_uses_previous_us_day() -> None:
    us = fake_prices(300, seed=1)
    tw = fake_prices(300, seed=2)
    mkt = ml.market_features({"VOO": us})
    day = tw.index[250]
    a = ml.attach_market(ml.features(tw), mkt, is_us=False).loc[day, "mkt_rv22"]
    # 竄改「同一個日期」的美股（台股收盤時它還沒發生）→ 台股那天的大盤特徵不能變
    us2 = us.copy()
    us2.loc[day:, "Close"] *= 2
    mkt2 = ml.market_features({"VOO": us2})
    b = ml.attach_market(ml.features(tw), mkt2, is_us=False).loc[day, "mkt_rv22"]
    assert abs(a - b) < 1e-15, "台股只能用前一天以前的美股資料"
    # 美股自己用同一天的沒問題（美股收盤時大盤也收盤了）
    c = ml.attach_market(ml.features(us), mkt2, is_us=True).loc[day, "mkt_rv22"]
    assert abs(c - mkt2.loc[day, "mkt_rv22"]) < 1e-15


def test_purge() -> None:
    samples = ml.build_samples({"A": fake_prices(600), "VOO": fake_prices(600, seed=3)})
    blocks = ml.walk_forward_blocks(samples["date"], min_train=200, step=21)
    start = blocks[0][0]
    tr = samples[ml.train_mask(samples, start)]
    assert (tr["t_end"] < start).all(), "訓練樣本的答案不能延伸到測試期"
    assert tr["date"].max() < start - pd.Timedelta(days=5), "測試期前 5 個交易日的樣本必須排除"
    # 每一段接著上一段，不重疊、不漏
    for (s1, e1), (s2, _) in zip(blocks, blocks[1:]):
        assert e1 == s2


def test_metrics() -> None:
    y = np.array([0.01, 0.02, 0.015])
    assert ml.qlike(y, y) < 1e-12, "完全準確時 QLIKE = 0"
    # 預測太低的懲罰比預測太高重（風控上低估風險比較危險）
    assert ml.qlike(y, y * 0.5) > ml.qlike(y, y * 1.5)
    assert abs(ml.mae_ann_pct(np.array([0.01]), np.array([0.02])) - 0.01 * math.sqrt(252) * 100) < 1e-9
    assert ml.paired_t_pvalue(np.array([0.1, 0.12, 0.09, 0.11, 0.1])) < 0.01
    assert ml.paired_t_pvalue(np.array([0.1, -0.1, 0.1, -0.1, 0.0])) > 0.3


def test_end_to_end() -> None:
    """整個流程跑得完；波動會群聚的資料上，ML／HAR 要贏過「過去 20 天」；方向在隨機漫步上贏不了"""
    frames = {f"S{i}": fake_prices(900, seed=10 + i) for i in range(5)}
    frames["VOO"] = fake_prices(900, seed=99)
    samples = ml.build_samples(frames)
    blocks = ml.walk_forward_blocks(samples["date"], min_train=300, step=42)
    vp = ml.run_vol(samples, blocks)
    vs = ml.vol_summary(vp)
    imp = {m["key"]: m["improvement"] for m in vs["models"]}
    assert imp["naive"] == 0 and imp["har"] > 0, f"HAR 應該贏過基準：{imp}"
    cur = ml.current_vol(samples, vs["best"], ml.per_ticker_improvement(vp, vs["best"]))
    assert set(cur) == set(frames) and all(v["range5"] > 0 for v in cur.values())
    dp = ml.run_direction(samples, blocks)
    ds = ml.direction_summary(dp)
    assert {m["key"] for m in ds["models"]} == set(ml.DIR_MODELS)
    assert all(abs(m["accuracy"] - ds["baseRate"]) < 15 for m in ds["models"]), "隨機漫步上不該有明顯優勢"
    assert len(ds["curves"]["time"]) == len(ds["curves"]["buyHold"]) == ds["periods"]


def main() -> None:
    tests = [test_no_lookahead, test_targets_use_only_future, test_taiwan_uses_previous_us_day, test_purge, test_metrics, test_end_to_end]
    for t in tests:
        t()
        print(f"  ✓ {t.__doc__.strip().splitlines()[0] if t.__doc__ else t.__name__}")
    print(f"ML 自我檢查全部通過（{len(tests)} 項）")


if __name__ == "__main__":
    main()
