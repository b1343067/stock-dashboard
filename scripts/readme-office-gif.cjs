// README 最上面的辦公室動圖：錄線上網站首頁 9 秒（基本面分析師起身走到落地窗前），再用 ffmpeg 轉成 GIF
// 用法：node scripts/readme-office-gif.cjs docs/screenshots   （需要 Playwright 與 ffmpeg）
// 為什麼從第 21 秒開始錄：officeWalk.ts 的 ROUTES 裡基本面分析師 21 秒時起身，這段畫面最有代表性
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const { mkdtempSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const U = process.env.SITE_URL || 'https://stock-dashboard-peach-sigma.vercel.app/';
(async () => {
  const out = process.argv[2] || 'docs/screenshots';
  const dir = mkdtempSync(join(tmpdir(), 'office-gif-'));
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 808, height: 760 }, locale: 'zh-TW', colorScheme: 'light', serviceWorkers: 'block' });
  const p = await c.newPage();
  await p.goto(U);
  await p.waitForSelector('.office-tag.is-done');
  await p.waitForFunction(() => performance.now() > 21000, null, { timeout: 60000, polling: 100 });
  const el = p.locator('.office-scene');
  // 每 100ms 一張，共 90 張（截圖本身要時間，實際間隔會稍長，播放時用 10fps 大致等速）
  for (let i = 0; i < 90; i++) {
    await el.screenshot({ path: join(dir, `f${String(i).padStart(3, '0')}.png`) });
    await p.waitForTimeout(60);
  }
  await b.close();
  // 先產生調色盤再套用，GIF 顏色才不會一格格閃爍；畫面寬度剛好 760px 不縮放，像素畫與文字都保持清楚
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '10', '-i', join(dir, 'f%03d.png'), '-vf', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none', join(out, 'office.gif')]);
  rmSync(dir, { recursive: true, force: true });
  console.log('寫入', join(out, 'office.gif'));
})();
