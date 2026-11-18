// api/cron.ts（Vercel Cron → 觸發 GitHub「更新股價資料」）的測試。用假的 fetch，不會真的呼叫 GitHub。
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../api/cron";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const req = (auth?: string) => new Request("https://x/api/cron", { headers: auth ? { authorization: auth } : {} });

describe("api/cron", () => {
  it("沒設定 CRON_SECRET 或 GH_DISPATCH_TOKEN → 503，什麼都不做", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("GH_DISPATCH_TOKEN", "tok");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await GET(req("Bearer x"))).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });

  it("沒帶或帶錯密碼 → 401（別人不能隨便觸發）", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-long-value");
    vi.stubEnv("GH_DISPATCH_TOKEN", "tok");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("正確 → 呼叫 GitHub workflow_dispatch，帶 source=cron；回應不含金鑰", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-long-value");
    vi.stubEnv("GH_DISPATCH_TOKEN", "ghp_TOKEN");
    vi.stubEnv("VERCEL_GIT_REPO_OWNER", "me");
    vi.stubEnv("VERCEL_GIT_REPO_SLUG", "repo");
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", f);
    const res = await GET(req("Bearer s3cret-long-value"));
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("ghp_TOKEN");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/me/repo/actions/workflows/update-data.yml/dispatches");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ghp_TOKEN");
    expect(JSON.parse(String(init.body))).toEqual({ ref: "main", inputs: { source: "cron" } });
  });

  it("GitHub 拒絕（例如 token 過期）→ 502，只回狀態碼", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-long-value");
    vi.stubEnv("GH_DISPATCH_TOKEN", "tok");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad credentials", { status: 401 })));
    const res = await GET(req("Bearer s3cret-long-value"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "dispatch-failed", status: 401 });
  });
});
