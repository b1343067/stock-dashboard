// 手機版底部導覽列（桌機版用頁首的分頁，這個會被 CSS 隱藏）

import type { ReactNode } from "react";
import type { Page } from "../lib/route";
import { NAV_ITEMS } from "./Header";

const ICONS: Record<Page, ReactNode> = {
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
  analysis: <path d="M4 16V9M10 16V4M16 16v-5" />,
};

export default function BottomNav({ page, chartHref }: { page: Page; chartHref: string }) {
  return (
    <nav className="bottom-nav" aria-label="頁面（手機）">
      {NAV_ITEMS(chartHref).map(([p, , short, href]) => (
        <a key={p} href={href} className={page === p ? "active" : ""} aria-current={page === p ? "page" : undefined}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONS[p]}
          </svg>
          {short}
        </a>
      ))}
    </nav>
  );
}
