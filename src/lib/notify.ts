// 每日 Discord 通知：純函式，測試在 notify.test.ts
//
// 流程（scripts/notify.ts，由每天早上的 GitHub Actions 執行）：
//   config/notify.json（關注清單、價位、規則）+ 最新的 screener.json
//     → 🚨 特別注意：關注的股票有大事（大漲大跌、碰到價位、接近 52 週新高新低、出現危險訊號）
//     → 📊 每日摘要：市場、我關注的股票、⚠️ 危險訊號、✅ 偏多訊號
//     → 組成 Discord 的彩色卡片（embed）送出
// 判斷都用網站篩選器同一套程式（runScreen），所以結果和網頁一致。
// ⚠️ config/notify.json 在公開儲存庫裡：只放關注清單與條件，不要放持股數量或成本。

import { breadth, topMovers } from "./market";
import { runScreen, sanitizeConditions, type CombineMode, type Condition, type ScreenerData, type ScreenerTicker } from "./screener";
import { macdStatus, maStatus, rsiStatus } from "./signals";
import type { TickerSummary } from "./types";

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

export interface NotifyRule {
  name: string;
  mode: CombineMode;
  /** 只篩某個分類；"all" = 全部 */
  category: string;
  conditions: Condition[];
}

export interface PriceAlert {
  symbol: string;
  /** 收盤價「向上穿越」這個價位時通知 */
  above: number | null;
  /** 收盤價「向下穿越」這個價位時通知 */
  below: number | null;
}

export interface NotifyConfig {
  siteUrl: string;
  /** 市場摘要的大盤指標 */
  benchmarks: string[];
  /** 不想在通知裡看到的股票（市場排行、訊號都略過） */
  exclude: string[];
  /** 漲幅／跌幅各列幾名 */
  topMovers: number;
  /** 我關注的股票（每天列出狀態；有大事會「特別注意」） */
  watch: string[];
  /** 關注的股票單日漲跌超過幾 % 算大事 */
  bigMovePct: number;
  /** 關注的股票距 52 週高／低點幾 % 以內算大事 */
  near52wPct: number;
  priceAlerts: PriceAlert[];
  /** ⚠️ 危險訊號規則（掃全部股票） */
  danger: NotifyRule[];
  /** ✅ 偏多訊號規則（掃全部股票） */
  rules: NotifyRule[];
}

const DEFAULT_SITE = "https://stock-dashboard-peach-sigma.vercel.app/";
const one = (kind: Condition["kind"], extra: Record<string, unknown> = {}) => ({ kind, tf: "daily", ...extra });

/** 設定檔沒寫 danger 時用的預設危險訊號 */
export const DEFAULT_DANGER = [
  { name: "MACD 死亡交叉", conditions: [one("macdDeath", { n: 1 })] },
  { name: "50／200 日線死亡交叉", conditions: [one("maCrossDown", { ma: 50, ma2: 200, n: 3 })] },
  { name: "RSI 急轉直下", conditions: [one("rsiDrop", { value: 15, n: 3 })] },
  { name: "跌破 200 日線", conditions: [one("priceCrossDownMa", { ma: 200, n: 1 })] },
  { name: "跌破布林下軌", conditions: [one("bbBreakDown", { band: "lower", n: 1 })] },
];

function sanitizeRules(raw: unknown): NotifyRule[] {
  const rules: NotifyRule[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const x = (r ?? {}) as Record<string, unknown>;
    const conditions = sanitizeConditions(x.conditions);
    if (typeof x.name !== "string" || !x.name.trim() || conditions.length === 0) continue;
    rules.push({
      name: x.name.trim().slice(0, 40),
      mode: x.mode === "or" ? "or" : "and",
      category: typeof x.category === "string" && x.category ? x.category : "all",
      conditions,
    });
  }
  return rules;
}

const symbols = (raw: unknown, fallback: string[]): string[] =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim().toUpperCase()).slice(0, 30) : fallback;
const num = (v: unknown, d: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : d);
const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** 檢查設定檔格式；缺的欄位補預設值，壞掉的規則丟掉 */
export function sanitizeNotifyConfig(raw: unknown): NotifyConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const site = typeof o.siteUrl === "string" && /^https:\/\//.test(o.siteUrl) ? o.siteUrl : DEFAULT_SITE;
  const alerts: PriceAlert[] = [];
  for (const a of Array.isArray(o.priceAlerts) ? o.priceAlerts : []) {
    const x = (a ?? {}) as Record<string, unknown>;
    const symbol = typeof x.symbol === "string" ? x.symbol.trim().toUpperCase() : "";
    const above = pos(x.above);
    const below = pos(x.below);
    if (symbol && (above !== null || below !== null)) alerts.push({ symbol, above, below });
  }
  return {
    siteUrl: site.endsWith("/") ? site : `${site}/`,
    benchmarks: symbols(o.benchmarks, ["VOO", "QQQ", "VT"]),
    exclude: symbols(o.exclude, []),
    topMovers: Math.round(num(o.topMovers, 3, 0, 10)),
    watch: symbols(o.watch, []),
    bigMovePct: num(o.bigMovePct, 5, 0.1, 100),
    near52wPct: num(o.near52wPct, 1, 0, 50),
    priceAlerts: alerts,
    danger: sanitizeRules(o.danger === undefined ? DEFAULT_DANGER : o.danger),
    rules: sanitizeRules(o.rules),
  };
}

