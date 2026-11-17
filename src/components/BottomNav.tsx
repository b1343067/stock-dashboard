// 手機版底部導覽列（桌機版用頁首的分頁，這個會被 CSS 隱藏）

import type { ReactNode } from "react";
import type { Page } from "../lib/route";
import { NAV_ITEMS, navActive } from "./Header";
import { t } from "../lib/i18n";

// 只有出現在導覽列的頁面需要圖示（比較頁從看盤頁、市場總覽進入，不在導覽列）
const ICONS: Partial<Record<Page, ReactNode>> = {
  today: (
    <>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </>
  ),
  market: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </>
  ),
  chart: <path d="M3 15l4-5 3 3 6-8" />,
  screener: <path d="M3 5h14M6 10h8M8.5 15h3" />,
  portfolio: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3v7h7" />
    </>
  ),
};

export default function BottomNav({ page, chartHref }: { page: Page; chartHref: string }) {
  return (
    <nav className="bottom-nav" aria-label={t("頁面（手機）")}>
      {NAV_ITEMS(chartHref).map(([p, , short, href]) => (
        <a key={p} href={href} className={navActive(page) === p ? "active" : ""} aria-current={navActive(page) === p ? "page" : undefined}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONS[p]}
          </svg>
          {short}
        </a>
      ))}
    </nav>
  );
}
