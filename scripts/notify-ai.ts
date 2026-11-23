// AI 每日報告推上 main 後，送「🏢 AI 主管今日重點」到 Discord：npx vite-node scripts/notify-ai.ts
// 在 check-report.yml 裡、報告檢查通過之後執行。
// 同一天的報告只送一次：和上一個 commit 的 public/ai/latest.json 比日期（AI_PREV_DATE 可以手動指定，測試用）。
// 任何錯誤都只印出來、結束碼 0（通知失敗不影響報告）。

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { buildAiMessage, shouldSendAi } from "../src/lib/aiDiscord";
import { sanitizeNotifyConfig } from "../src/lib/notify";
import type { AiReport } from "../src/lib/types";
import { AI, readJson, ROOT } from "./ai-lib";
import { checkWebhookUrl, postDiscord } from "./discord";

/** 上一個 commit 的 latest.json 日期（沒有上一版或讀不到 → null） */
function previousDate(): string | null {
  if (process.env.AI_PREV_DATE !== undefined) return process.env.AI_PREV_DATE || null;
  try {
    const raw = execFileSync("git", ["show", "HEAD~1:public/ai/latest.json"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return (JSON.parse(raw) as AiReport).date ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const report = readJson<AiReport>(join(AI, "latest.json"));
  const prev = previousDate();
  if (!shouldSendAi(prev, report)) return console.log(`AI 報告（${report?.date ?? "沒有"}）和上一版同一天或是範例，不送。`);
  const cfg = sanitizeNotifyConfig(readJson(join(ROOT, "config", "notify.json")));
  const msg = buildAiMessage(report, cfg.siteUrl);
  if (!msg) return console.log("主管今天沒有完成報告，不送。");
  const url = process.env.DISCORD_WEBHOOK_URL?.trim();
  const preview = `【${msg.embeds[0].title}】\n${msg.embeds[0].description}`;
  if (!url) return console.log("沒有設定 DISCORD_WEBHOOK_URL，只印出訊息：\n" + preview);
  checkWebhookUrl(url);
  console.log(preview);
  await postDiscord(url, msg);
  console.log("已送出 AI 主管今日重點。");
}

main().catch((e: unknown) => {
  console.log(`AI 重點通知失敗（不影響報告）：${e instanceof Error ? e.message : String(e)}`);
});