// ---------------------------------------------------------------------------
// 判斷
// ---------------------------------------------------------------------------

/** 一檔股票符合了哪些規則（同一檔的多個訊號合併成一行） */
export interface SignalHit {
  ticker: ScreenerTicker;
  rules: string[];
  isNew: boolean;
}

/** 上一次通知的紀錄（存在 data 分支的 notify-state.json）：判斷「新出現」與避免同一天重複通知 */
export interface NotifyState {
  dataDate: string;
  /** 「規則名稱 → 符合的代號」 */
  rules: Record<string, string[]>;
}

/** 跑一組規則，依股票合併。previous 是上一次的紀錄（沒有就全部算新的） */
export function evaluateSignals(data: ScreenerData, rules: NotifyRule[], previous: NotifyState | null, watch: string[] = []): SignalHit[] {
  const map = new Map<string, SignalHit>();
  for (const rule of rules) {
    const pool = rule.category === "all" ? data.tickers : data.tickers.filter((tk) => (tk.category ?? "") === rule.category);
    const before = new Set(previous?.rules[rule.name] ?? []);
    for (const r of runScreen(pool, rule.conditions, rule.mode)) {
      if (!r.matched) continue;
      const hit = map.get(r.ticker.symbol) ?? { ticker: r.ticker, rules: [], isNew: false };
      hit.rules.push(rule.name);
      if (!before.has(r.ticker.symbol)) hit.isNew = true;
      map.set(r.ticker.symbol, hit);
    }
  }
  // 排序：關注的股票 → 新出現的 → 訊號多的 → 代號
  const w = new Set(watch);
  return [...map.values()].sort(
    (a, b) =>
      Number(w.has(b.ticker.symbol)) - Number(w.has(a.ticker.symbol)) ||
      Number(b.isNew) - Number(a.isNew) ||
      b.rules.length - a.rules.length ||
      a.ticker.symbol.localeCompare(b.ticker.symbol),
  );
}

/** 去掉 exclude 裡的股票 */
export function withoutExcluded(data: ScreenerData, cfg: NotifyConfig): ScreenerData {
  if (cfg.exclude.length === 0) return data;
  const ex = new Set(cfg.exclude);
  return { ...data, tickers: data.tickers.filter((tk) => !ex.has(tk.symbol)) };
}

export function buildState(dataDate: string, allData: ScreenerData, cfg: NotifyConfig): NotifyState {
  const data = withoutExcluded(allData, cfg);
  const rules: Record<string, string[]> = {};
  for (const rule of [...cfg.danger, ...cfg.rules]) {
    const pool = rule.category === "all" ? data.tickers : data.tickers.filter((tk) => (tk.category ?? "") === rule.category);
    rules[rule.name] = runScreen(pool, rule.conditions, rule.mode)
      .filter((r) => r.matched)
      .map((r) => r.ticker.symbol);
  }
  return { dataDate, rules };
}

/** 特別注意：關注的股票（和設了價位的股票）今天發生的大事 */
export interface Alert {
  ticker: ScreenerTicker;
  reasons: string[];
}

const last2 = (tk: ScreenerTicker): [number | null, number] => {
  const c = tk.daily.close;
  return [c.length >= 2 ? c[c.length - 2] : null, c[c.length - 1] ?? tk.lastClose];
};

