const { chromium, devices } = require('playwright');
const U = 'https://stock-dashboard-peach-sigma.vercel.app/';
// 程式內建的範例持股（src/lib/portfolio.ts 的 sampleHoldings），不是任何人的真實持股
const SAMPLE = [["VOO",10,500,"core",null,null],["MSFT",5,400,"core",null,null],["0050.TW",1000,80,"core",null,null],["NVDA",20,140,"short",25,15],["TSLA",5,350,"short",null,null],["PLTR",10,180,"short",null,null]]
  .map(([symbol, shares, cost, type, tpPct, slPct], i) => ({ id: "s" + i, symbol, shares, cost, type, tpPct, slPct }));
(async () => {
  const out = process.argv[2]; const b = await chromium.launch();
  const ctx = async (opts, seed) => {
    const c = await b.newContext({ serviceWorkers: 'block', locale: 'zh-TW', ...opts });
    if (seed) await c.addInitScript((h) => { localStorage.setItem("stockdash:portfolio:holdings", JSON.stringify(h)); localStorage.setItem("stockdash:portfolio:isSample", "false"); }, SAMPLE);
    return c;
  };
  const D = { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 };
  // 首頁：只截持股損益＋訊號（不截新聞標題）
  { const c = await ctx({ ...D, colorScheme: 'light', viewport: { width: 1280, height: 2000 } }, true); const p = await c.newPage();
    await p.goto(U + '#/today'); await p.waitForSelector('.lv-row'); await p.waitForTimeout(3000); await p.mouse.move(1, 1);
    const top = await p.locator('.today .market-head').boundingBox(); const sig = await p.locator('#today-signals').locator('xpath=..').boundingBox();
    await p.screenshot({ path: `${out}/today.png`, clip: { x: 0, y: 0, width: 1280, height: Math.ceil(sig.y + sig.height + 16) } }); await c.close(); }
  const shot = async (opts, url, file, fn, seed = false) => { const c = await ctx(opts, seed); const p = await c.newPage(); await p.goto(U + url); await p.waitForTimeout(2500); if (fn) await fn(p); await p.mouse.move(1, 1); await p.screenshot({ path: `${out}/${file}` }); await c.close(); };
  await shot({ ...D, colorScheme: 'dark' }, '#/NVDA/daily', 'chart.png');
  await shot({ ...D, colorScheme: 'light' }, '#/market', 'market.png');
  await shot({ ...D, colorScheme: 'dark' }, '#/screener', 'screener.png', async (p) => { await p.getByRole('button', { name: '多頭排列（站上 20／50／200 日線）' }).click(); await p.waitForTimeout(400); });
  await shot({ ...D, colorScheme: 'light' }, '#/portfolio', 'portfolio.png');
  await shot({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 1.5, colorScheme: 'light' }, '#/analysis', 'analysis.png', async (p) => {
    const box = await p.locator('.card', { hasText: '相關係數熱力圖' }).boundingBox(); await p.setViewportSize({ width: 1280, height: Math.ceil(box.y + box.height + 16) }); });
  { const c = await ctx({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 1.5, colorScheme: 'light' }); const p = await c.newPage();
    await p.goto(U + '#/analysis'); await p.waitForTimeout(3000); await p.locator('.card', { hasText: '回測：買進持有' }).screenshot({ path: `${out}/backtest.png` }); await c.close(); }
  await shot({ ...devices['iPhone 13'], colorScheme: 'dark' }, '#/today', 'mobile.png', async (p) => { await p.waitForSelector('.lv-row'); await p.waitForTimeout(1500); }, true);
  await b.close();
})();
