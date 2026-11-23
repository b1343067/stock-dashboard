// AI 投研辦公室：把公開資料整理成「報告素材」（給 Claude Code 排程任務讀，再寫成每日報告）
//
// 為什麼要先整理，不讓 AI 直接讀原始檔？
//   1. 訊號（黃金交叉、RSI 急轉直下…）用網站篩選器同一套程式算，結果和網頁、Discord 一致，AI 不會自己算錯
//   2. 原始檔很大（screener.json 有 49 檔 × 3 週期），整理後只剩重點，AI 比較不會漏看或亂編
//   3. 只放公開資料（觀察清單、config/notify.json），完全沒有持股
// 執行：npm run ai:context（scripts/ai-context.ts 讀檔後呼叫這裡的 buildContext）。測試在 aiContext.test.ts。

import { missedWeekdays, STALE_THRESHOLD } from "./freshness";
import type { EarningsItem, NewsItem } from "./finnhub";
import { breadth, periodChange, topMovers } from "./market";
import type { MlVolData } from "./ml";
import { evaluateSignals, stockLine, withoutExcluded, type NewsBundle, type NotifyConfig } from "./notify";
import type { ScreenerData, ScreenerTicker } from "./screener";
import { statVerdict, verdictText, type SignalStatsFile } from "./signalStats";
import type { IndexData } from "./types";

/** public/data/news.json（scripts/save-news.ts 每天寫） */
export interface NewsFile extends NewsBundle {
  generatedAt: string;
}

export interface ContextInput {
  index: IndexData;
  screener: ScreenerData;
  mlVol: MlVolData | null;
  news: NewsFile | null;
  cfg: NotifyConfig;
  /** 報告日期（台灣時間的今天，YYYY-MM-DD） */
  today: string;
  /** 訊號回測（signal-stats.json）；沒有就是 null */
  stats?: SignalStatsFile | null;
}

const r2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

/** 各市場（幣別）的最新資料日期 */
export function latestDates(index: IndexData): { us: string | null; tw: string | null } {
  const pick = (cur: string) =>
    index.tickers
      .filter((t) => t.currency === cur)
      .map((t) => t.lastDate)
      .sort()
      .at(-1) ?? null;
  return { us: pick("USD"), tw: pick("TWD") };
}

/** 資料過期：落後 3 個平日以上（和頁首提醒同一個門檻） */
export function staleMarkets(dates: { us: string | null; tw: string | null }, today: string): string[] {
  const out: string[] = [];
  if (!dates.us || missedWeekdays(dates.us, today) >= STALE_THRESHOLD) out.push("us");
  if (!dates.tw || missedWeekdays(dates.tw, today) >= STALE_THRESHOLD) out.push("tw");
  return out;
}

/** 基本面整理：本益比、殖利率、距 52 週高低點（%） */
export function fundamentalRows(tickers: ScreenerTicker[]) {
  return tickers
    .filter((t) => t.fundamentals)
    .map((t) => {
      const f = t.fundamentals!;
      return {
        symbol: t.symbol,
        name: t.name,
        pe: r2(f.pe),
        forwardPe: r2(f.forwardPe),
        yieldPct: r2(f.dividendYield),
        fromHigh52w: f.high52w ? r2((t.lastClose / f.high52w - 1) * 100) : null,
        fromLow52w: f.low52w ? r2((t.lastClose / f.low52w - 1) * 100) : null,
      };
    });
}

const top = <T,>(arr: T[], key: (x: T) => number | null, n: number, desc = true) =>
  arr
    .filter((x) => key(x) !== null)
    .sort((a, b) => (desc ? key(b)! - key(a)! : key(a)! - key(b)!))
    .slice(0, n);

const headline = (n: NewsItem) => ({ headline: n.headline, source: n.source, time: new Date(n.datetime * 1000).toISOString().slice(0, 16) + "Z", symbol: n.symbol });