export function findAlerts(data: ScreenerData, cfg: NotifyConfig, danger: SignalHit[]): Alert[] {
  const bySymbol = new Map(data.tickers.map((tk) => [tk.symbol, tk]));
  const out = new Map<string, Alert>();
  const add = (tk: ScreenerTicker, reason: string) => {
    const a = out.get(tk.symbol) ?? { ticker: tk, reasons: [] };
    if (!a.reasons.includes(reason)) a.reasons.push(reason);
    out.set(tk.symbol, a);
  };
  for (const sym of cfg.watch) {
    const tk = bySymbol.get(sym);
    if (!tk) continue;
    if (Math.abs(tk.changePct) >= cfg.bigMovePct) add(tk, tk.changePct > 0 ? `單日大漲 ${fmtPct(tk.changePct)}` : `單日大跌 ${fmtPct(tk.changePct)}`);
    const f = tk.fundamentals;
    if (f?.high52w && tk.lastClose >= f.high52w * (1 - cfg.near52wPct / 100)) add(tk, "接近 52 週新高");
    if (f?.low52w && tk.lastClose <= f.low52w * (1 + cfg.near52wPct / 100)) add(tk, "接近 52 週新低");
  }
  // 價位：用「昨天收盤 → 今天收盤」有沒有穿越，避免價格一直停在價位上方時天天通知
  for (const a of cfg.priceAlerts) {
    const tk = bySymbol.get(a.symbol);
    if (!tk) continue;
    const [prev, now] = last2(tk);
    if (a.above !== null && now >= a.above && (prev === null || prev < a.above)) add(tk, `漲破 ${a.above}`);
    if (a.below !== null && now <= a.below && (prev === null || prev > a.below)) add(tk, `跌破 ${a.below}`);
  }
  // 關注的股票出現危險訊號
  const w = new Set(cfg.watch);
  for (const d of danger) if (w.has(d.ticker.symbol)) for (const r of d.rules) add(d.ticker, `⚠️ ${r}`);
  // 依關注清單的順序
  const order = (s: string) => {
    const i = cfg.watch.indexOf(s);
    return i < 0 ? 999 : i;
  };
  return [...out.values()].sort((a, b) => order(a.ticker.symbol) - order(b.ticker.symbol));
}

// ---------------------------------------------------------------------------
// Discord 訊息
// ---------------------------------------------------------------------------

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  footer?: { text: string };
}

export interface DiscordMessage {
  content: string;
  embeds: DiscordEmbed[];
}

/** Discord 的上限：embed 說明 4096 字、一則訊息所有 embed 合計 6000 字、最多 10 個 embed */
export const LIMITS = { description: 4096, message: 6000, embeds: 10, content: 2000 };

const COLOR = { alert: 0xd9363e, market: 0x6366f1, watch: 0x0ea5e9, danger: 0xf97316, bull: 0x118a5c };

export function fmtPct(v: number): string {
  // 用真正的減號「−」：在 Discord 上比「-」清楚
  return `${v > 0 ? "▲ +" : v < 0 ? "▼ −" : ""}${Math.abs(v).toFixed(2)}%`;
}

const link = (cfg: NotifyConfig, tk: ScreenerTicker) => `[${tk.symbol}](${cfg.siteUrl}#/${encodeURIComponent(tk.symbol)}/daily)`;
const price = (tk: ScreenerTicker) => tk.lastClose.toFixed(2);

/** 把多行文字放進 embed，超過上限就截斷並註明還有幾行 */
export function fitLines(lines: string[], limit: number): string {
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const next = out ? `${out}\n${lines[i]}` : lines[i];
    const rest = lines.length - i - 1;
    // 預留「…還有 N 項」的空間
    if (next.length > limit - (rest > 0 ? 20 : 0)) return `${out}\n…還有 ${lines.length - i} 項`;
    out = next;
  }
  return out;
}

/** 一檔股票的白話狀態：RSI、MACD、均線（和網站「現在的狀態」卡片同一套判斷） */
export function stockLine(tk: ScreenerTicker): string {
  const s = tk.daily;
  const i = s.close.length - 1;
  const parts: string[] = [];
  const rsi = rsiStatus(s.rsi[i] ?? null);
  if (rsi) parts.push(`RSI ${rsi.value} ${rsi.tag}`);
  const macd = macdStatus(s.macd[i] ?? null, s.signal[i] ?? null, s.hist[i] ?? null, i > 0 ? (s.hist[i - 1] ?? null) : null);
  if (macd) parts.push(`MACD ${macd.tag}`);
  const ma = maStatus(s.close[i], s.ma20[i] ?? null, s.ma50[i] ?? null, s.ma200[i] ?? null);
  if (ma) parts.push(`均線 ${ma.tag}`);
  return parts.join("｜");
}

/**
 * 組成要送出的訊息（每則 = 一段文字 + 幾張彩色卡片）：
 *   第 1 則（有大事才有）：🚨 特別注意 —— 手機通知預覽會先看到這則
 *   第 2 則：📊 每日摘要 —— 市場、我關注的股票、⚠️ 危險訊號、✅ 偏多訊號（0 檔的不列）
 */
