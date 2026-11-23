// 每日篩選通知：在 GitHub Actions 裡、抓完資料之後執行
//   npx vite-node scripts/notify.ts
// 判斷邏輯直接用網站篩選器的 src/lib/screener.ts（同一套程式，結果和網頁一致）。
//
// 環境變數：
//   DISCORD_WEBHOOK_URL  Discord 頻道的 Webhook 網址（存在 GitHub Secrets；沒設定就只印出訊息、不送）
//   NOTIFY_FORCE=1       同一天的資料已經通知過也再送一次（測試用）
//   NOTIFY_STRICT=1      失敗時結束碼 1（「測試 Discord 通知」用，讓失敗在 Actions 顯示紅色）
//   FINNHUB_API_KEY      Finnhub 金鑰（GitHub Secrets）：重大財經新聞、關注股票新聞、財報提醒。
//                        沒設定或 API 失敗時略過新聞區塊，其他通知照常送出（抓新聞在 scripts/news.ts）
//
// 安全設計：任何錯誤都只印出來、結束碼 0，不會讓每日資料更新失敗。

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadOrFetchNews } from "./news";
import type { SignalStatsFile } from "../src/lib/signalStats";
import { buildMessages, buildState, dataKeyOf, sanitizeNotifyConfig, type DiscordMessage, type NotifyState } from "../src/lib/notify";
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

async function postDiscord(url: string, msg: DiscordMessage): Promise<void> {
  // allowed_mentions 空白：訊息裡就算出現 @everyone 也不會真的標記所有人
  const body = JSON.stringify({ username: "投資看盤", content: msg.content, embeds: msg.embeds, allowed_mentions: { parse: [] } });
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
  if (!readJson(join(ROOT, "config", "notify.json"))) return console.log("沒有 config/notify.json，不通知。");

  const data = readJson<ScreenerData>(join(DATA, "screener.json"));
  if (!data || !Array.isArray(data.tickers) || data.tickers.length === 0) return console.log("沒有 screener.json，不通知。");
  if ((data as ScreenerData & { sample?: boolean }).sample || data.tickers.some((x) => (x as { sample?: boolean }).sample)) {
    return console.log("目前是範例資料，不通知。");
  }

  // 資料日期：取各檔最新日期中最晚的一天（台股、美股收盤日可能不同）
  const dataDate = data.tickers.map((x) => x.lastDate).sort().at(-1) ?? "";
  const previous = readJson<NotifyState>(STATE_PATH);
  // 用「各市場的最新日期」判斷這份資料通知過了沒（舊紀錄沒有 dataKey → 當作沒通知過）
  const dataKey = dataKeyOf(data);
  if (previous?.dataKey === dataKey && process.env.NOTIFY_FORCE !== "1") {
    return console.log(`這份資料（${dataKey}）已經通知過了（例如備援排程或推程式碼觸發的重跑），這次不送。`);
  }

  // 新聞：先用這次更新剛存的 news.json（scripts/save-news.ts），太舊或沒有才重抓
  const news = await loadOrFetchNews(cfg, join(DATA, "news.json"));
  // 市場狀態（ML 實驗室 ③）：ML 步驟在通知之前執行；沒有檔案就不列
  const regime = readJson<{ regime?: Record<string, never> }>(join(DATA, "ml-vol.json"))?.regime ?? null;
  // 訊號回測（scripts/signal-stats.ts 在前一步產生）；沒有就不附
  const stats = readJson<SignalStatsFile>(join(DATA, "signal-stats.json"));
  const messages = buildMessages(data, cfg, dataDate, previous, news, Math.floor(Date.now() / 1000), regime, stats);
  // 執行記錄（公開）只印出訊息內容；設定檔本來就是公開的，這裡沒有任何私人資料
  const preview = messages
    .map((m) => [m.content, ...m.embeds.map((e) => `【${e.title}】\n${e.description}`)].join("\n"))
    .join("\n---\n");

  const url = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!url && process.env.NOTIFY_STRICT === "1") throw new Error("沒有設定 DISCORD_WEBHOOK_URL（GitHub → Settings → Secrets and variables → Actions）");
  if (url && !/^https:\/\/((ptb\.|canary\.)?discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) {
    throw new Error("DISCORD_WEBHOOK_URL 看起來不是 Discord 的 Webhook 網址（應該是 https://discord.com/api/webhooks/… 開頭）");
  }
  if (!url) {
    console.log("沒有設定 DISCORD_WEBHOOK_URL，只印出訊息：\n" + preview);
  } else {
    console.log(preview);
    for (const m of messages) await postDiscord(url, m);
    console.log(`已送出 ${messages.length} 則 Discord 訊息。`);
  }
  // 送出成功（或不需要送）才更新紀錄；送失敗時保留舊紀錄，明天會再當成新的通知
  writeJsonAtomic(STATE_PATH, buildState(dataDate, data, cfg));
}

main().catch((e: unknown) => {
  console.log(`通知失敗（不影響資料更新）：${e instanceof Error ? e.message : String(e)}`);
  if (process.env.NOTIFY_STRICT === "1") process.exit(1);
});
