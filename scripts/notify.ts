// 每日篩選通知：在 GitHub Actions 裡、抓完資料之後執行
//   npx vite-node scripts/notify.ts
// 判斷邏輯直接用網站篩選器的 src/lib/screener.ts（同一套程式，結果和網頁一致）。
//
// 環境變數：
//   DISCORD_WEBHOOK_URL  Discord 頻道的 Webhook 網址（存在 GitHub Secrets；沒設定就只印出訊息、不送）
//   NOTIFY_FORCE=1       同一天的資料已經通知過也再送一次（測試用）
//
// 安全設計：任何錯誤都只印出來、結束碼 0，不會讓每日資料更新失敗。

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildMessages, buildState, evaluateRules, sanitizeNotifyConfig, type NotifyState } from "../src/lib/notify";
import type { ScreenerData } from "../src/lib/screener";

const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "public", "data");
const STATE_PATH = join(DATA, "notify-state.json");

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** 先寫暫存檔再改名，避免寫到一半的壞檔案 */
function writeJsonAtomic(path: string, data: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

async function postDiscord(url: string, content: string): Promise<void> {
  // allowed_mentions 空白：訊息裡就算出現 @everyone 也不會真的標記所有人
  const body = JSON.stringify({ username: "投資看盤", content, allowed_mentions: { parse: [] } });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (res.ok) return;
    // 429 = 送太快被限流，依 Discord 回應的時間等一下再送
    const wait = res.status === 429 ? Number(res.headers.get("retry-after") ?? "2") * 1000 : 2000 * attempt;
    console.log(`  Discord 回應 ${res.status}，${wait / 1000} 秒後重試（第 ${attempt} 次）`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error("Discord 送出失敗（已重試 3 次）");
}

async function main(): Promise<void> {
  const cfg = sanitizeNotifyConfig(readJson(join(ROOT, "config", "notify.json")));
  if (cfg.rules.length === 0) return console.log("config/notify.json 沒有有效的規則，不通知。");

  const data = readJson<ScreenerData>(join(DATA, "screener.json"));
  if (!data || !Array.isArray(data.tickers) || data.tickers.length === 0) return console.log("沒有 screener.json，不通知。");
  if ((data as ScreenerData & { sample?: boolean }).sample || data.tickers.some((x) => (x as { sample?: boolean }).sample)) {
    return console.log("目前是範例資料，不通知。");
  }

  // 資料日期：取各檔最新日期中最晚的一天（台股、美股收盤日可能不同）
  const dataDate = data.tickers.map((x) => x.lastDate).sort().at(-1) ?? "";
  const previous = readJson<NotifyState>(STATE_PATH);
  if (previous?.dataDate === dataDate && process.env.NOTIFY_FORCE !== "1") {
    return console.log(`${dataDate} 的資料已經通知過了（例如推程式碼觸發的重跑），這次不送。`);
  }

  const results = evaluateRules(data, cfg.rules, previous);
  for (const r of results) console.log(`規則「${r.rule.name}」：${r.matches.map((m) => m.ticker.symbol).join(", ") || "無"}`);
  const messages = buildMessages(results, cfg, dataDate);

  const url = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!url) {
    console.log("沒有設定 DISCORD_WEBHOOK_URL，只印出訊息：\n" + messages.join("\n---\n"));
  } else if (messages.length === 0) {
    console.log("今天沒有符合的股票，不送訊息。");
  } else {
    for (const m of messages) await postDiscord(url, m);
    console.log(`已送出 ${messages.length} 則 Discord 訊息。`);
  }
  // 送出成功（或不需要送）才更新紀錄；送失敗時保留舊紀錄，明天會再當成新的通知
  writeJsonAtomic(STATE_PATH, buildState(results, dataDate));
}

main().catch((e: unknown) => {
  console.log(`通知失敗（不影響資料更新）：${e instanceof Error ? e.message : String(e)}`);
});