export function buildMessages(allData: ScreenerData, cfg: NotifyConfig, dataDate: string, previous: NotifyState | null): DiscordMessage[] {
  const data = withoutExcluded(allData, cfg);
  const messages: DiscordMessage[] = [];
  const danger = evaluateSignals(data, cfg.danger, previous, cfg.watch);
  const bull = evaluateSignals(data, cfg.rules, previous, cfg.watch);
  const alerts = findAlerts(data, cfg, danger);
  const footer = { text: "僅供學習參考，非投資建議 · 設定在 config/notify.json" };
  const day = dataDate.slice(5).replace("-", "/");

  if (alerts.length > 0) {
    // 文字部分會出現在手機通知預覽：直接寫重點
    const preview = alerts.map((a) => `${a.ticker.symbol} ${a.reasons[0].replace("⚠️ ", "")}`).join("、");
    messages.push({
      content: `🚨 **特別注意（${day}）**：${preview}`.slice(0, LIMITS.content),
      embeds: [
        {
          title: "🚨 特別注意",
          color: COLOR.alert,
          description: fitLines(
            alerts.map((a) => `**${link(cfg, a.ticker)}** ${price(a.ticker)}　${fmtPct(a.ticker.changePct)}\n　${a.reasons.join("、")}`),
            LIMITS.description,
          ),
        },
      ],
    });
  }

  const embeds: DiscordEmbed[] = [];
  // 市場摘要
  const bySymbol = new Map(data.tickers.map((tk) => [tk.symbol, tk]));
  const asSummary = data.tickers as unknown as TickerSummary[]; // 只用到 symbol／name／changePct，欄位相容
  const b = breadth(asSummary, "day");
  const market: string[] = cfg.benchmarks
    .map((s) => bySymbol.get(s))
    .filter((tk): tk is ScreenerTicker => !!tk)
    .map((tk) => `**${tk.symbol}** ${price(tk)}　${fmtPct(tk.changePct)}`);
  market.push(`上漲 **${b.up}**・下跌 **${b.down}**・平盤 ${b.flat}（共 ${data.tickers.length} 檔）`);
  if (cfg.topMovers > 0) {
    const fmt = (list: ReturnType<typeof topMovers>) => list.map((m) => `${m.ticker.symbol} ${fmtPct(m.change)}`).join("、") || "無";
    market.push(`漲幅前 ${cfg.topMovers}：${fmt(topMovers(asSummary, "day", cfg.topMovers, "up"))}`);
    market.push(`跌幅前 ${cfg.topMovers}：${fmt(topMovers(asSummary, "day", cfg.topMovers, "down"))}`);
  }
  embeds.push({ title: `📊 市場摘要（${dataDate} 收盤）`, color: COLOR.market, description: fitLines(market, LIMITS.description) });

  // 我關注的股票
  const watched = cfg.watch.map((s) => bySymbol.get(s)).filter((tk): tk is ScreenerTicker => !!tk);
  if (watched.length > 0) {
    embeds.push({
      title: "👀 我關注的股票",
      color: COLOR.watch,
      description: fitLines(
        watched.map((tk) => `**${link(cfg, tk)}** ${price(tk)}　${fmtPct(tk.changePct)}\n　${stockLine(tk)}`),
        LIMITS.description,
      ),
    });
  }

  const signalLines = (hits: SignalHit[]) =>
    hits.map((h) => `${h.isNew ? "🆕 " : ""}**${link(cfg, h.ticker)}** ${fmtPct(h.ticker.changePct)}　${h.rules.join("・")}`);
  if (danger.length > 0) embeds.push({ title: `⚠️ 危險訊號（${danger.length} 檔）`, color: COLOR.danger, description: fitLines(signalLines(danger), LIMITS.description) });
  if (bull.length > 0) embeds.push({ title: `✅ 偏多訊號（${bull.length} 檔）`, color: COLOR.bull, description: fitLines(signalLines(bull), LIMITS.description) });
  embeds[embeds.length - 1].footer = footer;

  // 一則訊息的卡片合計超過 6000 字就拆成兩則
  let cur: DiscordEmbed[] = [];
  let size = 0;
  const flush = (content: string) => {
    if (cur.length) messages.push({ content, embeds: cur });
    cur = [];
    size = 0;
  };
  let first = true;
  for (const e of embeds) {
    const len = e.title.length + e.description.length + (e.footer?.text.length ?? 0);
    if (cur.length && (size + len > LIMITS.message || cur.length >= LIMITS.embeds)) {
      flush(first ? `📊 **每日摘要（${day}）**` : "");
      first = false;
    }
    cur.push(e);
    size += len;
  }
  flush(first ? `📊 **每日摘要（${day}）**` : "");
  return messages;
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
