// 每日排程的可靠觸發器：Vercel Cron 每天呼叫這裡 → 用 GitHub API 觸發「更新股價資料」workflow
//
// 為什麼需要？GitHub Actions 自己的 schedule 很不可靠：2026-11-17、11-18 連續兩天完全沒觸發，
// 之前也晚過 3.5 小時。Vercel Cron 每天一定會在指定的那個小時內執行。
// GitHub 的 schedule 仍保留當備援；兩邊都跑也不會重複送通知（看 data 分支的 notify-state.json）。
//
// 需要的環境變數（Vercel → Settings → Environment Variables，都設成 Secret）：
//   CRON_SECRET        任意一串夠長的亂碼。Vercel 呼叫 Cron 時會自動帶 Authorization: Bearer <CRON_SECRET>，
//                      別人直接打這個網址沒有這串就會被拒絕
//   GH_DISPATCH_TOKEN  GitHub fine-grained token（只給這個儲存庫的 Actions: Read and write 權限）
// 沒設定時回 503，什麼都不做。

import { json } from "./_lib.js";

const WORKFLOW = "update-data.yml";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  const token = process.env.GH_DISPATCH_TOKEN?.trim();
  if (!secret || !token) return json({ error: "not-configured" }, 503);
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);

  // Vercel 會自動提供部署來源的儲存庫（System Environment Variables）；沒有就用預設值
  const owner = process.env.VERCEL_GIT_REPO_OWNER || "b1343067";
  const repo = process.env.VERCEL_GIT_REPO_SLUG || "stock-dashboard";
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "stock-dashboard-cron",
      "Content-Type": "application/json",
    },
    // source=cron：workflow 會把它當成「排程」（今天已更新過就略過、不強制重送通知）
    body: JSON.stringify({ ref: "main", inputs: { source: "cron" } }),
  });
  // 成功時 GitHub 回 204；失敗只回狀態碼（不回傳任何金鑰或 GitHub 的錯誤內容）
  if (res.status === 204) return json({ ok: true, dispatched: WORKFLOW });
  return json({ error: "dispatch-failed", status: res.status }, 502);
}