export function buildContext({ index, screener, mlVol, news, cfg, today, stats = null }: ContextInput) {
  const dates = latestDates(index);
  const data = withoutExcluded(screener, cfg);
  const watchSet = new Set(cfg.watch);
  const bySymbol = new Map(data.tickers.map((t) => [t.symbol, t]));
  const sumTickers = index.tickers.filter((t) => !cfg.exclude.includes(t.symbol));

  // ① 技術面：危險／偏多訊號（和 Discord 通知同一套規則；isNew = 今天新出現）
  const sig = (rules: NotifyConfig["danger"]) =>
    evaluateSignals(data, rules, null, cfg.watch).map((h) => ({ symbol: h.ticker.symbol, name: h.ticker.name, changePct: r2(h.ticker.changePct), rules: h.rules, watch: watchSet.has(h.ticker.symbol) }));

  // ② 基本面
  const fund = fundamentalRows(data.tickers);

  // ③ 新聞：只留標題、來源、時間（不轉載內文）；財報只留觀察清單的股票
  const allowed = new Set(index.tickers.map((t) => t.symbol));
  const earnings: EarningsItem[] = (news?.earnings ?? []).filter((e) => allowed.has(e.symbol));

  return {
    reportDate: today,
    rules: "只能使用這份素材裡的資訊；不可以提到觀察清單以外的股票、不可以給買進／賣出建議或目標價",
    dataDates: { ...dates, news: news ? news.generatedAt.slice(0, 10) : null },
    stale: staleMarkets(dates, today),
    allowedSymbols: [...allowed],
    market: {
      regime: mlVol?.regime ?? null,
      benchmarks: cfg.benchmarks
        .map((s) => index.tickers.find((t) => t.symbol === s))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({ symbol: t.symbol, name: t.name, date: t.lastDate, changePct: r2(t.changePct), change30dPct: r2(periodChange(t, "month")) })),
      breadth: breadth(sumTickers, "day"),
      topUp: topMovers(sumTickers, "day", 3, "up").map((m) => ({ symbol: m.ticker.symbol, changePct: r2(m.change) })),
      topDown: topMovers(sumTickers, "day", 3, "down").map((m) => ({ symbol: m.ticker.symbol, changePct: r2(m.change) })),
    },
    tech: {
      danger: sig(cfg.danger),
      bullish: sig(cfg.rules),
      watch: cfg.watch
        .map((s) => bySymbol.get(s))
        .filter((t): t is ScreenerTicker => !!t)
        .map((t) => ({ symbol: t.symbol, name: t.name, date: t.lastDate, changePct: r2(t.changePct), status: stockLine(t) })),
      // 每條規則過去 5 年出現後 20 天的表現（和平常比）：報告可以引用，說明今天的訊號值不值得在意
      ruleHistory: stats
        ? {
            period: `${stats.from} ~ ${stats.to}`,
            baseline20d: { avgPct: stats.baseline.h20.avg, upPct: stats.baseline.h20.win },
            rules: stats.rules
              .filter((r) => r.group !== "preset")
              .map((r) => ({ name: r.name, group: r.group, events: r.events, avg20dPct: r.h20.avg, up20dPct: r.h20.win, verdict: verdictText(r, statVerdict(r, stats.baseline)) })),
          }
        : null,
    },
    fundamental: {
      highestPe: top(fund, (x) => x.pe, 5),
      lowestPe: top(fund, (x) => (x.pe !== null && x.pe > 0 ? x.pe : null), 5, false),
      highestYield: top(fund, (x) => x.yieldPct, 5),
      near52wHigh: top(fund, (x) => (x.fromHigh52w !== null && x.fromHigh52w > -3 ? x.fromHigh52w : null), 5),
      near52wLow: top(fund, (x) => (x.fromLow52w !== null && x.fromLow52w < 5 ? x.fromLow52w : null), 5, false),
      watch: fund.filter((x) => watchSet.has(x.symbol)),
    },
    news: news
      ? {
          generatedAt: news.generatedAt,
          market: (news.market ?? []).slice(0, 8).map(headline),
          watch: Object.fromEntries(Object.entries(news.watch ?? {}).map(([s, l]) => [s, l.slice(0, 3).map(headline)])),
          earnings7d: earnings,
        }
      : null,
  };
}

export type AiContext = ReturnType<typeof buildContext>;
