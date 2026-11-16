// 價格提醒的單元測試。執行：npm test
import { describe, expect, it } from "vitest";
import { acknowledge, alertState, describeAlert, evaluateAlert, needsRsi, newAlert, sanitizeAlerts, type Quote } from "./alerts";

const q: Quote = { close: 390, changePct: -3.5, rsi: 28, date: "2026-11-13" };

describe("evaluateAlert", () => {
  it("價格高於／低於（含等於）", () => {
    expect(evaluateAlert(newAlert("TSLA", "priceAbove", 390), q).met).toBe(true);
    expect(evaluateAlert(newAlert("TSLA", "priceAbove", 400), q).met).toBe(false);
    expect(evaluateAlert(newAlert("TSLA", "priceBelow", 395), q).met).toBe(true);
  });
  it("單日跌幅：輸入 3 代表跌 3% 以上", () => {
    expect(evaluateAlert(newAlert("TSLA", "changeDown", 3), q).met).toBe(true);
    expect(evaluateAlert(newAlert("TSLA", "changeDown", 4), q).met).toBe(false);
    expect(evaluateAlert(newAlert("TSLA", "changeUp", 1), q).met).toBe(false);
  });
  it("RSI：沒有 RSI 資料時不成立", () => {
    expect(evaluateAlert(newAlert("TSLA", "rsiBelow", 30), q).met).toBe(true);
    expect(evaluateAlert(newAlert("TSLA", "rsiBelow", 30), { ...q, rsi: undefined })).toEqual({ met: false, current: null });
  });
  it("沒有報價", () => expect(evaluateAlert(newAlert("X", "priceAbove", 1), undefined).met).toBe(false));
});

describe("狀態與確認", () => {
  it("觸發 → 按知道了 → 只提醒一次的會停用", () => {
    const a = newAlert("TSLA", "priceBelow", 400);
    expect(alertState(a, q)).toBe("triggered");
    const [acked] = acknowledge([a], [a.id], { TSLA: q.date });
    expect(acked).toMatchObject({ ackDate: "2026-11-13", disabled: true });
    expect(alertState(acked, q)).toBe("disabled");
  });
  it("重複提醒：同一天確認後不再提醒，新的一天條件仍成立就再提醒", () => {
    const a = newAlert("TSLA", "priceBelow", 400, true);
    const [acked] = acknowledge([a], [a.id], { TSLA: q.date });
    expect(alertState(acked, q)).toBe("acknowledged");
    expect(alertState(acked, { ...q, date: "2026-11-16" })).toBe("triggered");
  });
  it("條件不成立是監控中；沒有資料是 noData", () => {
    expect(alertState(newAlert("TSLA", "priceAbove", 500), q)).toBe("watching");
    expect(alertState(newAlert("ZZZ", "priceAbove", 1), undefined)).toBe("noData");
  });
});

describe("其他", () => {
  it("白話描述", () => {
    expect(describeAlert(newAlert("tsla", "priceAbove", 400))).toBe("TSLA 收盤價漲到 400 以上");
    expect(describeAlert(newAlert("NVDA", "changeDown", 3))).toBe("NVDA 單日跌幅達 3% 以上");
    expect(describeAlert(newAlert("AMD", "rsiBelow", 30))).toBe("AMD RSI 低於 30");
  });
  it("有 RSI 提醒才需要載入 RSI 資料", () => {
    expect(needsRsi([newAlert("A", "priceAbove", 1)])).toBe(false);
    expect(needsRsi([newAlert("A", "rsiBelow", 30)])).toBe(true);
    expect(needsRsi([{ ...newAlert("A", "rsiBelow", 30), disabled: true }])).toBe(false);
  });
  it("讀取時丟掉壞資料", () => {
    const ok = sanitizeAlerts([{ symbol: "voo", kind: "priceAbove", value: 1 }, { symbol: "", kind: "priceAbove", value: 1 }, { symbol: "A", kind: "x", value: 1 }, { symbol: "A", kind: "priceAbove", value: "1" }, null]);
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ symbol: "VOO", repeat: false, disabled: false, ackDate: null });
    expect(sanitizeAlerts("bad")).toEqual([]);
  });
});
