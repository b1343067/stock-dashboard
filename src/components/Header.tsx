// 頁首：Logo、分頁、快速搜尋（按 / 聚焦）、紅漲綠跌與深淺色切換
// 手機版的分頁改到畫面底部（BottomNav），這裡的分頁會隱藏。

import { useEffect, useMemo, useRef, useState } from "react";
import type { IndexData, TickerSummary } from "../lib/types";
import { useStoredState } from "../lib/storage";
import { ANALYSIS_HREF, PORTFOLIO_HREF, SCREENER_HREF, type Page } from "../lib/route";
import { matchesQuery } from "../lib/watchlist";

interface Props {
  index: IndexData | null;
  redUp: boolean;
  onToggleRedUp: () => void;
  page: Page;
  /** 「看盤」分頁要連到哪裡（最後看的那檔股票） */
  chartHref: string;
  /** 從搜尋框選到某一檔 */
  onPickSymbol: (symbol: string) => void;
}

type ThemePref = "auto" | "light" | "dark";
const THEME_LABEL: Record<ThemePref, string> = { auto: "跟隨系統", light: "淺色", dark: "深色" };
const NEXT: Record<ThemePref, ThemePref> = { auto: "light", light: "dark", dark: "auto" };

export const NAV_ITEMS = (chartHref: string): [Page, string, string, string][] => [
  ["chart", "看盤", "看盤", chartHref],
  ["screener", "篩選器", "篩選", SCREENER_HREF],
  ["portfolio", "投資組合", "組合", PORTFOLIO_HREF],
  ["analysis", "組合分析", "分析", ANALYSIS_HREF],
];

export default function Header({ index, redUp, onToggleRedUp, page, chartHref, onPickSymbol }: Props) {
  const [theme, setTheme] = useStoredState<ThemePref>("theme", "auto");

  // 把主題寫到 <html data-theme="...">，CSS 會依此切換顏色
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  const updated = index ? formatTaipei(index.generatedAt) : null;

  return (
    <header className="header">
      <a className="brand" href={chartHref} aria-label="投資看盤首頁">
        <span className="brand-mark" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 14 14">
            <path d="M2 10 L5.5 6 L8 8.5 L12 3" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="brand-name">投資看盤</span>
      </a>

      <nav className="tabs" aria-label="頁面">
        {NAV_ITEMS(chartHref).map(([p, label, , href]) => (
          <a key={p} href={href} className={page === p ? "active" : ""} aria-current={page === p ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>

      <QuickSearch tickers={index?.tickers ?? []} onPick={onPickSymbol} />

      <div className="header-actions">
        {updated && <span className="updated muted" title="資料更新時間（台北）">更新 {updated}</span>}
        <button type="button" className="hdr-btn updown-btn" onClick={onToggleRedUp} title="切換漲跌顏色" aria-label={redUp ? "目前紅漲綠跌，點擊切換" : "目前綠漲紅跌，點擊切換"}>
          <span className={redUp ? "num-red" : "num-green"}>漲</span>
          <span className={redUp ? "num-green" : "num-red"}>跌</span>
        </button>
        <button
          type="button"
          className="hdr-btn"
          onClick={() => setTheme(NEXT[theme])}
          title={`主題：${THEME_LABEL[theme]}（點擊切換）`}
          aria-label={`主題：${THEME_LABEL[theme]}，點擊切換`}
        >
          <ThemeIcon theme={theme} />
        </button>
      </div>
    </header>
  );
}

/** 快速搜尋：輸入代號或名稱，下拉選單選一檔就跳到看盤頁。按 / 可以從任何地方聚焦。 */
function QuickSearch({ tickers, onPick }: { tickers: TickerSummary[]; onPick: (s: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => (q.trim() ? tickers.filter((t) => matchesQuery(t, q)).slice(0, 8) : []), [q, tickers]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (s: string) => {
    onPick(s);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="quick-search" role="combobox" aria-expanded={open && results.length > 0} aria-haspopup="listbox">
      <span className="qs-icon" aria-hidden="true">⌕</span>
      <input
        ref={inputRef}
        type="search"
        placeholder={`搜尋 ${tickers.length || ""} 檔代號或名稱`}
        aria-label="快速搜尋股票"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && results[active]) pick(results[active].symbol);
          else if (e.key === "Escape") inputRef.current?.blur();
        }}
      />
      <kbd className="qs-kbd" aria-hidden="true">/</kbd>
      {open && results.length > 0 && (
        <ul className="qs-list" role="listbox">
          {results.map((t, i) => (
            <li key={t.symbol} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? "active" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(t.symbol)}>
                <b>{t.symbol}</b>
                <span className="muted">{t.name}</span>
                {t.category && <span className="qs-cat">{t.category}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ThemeIcon({ theme }: { theme: ThemePref }) {
  if (theme === "light")
    return (
      <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="10" cy="10" r="3.5" />
        <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" strokeLinecap="round" />
      </svg>
    );
  if (theme === "dark")
    return (
      <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" />
    </svg>
  );
}

function formatTaipei(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
