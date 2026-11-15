// 圖表顏色：從 CSS 變數（src/styles.css 的 :root）讀出來，
// 這樣深色／淺色主題只要在 CSS 改一個地方就好。

import { useEffect, useState } from "react";

export interface ChartColors {
  text: string;
  muted: string;
  grid: string;
  font: string;
  red: string;
  green: string;
  ma10: string;
  ma20: string;
  ma50: string;
  ma200: string;
  bb: string;
  macd: string;
  signal: string;
  rsi: string;
}

function read(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    text: v("--text-2"),
    muted: v("--text-3"),
    grid: v("--grid"),
    font: v("--font-sans"),
    red: v("--red"),
    green: v("--green"),
    ma10: v("--c-ma10"),
    ma20: v("--c-ma20"),
    ma50: v("--c-ma50"),
    ma200: v("--c-ma200"),
    bb: v("--c-bb"),
    macd: v("--c-macd"),
    signal: v("--c-signal"),
    rsi: v("--c-rsi"),
  };
}

/** 回傳目前主題的顏色；系統切換深色模式或手動切換主題時會自動更新 */
export function useThemeColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(read);
  useEffect(() => {
    const update = () => setColors(read());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    // 監看 <html data-theme="..."> 的變化（手動切換主題）
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", update);
      mo.disconnect();
    };
  }, []);
  return colors;
}
