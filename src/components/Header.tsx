// 頁首：標題、資料更新時間、主題與漲跌顏色設定

import { useEffect } from "react";
import type { IndexData } from "../lib/types";
import { useStoredState } from "../lib/storage";
import { PORTFOLIO_HREF, SCREENER_HREF, type Page } from "../lib/route";

interface Props {
  index: IndexData | null;
  redUp: boolean;
  onToggleRedUp: () => void;
  page: Page;
  /** 「看盤」分頁要連到哪裡（最後看的那檔股票） */
  chartHref: string;
}

type ThemePref = "auto" | "light" | "dark";
const THEME_LABEL: Record<ThemePref, string> = { auto: "自動", light: "淺色", dark: "深色" };
const NEXT: Record<ThemePref, ThemePref> = { auto: "light", light: "dark", dark: "auto" };

export default function Header({ index, redUp, onToggleRedUp, page, chartHref }: Props) {
  const [theme, setTheme] = useStoredState<ThemePref>("theme", "auto");

  // 把主題寫到 <html data-theme="...">，CSS 會依此切換顏色
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  const updated = index ? formatTaipei(index.generatedAt) : null;
  const usdtwd = index?.fx?.USDTWD;

  return (
    <header className="header">
      <div className="brand">
        <h1>投資看盤</h1>
        {updated && (
          <span className="muted small">
            資料更新：{updated}
            {usdtwd ? ` · USD/TWD ${usdtwd.toFixed(2)}` : ""}
          </span>
        )}
      </div>
      <nav className="tabs" aria-label="頁面">
        <a href={chartHref} className={page === "chart" ? "active" : ""} aria-current={page === "chart" ? "page" : undefined}>
          看盤
        </a>
        <a
          href={SCREENER_HREF}
          className={page === "screener" ? "active" : ""}
          aria-current={page === "screener" ? "page" : undefined}
        >
          篩選器
        </a>
        <a
          href={PORTFOLIO_HREF}
          className={page === "portfolio" ? "active" : ""}
          aria-current={page === "portfolio" ? "page" : undefined}
        >
          投資組合
        </a>
      </nav>
      <div className="header-actions">
        <button type="button" className="btn-ghost" onClick={onToggleRedUp} title="切換漲跌顏色">
          {redUp ? (
            <>
              <span className="num-red">紅漲</span>
              <span className="num-green">綠跌</span>
            </>
          ) : (
            <>
              <span className="num-green">綠漲</span>
              <span className="num-red">紅跌</span>
            </>
          )}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setTheme(NEXT[theme])} title="切換主題">
          主題：{THEME_LABEL[theme]}
        </button>
      </div>
    </header>
  );
}

function formatTaipei(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
