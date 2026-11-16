// 每日篩選通知（Discord）：純函式，測試在 notify.test.ts
//
// 流程（scripts/notify.ts，由每天早上的 GitHub Actions 執行）：
//   config/notify.json 的規則 + 最新的 screener.json
//     → 用篩選器同一套判斷（runScreen）找出符合的股票
//     → 和昨天比較，標出「今天新出現」的
//     → 組成 Discord 訊息送出
// 規則和網頁上的篩選條件格式相同，可以在篩選器頁按「複製成通知規則」貼過來。
// ⚠️ config/notify.json 在公開儲存庫裡：只放篩選條件，不要放任何持股資訊。

import { runScreen, sanitizeConditions, type CombineMode, type Condition, type ScreenerData, type ScreenerTicker } from "./screener";
import { describeCondition } from "./screener";

export interface NotifyRule {
  name: string;
  mode: CombineMode;
  /** 只篩某個分類；"all" 或沒填 = 全部 */
  category: string;
  conditions: Condition[];
}

export interface NotifyConfig {
  siteUrl: string;
  /** true = 沒有任何股票符合時不送訊息（避免每天收到空通知） */
  onlyWhenMatched: boolean;
  rules: NotifyRule[];
}

export interface RuleResult {
  rule: NotifyRule;
  matches: { ticker: ScreenerTicker; details: string[]; isNew: boolean }[];
}

/** 上一次通知的紀錄（存在 data 分支的 notify-state.json），用來判斷「新出現」與避免重複通知 */
export interface NotifyState {
  dataDate: string;
  rules: Record<string, string[]>;
}

const DEFAULT_SITE = "https://stock-dashboard-peach-sigma.vercel.app/";

/** 檢查設定檔格式；壞掉的規則丟掉，條件用篩選器的 sanitizeConditions 補齊 */
export function sanitizeNotifyConfig(raw: unknown): NotifyConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rules: NotifyRule[] = [];
  for (const r of Array.isArray(o.rules) ? o.rules : []) {
    const x = (r ?? {}) as Record<string, unknown>;
    const conditions = sanitizeConditions(x.conditions);
    if (typeof x.name !== "string" || !x.name.trim() || conditions.length === 0) continue;
    rules.push({
      name: x.name.trim().slice(0, 60),
      mode: x.mode === "or" ? "or" : "and",
      category: typeof x.category === "string" && x.category ? x.category : "all",
      conditions,
    });
  }
  const site = typeof o.siteUrl === "string" && /^https:\/\//.test(o.siteUrl) ? o.siteUrl : DEFAULT_SITE;
  return { siteUrl: site.endsWith("/") ? site : `${site}/`, onlyWhenMatched: o.onlyWhenMatched !== false, rules };
}

/** 跑每一條規則；previous 是上一次的紀錄（沒有就全部算新的） */
export function evaluateRules(data: ScreenerData, rules: NotifyRule[], previous: NotifyState | null): RuleResult[] {
  return rules.map((rule) => {
    const pool = rule.category === "all" ? data.tickers : data.tickers.filter((tk) => (tk.category ?? "") === rule.category);
    const before = new Set(previous?.rules[rule.name] ?? []);
    const matches = runScreen(pool, rule.conditions, rule.mode)
      .filter((r) => r.matched)
      .map((r) => ({ ticker: r.ticker, details: r.results.filter((c) => c.matched).map((c) => c.detail), isNew: !before.has(r.ticker.symbol) }))
      // 新出現的排前面，其次依代號
      .sort((a, b) => Number(b.isNew) - Number(a.isNew) || a.ticker.symbol.localeCompare(b.ticker.symbol));
    return { rule, matches };
  });
}

export function buildState(results: RuleResult[], dataDate: string): NotifyState {
  return { dataDate, rules: Object.fromEntries(results.map((r) => [r.rule.name, r.matches.map((m) => m.ticker.symbol)])) };
}

/** Discord 一則訊息最多 2000 字，超過就切成多則 */
export const DISCORD_LIMIT = 2000;

/** 組成 Discord 訊息（Markdown）。回傳空陣列 = 不需要送 */
export function buildMessages(results: RuleResult[], cfg: NotifyConfig, dataDate: string): string[] {
  const total = results.reduce((s, r) => s + r.matches.length, 0);
  if (total === 0 && cfg.onlyWhenMatched) return [];
  const lines: string[] = [`📊 **每日篩選結果**（${dataDate} 收盤）`];
  for (const r of results) {
    const newCount = r.matches.filter((m) => m.isNew).length;
    lines.push("");
    lines.push(`**${r.rule.name}** — ${r.matches.length} 檔${newCount ? `（🆕 新增 ${newCount}）` : ""}`);
    lines.push(`> ${r.rule.conditions.map(describeCondition).join(r.rule.mode === "and" ? " 且 " : " 或 ")}`);
    if (r.matches.length === 0) lines.push("（今天沒有符合的股票）");
    for (const m of r.matches) {
      const tk = m.ticker;
      const chg = `${tk.changePct >= 0 ? "+" : ""}${tk.changePct.toFixed(2)}%`;
      // <網址> 用角括號包起來：Discord 不會為每個連結產生預覽卡片，訊息才不會很長
      lines.push(`${m.isNew ? "🆕 " : "• "}[${tk.symbol}](<${cfg.siteUrl}#/${encodeURIComponent(tk.symbol)}/daily>) ${tk.name}　${tk.lastClose.toFixed(2)}（${chg}）　${m.details.join("；")}`);
    }
  }
  lines.push("");
  lines.push("_僅供學習參考，非投資建議。規則在 config/notify.json。_");
  return chunk(lines, DISCORD_LIMIT);
}

/** 依行切成每則不超過 limit 字的訊息（單行太長就硬切） */
export function chunk(lines: string[], limit: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const raw of lines) {
    const line = raw.length > limit ? raw.slice(0, limit - 1) + "…" : raw;
    if (cur && cur.length + 1 + line.length > limit) {
      out.push(cur);
      cur = line;
    } else cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) out.push(cur);
  return out;
}

/** 篩選器頁「複製成通知規則」：把目前條件轉成可以貼進 config/notify.json 的 JSON（去掉 id） */
export function toRuleJson(name: string, mode: CombineMode, category: string, conditions: Condition[]): string {
  const rule = {
    name,
    mode,
    category,
    conditions: conditions.map((c) => {
      const { id: _id, ...rest } = c;
      void _id;
      return rest;
    }),
  };
  return JSON.stringify(rule, null, 2);
}
