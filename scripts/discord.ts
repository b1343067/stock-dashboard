// 送一則訊息到 Discord Webhook（每日篩選通知 notify.ts、AI 主管重點 notify-ai.ts 共用）

import type { DiscordMessage } from "../src/lib/notify";

export async function postDiscord(url: string, msg: DiscordMessage): Promise<void> {
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

/** Webhook 網址的基本檢查（貼錯成別的網址時早一點發現） */
export function checkWebhookUrl(url: string): void {
  if (!/^https:\/\/((ptb\.|canary\.)?discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) throw new Error("DISCORD_WEBHOOK_URL 看起來不是 Discord 的 Webhook 網址（應該是 https://discord.com/api/webhooks/… 開頭）");
}
