// AI 辦公室的等角像素場景（原創，全部用程式畫，不用任何外部圖片）
// 做法：在 400×316 的小畫布上一格一格畫，再用 CSS 放大（image-rendering: pixelated）。
// 牆、窗、地板這些不會動的部分只在主題改變時畫一次存起來；家具、角色、螢幕每一格重畫，
// 大約每秒 8 格；分頁在背景時瀏覽器會自動暫停；使用者設定「減少動態」時只畫一張靜態圖。
// 角色頭上的名牌、物件（門、窗、電視、看板、書櫃）上的標籤都是 HTML 連結／按鈕，
// 可以用鍵盤與螢幕報讀器操作；辦公室頁不顯示底部導覽列，改由這些物件切換頁面。

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { isDarkColor, NAV_SPOTS, project, ROOM, SCENE_H, SCENE_W, SEATS, shade, SIT_Z, spans, spotPosition, tagPosition, WALL_H, type Pt } from "../../lib/iso";
import { ROLE_NAME, ROLE_ORDER } from "../../lib/aiReport";
import { t } from "../../lib/i18n";
import { MARKET_HREF, PORTFOLIO_HREF, SCREENER_HREF, TODAY_HREF, type Page } from "../../lib/route";
import { useThemeColors } from "../../lib/theme";
import type { AiRoleKey } from "../../lib/types";

interface Props {
  /** 每個角色今天有沒有報告（沒有 = 休假中，座位空著） */
  present: Record<AiRoleKey, boolean>;
  loading: boolean;
  redUp: boolean;
  /** 看盤頁的連結（記得上次看的股票） */
  chartHref: string;
  onOpen: (role: AiRoleKey) => void;
  /** 疊在房間上的資訊（報告日期、範例標示等） */
  children?: ReactNode;
}

type Ctx = CanvasRenderingContext2D;
/** 顏色表；night = "1" 表示深色主題（畫夜景），up／down = 漲跌顏色（跟著紅漲綠跌設定） */
type Palette = Record<string, string>;

const VARS = [
  "--iso-wall", "--iso-floor", "--iso-sky", "--iso-city", "--iso-lit", "--iso-desk", "--iso-metal", "--iso-screen", "--iso-plant", "--iso-pot", "--iso-rug", "--iso-board", "--iso-fire",
  "--office-skin", "--office-hair-1", "--office-hair-2", "--office-hair-3", "--office-ink", "--office-mug", "--office-chair",
  "--s1", "--s2", "--s3", "--s4", "--accent-strong", "--red", "--green",
];

function readPalette(redUp: boolean): Palette {
  const cs = getComputedStyle(document.documentElement);
  const p: Record<string, string> = {};
  for (const v of VARS) p[v] = cs.getPropertyValue(v).trim() || "#888888";
  return { ...p, night: isDarkColor(p["--iso-wall"]) ? "1" : "", up: redUp ? p["--red"] : p["--green"], down: redUp ? p["--green"] : p["--red"] };
}

// ---------------------------------------------------------------------------
// 基本畫法
// ---------------------------------------------------------------------------
function poly(ctx: Ctx, pts: Pt[], color: string) {
  ctx.fillStyle = color;
  for (const [y, x, w] of spans(pts)) ctx.fillRect(x, y, w, 1);
}
function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
function line(ctx: Ctx, a: Pt, b: Pt, color: string) {
  ctx.fillStyle = color;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(a[0] + ((b[0] - a[0]) * i) / n), Math.round(a[1] + ((b[1] - a[1]) * i) / n), 1, 1);
}
const P = project;

/**
 * 長方體：看得到上面、+y 面（左前）、+x 面（右前），三面深淺不同就有立體感；
 * 再沿著輪廓描一圈深色邊，像素畫才有清楚的形狀。
 */
function box(ctx: Ctx, x: number, y: number, z: number, w: number, d: number, h: number, color: string, outline = true) {
  poly(ctx, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(color, -0.12));
  poly(ctx, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], shade(color, -0.26));
  poly(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], color);
  if (outline && h > 0) {
    const e = shade(color, -0.5);
    line(ctx, P(x, y + d, z + h), P(x + w, y + d, z + h), shade(color, 0.25)); // 上緣亮邊
    line(ctx, P(x + w, y + d, z), P(x + w, y + d, z + h), shade(color, -0.35));
    line(ctx, P(x, y, z + h), P(x, y + d, z + h), e);
    line(ctx, P(x, y, z + h), P(x + w, y, z + h), e);
    line(ctx, P(x + w, y, z + h), P(x + w, y, z), e);
    line(ctx, P(x, y + d, z + h), P(x, y + d, z), e);
    line(ctx, P(x, y + d, z), P(x + w, y + d, z), e);
    line(ctx, P(x + w, y + d, z), P(x + w, y, z), e);
  }
}
/** 地上的影子（半透明菱形） */
function shadow(ctx: Ctx, x: number, y: number, w: number, d: number, alpha = 0.14) {
  poly(ctx, [P(x, y), P(x + w, y), P(x + w, y + d), P(x, y + d)], `rgba(0,0,0,${alpha})`);
}
/** 左牆（x = 0 平面）上的長方形 */
function wallL(ctx: Ctx, y0: number, y1: number, z0: number, z1: number, color: string, x = 0) {
  poly(ctx, [P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)], color);
}
/** 右牆（y = 0 平面）上的長方形 */
function wallR(ctx: Ctx, x0: number, x1: number, z0: number, z1: number, color: string, y = 0) {
  poly(ctx, [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)], color);
}

// ---------------------------------------------------------------------------
// 背景：牆、窗外景色、牆上的東西、地板（不會動的部分，主題改變時才重畫）
// ---------------------------------------------------------------------------
function drawRoom(ctx: Ctx, c: Palette) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  const wall = c["--iso-wall"];
  const wallLc = shade(wall, -0.1);

  // 牆面＋上緣厚邊＋踢腳板
  wallL(ctx, 0, ROOM, 0, WALL_H, wallLc);
  wallR(ctx, 0, ROOM, 0, WALL_H, wall);
  wallL(ctx, 0, ROOM, WALL_H - 4, WALL_H, shade(wall, -0.32));
  wallR(ctx, 0, ROOM, WALL_H - 4, WALL_H, shade(wall, -0.24));
  wallL(ctx, 0, ROOM, 0, 4, shade(wall, -0.38));
  wallR(ctx, 0, ROOM, 0, 4, shade(wall, -0.3));
  line(ctx, P(0, 0, 0), P(0, 0, WALL_H), shade(wall, -0.3)); // 牆角

  // ---- 左牆：一整排落地窗，窗外是城市（淺色白天、深色夜景）----
  const y0 = 0.5;
  const y1 = 5.3;
  const zb = 14;
  const zt = 98;
  const sky = c["--iso-sky"];
  // 天空漸層：一層一層的色帶（像素畫常見的作法）
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const za = zb + ((zt - zb) * i) / bands;
    const zz = zb + ((zt - zb) * (i + 1)) / bands;
    const k = i / (bands - 1);
    wallL(ctx, y0, y1, za, zz, c.night ? shade(sky, -0.35 * k) : shade(sky, 0.35 - 0.4 * k));
  }
  if (c.night) {
    for (const [sy, sz] of [[0.9, 92], [1.7, 86], [2.6, 94], [3.3, 89], [4.1, 95], [4.8, 85], [2.1, 80]]) {
      const [x, y] = P(0, sy, sz);
      px(ctx, x, y, 1, 1, c["--iso-lit"]);
    }
    const [mx, my] = P(0, 4.3, 84); // 月亮
    px(ctx, mx - 2, my - 2, 4, 4, shade(c["--iso-lit"], 0.4));
  } else {
    for (const [cy, cz, cw] of [[1.2, 86, 0.9], [3.2, 90, 1.2], [4.3, 80, 0.7]]) {
      wallL(ctx, cy, cy + cw, cz, cz + 3, shade(sky, 0.7));
      wallL(ctx, cy + 0.2, cy + cw - 0.2, cz + 3, cz + 5, shade(sky, 0.7));
    }
  }
  // 遠景大樓（較淡）＋近景大樓（較深、有窗戶）
  const city = c["--iso-city"];
  const far = [34, 46, 30, 52, 40, 58, 36, 44, 50, 32, 42, 38];
  far.forEach((h, i) => {
    const a = y0 + (i * (y1 - y0)) / far.length;
    wallL(ctx, a, a + (y1 - y0) / far.length, zb, zb + h, c.night ? shade(city, -0.15) : shade(city, 0.3));
  });
  const near = [22, 38, 18, 44, 28, 34, 16, 40, 26, 30];
  const step = (y1 - y0) / near.length;
  near.forEach((h, i) => {
    const a = y0 + i * step;
    wallL(ctx, a + 0.03, a + step * 0.92, zb, zb + h, city);
    wallL(ctx, a + 0.03, a + step * 0.92, zb + h - 2, zb + h, shade(city, 0.15));
    for (let z = zb + 4; z < zb + h - 4; z += 5) {
      for (let j = 0; j < 2; j++) {
        if ((i * 3 + z + j * 5) % 4 !== 0) {
          const wa = a + step * (0.2 + j * 0.38);
          wallL(ctx, wa, wa + step * 0.18, z, z + 2, c.night ? c["--iso-lit"] : shade(city, -0.2));
        }
      }
    }
  });
  // 窗框：上下、每一片之間的直框、窗台
  const frame = c["--iso-metal"];
  wallL(ctx, y0 - 0.06, y1 + 0.06, zb - 3, zb, frame);
  wallL(ctx, y0 - 0.06, y1 + 0.06, zt, zt + 3, frame);
  for (let i = 0; i <= 4; i++) {
    const y = y0 + (i * (y1 - y0)) / 4;
    wallL(ctx, y - 0.05, y + 0.05, zb, zt, frame);
  }
  wallL(ctx, y0, y1, 54, 55, shade(frame, 0.3)); // 橫框
  poly(ctx, [P(0, y0 - 0.06, zb - 3), P(0.25, y0 - 0.06, zb - 3), P(0.25, y1 + 0.06, zb - 3), P(0, y1 + 0.06, zb - 3)], shade(wall, -0.2)); // 窗台
  // 玻璃反光
  for (let i = 0; i < 4; i++) {
    const y = y0 + (i * (y1 - y0)) / 4 + 0.25;
    line(ctx, P(0, y, zb + 30), P(0, y + 0.35, zb + 52), "rgba(255,255,255,0.25)");
  }

  // 左牆前段：滅火器、掛畫（山景）
  wallL(ctx, 5.7, 7.7, 66, 96, shade(c["--iso-floor"], -0.4));
  wallL(ctx, 5.8, 7.6, 68, 94, c.night ? shade(sky, -0.1) : shade(sky, 0.2));
  poly(ctx, [P(0, 5.9, 68), P(0, 6.7, 84), P(0, 7.5, 68)], c["--iso-plant"]);
  poly(ctx, [P(0, 6.4, 68), P(0, 7.0, 78), P(0, 7.5, 68)], shade(c["--iso-plant"], -0.25));
  wallL(ctx, 6.9, 7.2, 86, 89, c["--iso-lit"]);

  // ---- 右牆：看板（篩選器）、大電視（看盤）、時鐘、門 ----
  const board = c["--iso-board"];
  // 看板：三欄（待辦／進行中／完成），每欄幾張卡片
  wallR(ctx, 0.5, 2.5, 40, 92, shade(board, -0.45));
  wallR(ctx, 0.58, 2.42, 42, 90, board);
  const cols = [c["--s1"], c["--s4"], c["--s3"]];
  cols.forEach((col, i) => {
    const xa = 0.66 + i * 0.6;
    wallR(ctx, xa, xa + 0.52, 84, 88, col);
    for (let k = 0; k < 4 - i; k++) {
      const zc = 74 - k * 9;
      wallR(ctx, xa + 0.04, xa + 0.48, zc, zc + 7, shade(col, 0.55));
      wallR(ctx, xa + 0.08, xa + 0.36, zc + 4, zc + 5, shade(col, -0.2));
    }
  });
  // 電視下的矮櫃在 drawFurniture；電視外框（畫面在 drawWallScreens，會動）
  wallR(ctx, 2.9, 4.6, 46, 82, c["--iso-metal"]);
  wallR(ctx, 3.65, 3.85, 42, 46, c["--iso-metal"]);
  // 門：門框、門板、兩片凹板、把手、上方的綠色出口標示
  const wood = shade(c["--iso-floor"], -0.15);
  wallR(ctx, 5.8, 7.1, 0, 78, shade(wood, -0.4));
  wallR(ctx, 5.9, 7.0, 0, 75, wood);
  wallR(ctx, 6.05, 6.85, 44, 68, shade(wood, -0.12));
  wallR(ctx, 6.05, 6.85, 10, 38, shade(wood, -0.12));
  wallR(ctx, 6.82, 6.92, 36, 40, c["--iso-board"]);
  wallR(ctx, 6.2, 6.7, 84, 90, "#1f9d55");
  wallR(ctx, 6.3, 6.6, 86, 88, "#d8f5e3");
  // 時鐘外框（指針在 drawWallScreens）
  wallR(ctx, 4.95, 5.45, 76, 92, shade(board, -0.5));
  wallR(ctx, 5.0, 5.4, 78, 90, board);

  // ---- 地板：木地板（每一條木板深淺略不同、錯開的接縫）----
  const floor = c["--iso-floor"];
  const plank = 0.4;
  for (let k = 0; k < ROOM / plank; k++) {
    const ya = k * plank;
    const tone = [0, 0.04, -0.03, 0.02, -0.05][k % 5];
    poly(ctx, [P(0, ya), P(ROOM, ya), P(ROOM, ya + plank), P(0, ya + plank)], tone >= 0 ? shade(floor, tone) : shade(floor, tone));
    line(ctx, P(0, ya), P(ROOM, ya), shade(floor, -0.14));
    for (let xs = (k * 1.3) % 2.4; xs < ROOM; xs += 2.4) line(ctx, P(xs, ya), P(xs, ya + plank), shade(floor, -0.14));
  }
  // 牆邊的陰影（讓牆和地板接得自然）
  poly(ctx, [P(0, 0), P(0.35, 0.35), P(0.35, ROOM), P(0, ROOM)], "rgba(0,0,0,0.08)");
  poly(ctx, [P(0, 0), P(ROOM, 0), P(ROOM, 0.35), P(0.35, 0.35)], "rgba(0,0,0,0.08)");
  // 窗戶照進來的光（白天明顯、晚上淡淡的）
  for (let i = 0; i < 4; i++) {
    const a = y0 + (i * (y1 - y0)) / 4 + 0.15;
    const b = a + (y1 - y0) / 4 - 0.3;
    poly(ctx, [P(0, a), P(0, b), P(2.4, b + 1.0), P(2.4, a + 1.0)], c.night ? "rgba(140,160,255,0.06)" : "rgba(255,250,220,0.22)");
  }
  // ---- 立體模型感：牆的厚度（上緣與兩端）、地板的厚度 ----
  // 讓房間看起來像一個「剖開的模型」，而不是一張平面貼圖
  const T = 0.18; // 牆厚（格）
  const cap = shade(wall, 0.18);
  poly(ctx, [P(-T, 0, WALL_H), P(0, 0, WALL_H), P(0, ROOM, WALL_H), P(-T, ROOM, WALL_H)], cap);
  poly(ctx, [P(0, -T, WALL_H), P(ROOM, -T, WALL_H), P(ROOM, 0, WALL_H), P(0, 0, WALL_H)], cap);
  poly(ctx, [P(-T, -T, WALL_H), P(0, -T, WALL_H), P(0, 0, WALL_H), P(-T, 0, WALL_H)], cap);
  poly(ctx, [P(-T, ROOM, -8), P(0, ROOM, -8), P(0, ROOM, WALL_H), P(-T, ROOM, WALL_H)], shade(wall, -0.3)); // 左牆末端
  poly(ctx, [P(ROOM, -T, -8), P(ROOM, 0, -8), P(ROOM, 0, WALL_H), P(ROOM, -T, WALL_H)], shade(wall, -0.42)); // 右牆末端
  const slab = shade(c["--iso-floor"], -0.45);
  poly(ctx, [P(0, ROOM, 0), P(ROOM, ROOM, 0), P(ROOM, ROOM, -8), P(0, ROOM, -8)], slab); // 地板左前側面
  poly(ctx, [P(ROOM, 0, 0), P(ROOM, ROOM, 0), P(ROOM, ROOM, -8), P(ROOM, 0, -8)], shade(slab, -0.25)); // 右前側面
  line(ctx, P(0, ROOM, 0), P(ROOM, ROOM, 0), shade(c["--iso-floor"], 0.15)); // 地板邊緣亮線
  line(ctx, P(ROOM, 0, 0), P(ROOM, ROOM, 0), shade(c["--iso-floor"], 0.05));
  line(ctx, P(-T, 0, WALL_H), P(-T, ROOM, WALL_H), shade(wall, -0.2));
  line(ctx, P(0, -T, WALL_H), P(ROOM, -T, WALL_H), shade(wall, -0.2));

  // 主管桌下的地毯（有邊框）
  poly(ctx, [P(5.6, 4.4), P(ROOM - 0.1, 4.4), P(ROOM - 0.1, 7.6), P(5.6, 7.6)], shade(c["--iso-rug"], -0.2));
  poly(ctx, [P(5.75, 4.55), P(ROOM - 0.25, 4.55), P(ROOM - 0.25, 7.45), P(5.75, 7.45)], c["--iso-rug"]);
}

// ---------------------------------------------------------------------------
// 會動的牆面：電視上的 K 線、時鐘指針
// ---------------------------------------------------------------------------
function drawWallScreens(ctx: Ctx, c: Palette, frame: number) {
  wallR(ctx, 2.97, 4.53, 48, 80, c["--iso-screen"]);
  // 格線
  for (const z of [56, 64, 72]) wallR(ctx, 3.0, 4.5, z, z + 1, shade(c["--iso-screen"], 0.12));
  // K 線：最後一根會慢慢長（像盤中在跳動）
  const bars = [[54, 6, 1], [57, 5, 0], [55, 7, 1], [59, 6, 1], [62, 4, 0], [60, 8, 1], [64, 6, 1], [67, 5, 0], [65, 7, 1]];
  bars.forEach(([z, h, up], i) => {
    const x = 3.07 + i * 0.15;
    const hh = i === bars.length - 1 ? 3 + (frame % 8) : h;
    wallR(ctx, x + 0.04, x + 0.06, z - 2, z + hh + 2, up ? c.up : c.down);
    wallR(ctx, x, x + 0.1, z, z + hh, up ? c.up : c.down);
  });
  // 均線
  for (let i = 0; i < 8; i++) line(ctx, P(3.1 + i * 0.15, 0, 58 + i * 1.3), P(3.25 + i * 0.15, 0, 58 + (i + 1) * 1.3), c["--s4"]);
  // 時鐘：秒針每秒走一格（12 個位置）
  const [cx, cy] = P(5.2, 0, 84);
  px(ctx, cx, cy - 4, 1, 4, c["--office-ink"]);
  const sec = Math.floor(frame / 8) % 12;
  const ang = (sec / 12) * Math.PI * 2;
  px(ctx, cx + Math.round(Math.sin(ang) * 3), cy - Math.round(Math.cos(ang) * 3), 1, 1, c["--red"]);
}

// ---------------------------------------------------------------------------
// 家具
// ---------------------------------------------------------------------------
function plant(ctx: Ctx, c: Palette, x: number, y: number, size: 1 | 2 | 3) {
  const pot = c["--iso-pot"];
  const ph = 6 + size * 3;
  shadow(ctx, x - 0.1, y - 0.1, 0.8, 0.8);
  box(ctx, x, y, 0, 0.6, 0.6, ph, pot);
  box(ctx, x - 0.04, y - 0.04, ph, 0.68, 0.68, 2, shade(pot, 0.1));
  const [sx, sy] = P(x + 0.3, y + 0.3, ph + 2);
  const g = c["--iso-plant"];
  const dark = shade(g, -0.28);
  const light = shade(g, 0.25);
  // 葉子：幾片往外長的長條，層層疊上去
  const leaves: [number, number, number, number, string][] =
    size === 3
      ? [[-10, -14, 6, 12, dark], [5, -16, 6, 14, dark], [-7, -26, 6, 14, g], [2, -30, 6, 16, g], [-3, -40, 5, 14, light], [-12, -8, 7, 6, g], [6, -9, 7, 6, g], [-2, -20, 4, 18, dark]]
      : size === 2
        ? [[-8, -10, 5, 9, dark], [4, -11, 5, 10, dark], [-5, -18, 5, 11, g], [1, -21, 5, 12, light], [-9, -5, 6, 5, g], [4, -6, 6, 5, g]]
        : [[-6, -7, 5, 7, dark], [2, -8, 5, 8, g], [-3, -13, 5, 8, light]];
  for (const [dx, dy, w, h, col] of leaves) px(ctx, sx + dx, sy + dy, w, h, col);
}

function monitor(ctx: Ctx, c: Palette, x: number, y: number, z: number, faceFront: boolean, w = 0.8) {
  const metal = c["--iso-metal"];
  box(ctx, x + w / 2 - 0.08, y + 0.02, z, 0.16, 0.12, 4, shade(metal, 0.2), false); // 底座
  box(ctx, x + w / 2 - 0.04, y + 0.03, z + 4, 0.08, 0.06, 3, metal, false);
  box(ctx, x, y, z + 7, w, 0.08, 15, metal);
  if (faceFront) poly(ctx, [P(x + 0.06, y + 0.08, z + 9), P(x + w - 0.06, y + 0.08, z + 9), P(x + w - 0.06, y + 0.08, z + 20), P(x + 0.06, y + 0.08, z + 20)], c["--iso-screen"]);
}

/** 螢幕內容（依角色不同：K 線、新聞、長條圖、多空對照） */
function screenContent(ctx: Ctx, c: Palette, kind: AiRoleKey, x: number, y: number, z: number, frame: number, on: boolean, w = 0.8) {
  const yy = y + 0.08;
  const at = (fx: number, fz: number) => P(x + 0.1 + fx * (w - 0.2), yy, z + 10 + fz);
  if (!on) {
    const [a, b] = at(0.45, 4);
    px(ctx, a, b, 2, 1, shade(c["--iso-screen"], 0.2)); // 待機小燈
    return;
  }
  if (kind === "fundamental") {
    [4, 7, 5, 9, 6].forEach((h, i) => {
      const [a, b] = at(i / 5, 0);
      px(ctx, a, b - h, 2, h, i === 3 ? c["--s3"] : shade(c["--s3"], -0.25));
    });
  } else if (kind === "debate") {
    const [a, b] = at(0.05, 2);
    px(ctx, a, b - 6, 5, 6, c.up);
    const [d, e] = at(0.55, 2);
    px(ctx, d, e - 6, 5, 6, c.down);
    if (frame % 4 < 2) px(ctx, a + 1, b - 9, 3, 1, c.up);
  } else {
    for (let i = 0; i < 5; i++) {
      const [a, b] = at(i / 5, 2 + ((i * 3 + frame) % 5));
      px(ctx, a, b - 3, 1, 4, (i + frame) % 3 ? c.up : c.down);
    }
  }
}

function chairBack(ctx: Ctx, c: Palette, x: number, y: number, facing: "front" | "back") {
  const col = c["--office-chair"];
  const [sx, sy] = P(x, y);
  if (facing === "front") {
    // 面向畫面的人：椅背在他後面（比較高、露出肩膀兩側）
    px(ctx, sx - 8, sy - SIT_Z - 22, 16, 20, shade(col, -0.25));
    px(ctx, sx - 7, sy - SIT_Z - 21, 14, 18, shade(col, 0.08));
    px(ctx, sx - 7, sy - SIT_Z - 21, 14, 2, shade(col, 0.3));
  } else {
    // 背對畫面的人：椅背擋住腰部
    px(ctx, sx - 8, sy - SIT_Z - 12, 16, 13, shade(col, -0.3));
    px(ctx, sx - 7, sy - SIT_Z - 11, 14, 11, shade(col, 0.06));
    px(ctx, sx - 7, sy - SIT_Z - 11, 14, 2, shade(col, 0.3));
    px(ctx, sx - 1, sy - SIT_Z, 2, 3, shade(col, -0.4));
  }
}
function chairSeat(ctx: Ctx, c: Palette, x: number, y: number) {
  const col = c["--office-chair"];
  const [sx, sy] = P(x, y);
  shadow(ctx, x - 0.35, y - 0.35, 0.7, 0.7, 0.16);
  // 五爪腳＋輪子、氣壓桿、座墊
  px(ctx, sx - 8, sy - 1, 16, 1, shade(col, -0.4));
  px(ctx, sx - 4, sy - 2, 8, 1, shade(col, -0.4));
  for (const dx of [-9, -1, 7]) px(ctx, sx + dx, sy, 2, 2, shade(col, -0.55));
  px(ctx, sx - 1, sy - SIT_Z + 3, 2, SIT_Z - 4, shade(col, -0.35));
  px(ctx, sx - 8, sy - SIT_Z, 16, 4, col);
  px(ctx, sx - 8, sy - SIT_Z, 16, 1, shade(col, 0.25));
}

// ---------------------------------------------------------------------------
// 角色（畫面座標的小精靈圖：身體 12×12、頭 10×10）
// ---------------------------------------------------------------------------
function person(ctx: Ctx, c: Palette, role: AiRoleKey, frame: number) {
  const s = SEATS[role];
  const [sx, sy] = P(s.x, s.y);
  const shirt = c[s.shirt];
  const hair = c[s.hair];
  const skin = c["--office-skin"];
  const ink = c["--office-ink"];
  const bob = s.action === "idle" && Math.floor(frame / 6) % 2 ? 1 : 0;
  const hip = Math.round(sy - SIT_Z + bob);
  const x = Math.round(sx);
  const top = hip - 12;
  const headY = top - 10;

  // 腿（背對畫面時從椅子兩側露出膝蓋和鞋子）
  if (s.facing === "back") {
    px(ctx, x - 7, hip - 1, 4, 5, shade(c["--office-chair"], -0.5));
    px(ctx, x + 3, hip - 1, 4, 5, shade(c["--office-chair"], -0.5));
  }
  // 身體：衣服、兩側陰影、肩膀亮邊
  px(ctx, x - 6, top, 12, 12, shirt);
  px(ctx, x - 6, top, 12, 1, shade(shirt, 0.22));
  px(ctx, x - 6, top + 1, 1, 11, shade(shirt, -0.2));
  px(ctx, x + 5, top + 1, 1, 11, shade(shirt, -0.2));
  if (s.facing === "front") {
    px(ctx, x - 2, top, 4, 2, shade(shirt, -0.3)); // 領口
    if (role === "lead") {
      px(ctx, x - 2, top, 4, 3, c["--iso-board"]); // 襯衫領子
      px(ctx, x, top + 2, 1, 6, c["--red"]); // 領帶
    } else {
      px(ctx, x - 1, top, 2, 1, skin);
    }
  }
  // 頭
  px(ctx, x - 5, headY, 10, 10, skin);
  px(ctx, x + 4, headY + 1, 1, 9, shade(skin, -0.12));
  if (s.facing === "front") {
    // 髮型
    px(ctx, x - 5, headY - 1, 10, 3, hair);
    if (s.style === "short") {
      px(ctx, x - 4, headY - 2, 3, 1, hair);
      px(ctx, x + 1, headY - 2, 3, 1, hair);
      px(ctx, x - 5, headY + 2, 1, 2, hair);
    } else if (s.style === "long") {
      px(ctx, x - 6, headY, 2, 13, hair);
      px(ctx, x + 4, headY, 2, 13, hair);
      px(ctx, x - 3, headY + 2, 3, 1, hair);
    } else if (s.style === "neat") {
      px(ctx, x - 5, headY + 2, 3, 1, hair);
      px(ctx, x + 4, headY + 2, 1, 2, hair);
    }
    // 眼睛、眼鏡、腮紅、嘴巴（眨眼：偶爾閉眼一格）
    const blink = frame % 40 === 0;
    const eyeH = blink ? 1 : 2;
    px(ctx, x - 3, headY + 5 + (blink ? 1 : 0), 1, eyeH, ink);
    px(ctx, x + 2, headY + 5 + (blink ? 1 : 0), 1, eyeH, ink);
    if (s.glasses) {
      px(ctx, x - 4, headY + 4, 3, 1, ink);
      px(ctx, x + 1, headY + 4, 3, 1, ink);
      px(ctx, x - 1, headY + 5, 2, 1, ink);
    }
    px(ctx, x - 4, headY + 7, 1, 1, shade(c["--red"], 0.45));
    px(ctx, x + 3, headY + 7, 1, 1, shade(c["--red"], 0.45));
    px(ctx, x - 1, headY + 8, 2, 1, shade(skin, -0.3));
  } else {
    // 背面：頭髮蓋住後腦，露出耳朵和脖子
    px(ctx, x - 5, headY - 1, 10, 10, hair);
    px(ctx, x - 4, headY - 1, 6, 1, shade(hair, 0.2));
    px(ctx, x - 6, headY + 4, 1, 3, skin);
    px(ctx, x + 5, headY + 4, 1, 3, skin);
    if (s.style === "bun") {
      px(ctx, x - 2, headY - 5, 5, 4, hair);
      px(ctx, x - 1, headY - 5, 2, 1, shade(hair, 0.2));
    } else if (s.style === "curly") {
      for (const [dx, dy] of [[-6, 0], [5, 0], [-6, 3], [5, 3], [-4, -2], [-1, -2], [2, -2]]) px(ctx, x + dx, headY + dy, 2, 2, hair);
    }
  }
  // 手：打字時左右手交替上下
  const typing = s.action === "typing";
  const flip = frame % 2 === 0;
  const armL = typing && flip ? 1 : 0;
  const armR = typing && !flip ? 1 : 0;
  const sleeve = shade(shirt, -0.12);
  if (s.facing === "front") {
    px(ctx, x - 9, top + 2 - armL, 3, 8, sleeve);
    px(ctx, x + 6, top + 2 - armR, 3, 8, sleeve);
    px(ctx, x - 9, top + 10 - armL, 3, 2, skin);
    px(ctx, x + 6, top + 10 - armR, 3, 2, skin);
  } else {
    px(ctx, x - 9, top + 1 + armL, 3, 9, sleeve);
    px(ctx, x + 6, top + 1 + armR, 3, 9, sleeve);
  }
  if (s.action === "coffee") {
    // 每 3 秒舉杯一次（約 0.75 秒），杯子冒熱氣
    const sip = frame % 24 >= 18;
    const mx = x + 7;
    const my = sip ? headY + 5 : top + 6;
    px(ctx, mx, my, 5, 5, c["--office-mug"]);
    px(ctx, mx + 5, my + 1, 1, 3, c["--office-mug"]);
    px(ctx, mx, my, 5, 1, shade(c["--office-mug"], -0.35));
    px(ctx, mx + 1, my + 2, 3, 1, c["--s2"]);
    px(ctx, mx - 1, my + 3, 2, 2, skin);
    if (!sip) {
      const st = frame % 6;
      px(ctx, mx + 1 + (st > 2 ? 1 : 0), my - 3 - (st % 3), 1, 2, "rgba(255,255,255,0.7)");
    }
  }
  if (s.action === "idle") {
    // 辯論中：頭上輪流冒出「漲」「跌」的箭頭（顏色跟著紅漲綠跌設定）
    const phase = Math.floor(frame / 10) % 3;
    if (phase < 2) {
      const by = headY - 14;
      const bx = x + 4;
      px(ctx, bx, by, 13, 9, c["--iso-board"]);
      px(ctx, bx - 1, by + 1, 15, 7, c["--iso-board"]);
      px(ctx, bx + 1, by + 9, 3, 2, c["--iso-board"]);
      const col = phase === 0 ? c.up : c.down;
      if (phase === 0) {
        px(ctx, bx + 6, by + 2, 1, 1, col);
        px(ctx, bx + 5, by + 3, 3, 1, col);
        px(ctx, bx + 4, by + 4, 5, 1, col);
        px(ctx, bx + 6, by + 5, 1, 2, col);
      } else {
        px(ctx, bx + 6, by + 2, 1, 2, col);
        px(ctx, bx + 4, by + 4, 5, 1, col);
        px(ctx, bx + 5, by + 5, 3, 1, col);
        px(ctx, bx + 6, by + 6, 1, 1, col);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 整個場景（依前後順序：後面的先畫，前面的蓋上去）
// ---------------------------------------------------------------------------
function drawFrame(ctx: Ctx, bg: HTMLCanvasElement, c: Palette, present: Record<AiRoleKey, boolean>, frame: number) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  ctx.drawImage(bg, 0, 0);
  drawWallScreens(ctx, c, frame);
  const desk = c["--iso-desk"];
  const metal = c["--iso-metal"];
  const on = present;

  // ---- 靠後牆的東西 ----
  plant(ctx, c, 0.15, 0.15, 3);
  // 電視下的矮櫃＋小盆栽、文件夾
  shadow(ctx, 2.9, 0, 1.7, 0.7);
  box(ctx, 2.9, 0, 0, 1.7, 0.55, 18, shade(c["--iso-floor"], -0.3));
  line(ctx, P(3.75, 0.55, 2), P(3.75, 0.55, 16), shade(c["--iso-floor"], -0.55));
  box(ctx, 3.0, 0.1, 18, 0.3, 0.3, 6, c["--iso-pot"]);
  px(ctx, P(3.15, 0.25, 24)[0] - 3, P(3.15, 0.25, 24)[1] - 6, 6, 6, c["--iso-plant"]);
  for (let i = 0; i < 3; i++) box(ctx, 4.0 + i * 0.12, 0.1, 18, 0.1, 0.35, 8, [c["--s1"], c["--s2"], c["--s3"]][i], false);
  // 飲水機
  shadow(ctx, 4.95, 0.05, 0.6, 0.6);
  box(ctx, 5.0, 0.05, 0, 0.45, 0.45, 30, c["--iso-board"]);
  box(ctx, 5.05, 0.1, 30, 0.35, 0.35, 14, c.night ? shade(c["--iso-sky"], 0.3) : c["--iso-sky"]);
  px(ctx, P(5.2, 0.5, 20)[0] - 1, P(5.2, 0.5, 20)[1], 2, 2, c["--s1"]);
  plant(ctx, c, 7.25, 0.2, 2);
  // 印表機（左牆窗戶下）
  shadow(ctx, 0.05, 5.55, 0.8, 0.8);
  box(ctx, 0.05, 5.5, 0, 0.7, 0.7, 16, shade(metal, 0.5));
  box(ctx, 0.1, 5.55, 16, 0.6, 0.6, 7, c["--iso-board"]);
  box(ctx, 0.2, 5.65, 23, 0.35, 0.4, 1, "#ffffff", false);

  // ---- 後排兩位（面向畫面）：椅背 → 人（桌子會蓋住下半身）----
  for (const r of ["tech", "news"] as AiRoleKey[]) {
    const s = SEATS[r];
    chairBack(ctx, c, s.x, s.y, "front");
    if (on[r]) person(ctx, c, r, frame);
  }

  // ---- 長桌 ----
  const tx0 = 1.2;
  const tx1 = 6.6;
  const ty0 = 2.65;
  const ty1 = 3.95;
  shadow(ctx, tx0 - 0.1, ty0, tx1 - tx0 + 0.3, ty1 - ty0 + 0.4, 0.12);
  // 桌腳（兩端的板子）、抽屜櫃
  box(ctx, tx0 + 0.05, ty0 + 0.1, 0, 0.1, ty1 - ty0 - 0.2, 15, metal);
  box(ctx, tx1 - 0.15, ty0 + 0.1, 0, 0.1, ty1 - ty0 - 0.2, 15, metal);
  box(ctx, 3.55, ty0 + 0.6, 0, 0.6, 0.65, 14, shade(desk, -0.15));
  line(ctx, P(3.6, ty1 - 0.05, 9), P(4.1, ty1 - 0.05, 9), shade(desk, -0.45));
  line(ctx, P(3.6, ty1 - 0.05, 5), P(4.1, ty1 - 0.05, 5), shade(desk, -0.45));
  box(ctx, tx0, ty0, 15, tx1 - tx0, ty1 - ty0, 3, desk);
  // 後排的螢幕（螢幕朝向後排的人，我們看到背面）＋桌上的東西
  for (const r of ["tech", "news"] as AiRoleKey[]) {
    const sx = SEATS[r].x;
    monitor(ctx, c, sx - 0.88, 3.08, 18, false);
    monitor(ctx, c, sx + 0.08, 3.08, 18, false);
    box(ctx, sx - 0.35, 2.72, 18, 0.7, 0.18, 1, shade(metal, 0.45), false); // 鍵盤
  }
  // 中間的隔板（霧面）
  box(ctx, tx0 + 0.15, 3.28, 18, tx1 - tx0 - 0.3, 0.05, 12, c.night ? shade(c["--iso-sky"], 0.15) : shade(c["--iso-sky"], -0.08));
  // 前排的螢幕（朝向畫面，看得到內容）
  for (const r of ["fundamental", "debate"] as AiRoleKey[]) {
    const sx = SEATS[r].x;
    for (const [mx, k] of [[sx - 0.88, 0], [sx + 0.08, 1]] as const) {
      monitor(ctx, c, mx, 3.42, 18, true);
      screenContent(ctx, c, k === 0 ? r : r === "fundamental" ? "news" : "tech", mx, 3.42, 18, frame + k * 3, on[r]);
    }
    box(ctx, sx - 0.35, 3.62, 18, 0.7, 0.18, 1, shade(metal, 0.45), false); // 鍵盤
    box(ctx, sx + 0.5, 3.66, 18, 0.12, 0.16, 1, shade(metal, 0.3), false); // 滑鼠
  }
  // 桌上的雜物：文件、筆筒、咖啡杯
  box(ctx, 1.5, 3.5, 18, 0.45, 0.32, 1, c["--iso-board"], false);
  box(ctx, 1.55, 3.55, 19, 0.4, 0.3, 1, shade(c["--iso-board"], -0.08), false);
  box(ctx, 6.15, 3.55, 18, 0.15, 0.15, 5, c["--s2"]);
  box(ctx, 6.2, 2.8, 18, 0.15, 0.15, 4, c["--office-mug"]);

  // ---- 前排兩位（背對畫面）：椅座 → 人 → 椅背 ----
  for (const r of ["fundamental", "debate"] as AiRoleKey[]) {
    const s = SEATS[r];
    chairSeat(ctx, c, s.x, s.y);
    if (on[r]) person(ctx, c, r, frame);
    chairBack(ctx, c, s.x, s.y, "back");
  }

  // ---- 左前方：滅火器、書櫃、盆栽 ----
  const [fx, fy] = P(0.12, 5.4, 0);
  px(ctx, fx - 2, fy - 16, 5, 14, c["--iso-fire"]);
  px(ctx, fx - 2, fy - 16, 5, 2, shade(c["--iso-fire"], -0.4));
  px(ctx, fx - 1, fy - 19, 3, 3, c["--office-ink"]);
  px(ctx, fx - 1, fy - 10, 3, 3, c["--iso-board"]);
  const wood = shade(c["--iso-floor"], -0.25);
  shadow(ctx, 0, 6.0, 0.7, 1.9);
  box(ctx, 0, 6.0, 0, 0.55, 1.7, 56, wood);
  // 每一層的書
  const books = [c["--s1"], c["--s2"], c["--s3"], c["--s4"], c["--iso-board"], c["--accent-strong"], c["--s1"], c["--s3"]];
  for (const z of [4, 18, 32, 46]) {
    box(ctx, 0.02, 6.05, z - 1, 0.5, 1.6, 1, shade(wood, -0.2), false);
    books.forEach((col, i) => {
      if ((i + z) % 7 === 0) return; // 少一本，看起來比較自然
      box(ctx, 0.08, 6.12 + i * 0.19, z, 0.38, 0.14, 8 + ((i * 3 + z) % 4), col, false);
    });
  }
  plant(ctx, c, 1.4, 7.1, 2);

  // ---- 主管：植物 → 椅背 → 人 → 桌子（桌子在人前面）----
  plant(ctx, c, 7.35, 3.9, 2);
  const L = SEATS.lead;
  chairBack(ctx, c, L.x, L.y, "front");
  if (on.lead) person(ctx, c, "lead", frame);
  const dx0 = 5.9;
  const dy0 = 5.55;
  shadow(ctx, dx0 - 0.1, dy0, 2.1, 1.3);
  box(ctx, dx0, dy0 + 0.05, 0, 0.12, 0.95, 15, metal);
  box(ctx, dx0 + 1.75, dy0 + 0.05, 0, 0.12, 0.95, 15, metal);
  box(ctx, dx0 + 0.15, dy0 + 0.7, 2, 1.55, 0.08, 11, shade(c["--iso-floor"], -0.35)); // 前擋板
  box(ctx, dx0 - 0.05, dy0, 15, 1.95, 1.05, 3, shade(c["--iso-floor"], -0.2));
  monitor(ctx, c, dx0 + 0.05, dy0 + 0.12, 18, false, 0.9); // 螢幕放桌子左端，才不會擋住主管的臉
  box(ctx, dx0 + 0.1, dy0 + 0.45, 18, 0.4, 0.3, 1, c["--iso-board"], false); // 文件
  box(ctx, dx0 + 1.5, dy0 + 0.4, 18, 0.2, 0.2, 3, c["--iso-lit"]); // 桌燈底座
  px(ctx, P(dx0 + 1.6, dy0 + 0.5, 21)[0], P(dx0 + 1.6, dy0 + 0.5, 21)[1] - 8, 1, 8, metal);
  px(ctx, P(dx0 + 1.6, dy0 + 0.5, 29)[0] - 3, P(dx0 + 1.6, dy0 + 0.5, 29)[1] - 2, 6, 3, c["--iso-lit"]);
  // 訪客椅（背對畫面，空的）
  chairSeat(ctx, c, 6.3, 7.05);
  chairBack(ctx, c, 6.3, 7.05, "back");

  // ---- 天花板吊燈（最前面）----
  for (const lx of [2.0, 4.6]) {
    const [cx, cy] = P(lx + 0.6, 3.3, WALL_H + 6);
    const [, ly] = P(lx + 0.6, 3.3, 84);
    px(ctx, cx, cy, 1, ly - cy, shade(metal, 0.2));
    box(ctx, lx, 3.2, 80, 1.2, 0.2, 4, shade(metal, 0.55));
    line(ctx, P(lx + 0.05, 3.4, 80), P(lx + 1.15, 3.4, 80), c["--iso-lit"]);
    line(ctx, P(lx + 1.2, 3.22, 80), P(lx + 1.2, 3.38, 80), c["--iso-lit"]);
    if (c.night) poly(ctx, [P(lx - 0.2, 3.0, 18), P(lx + 1.4, 3.0, 18), P(lx + 1.4, 3.7, 18), P(lx - 0.2, 3.7, 18)], "rgba(255,230,150,0.08)");
  }
}


// ---------------------------------------------------------------------------
// 光影（畫在放大後的高解析度畫布上，用平滑漸層）
// 像素畫本身維持硬邊；光暈、陰影用柔和的漸層疊上去，看起來比較有氣氛、比較精緻。
// ---------------------------------------------------------------------------
type Glow = { x: number; y: number; z: number; r: number; color: string; a: number; sy?: number };

function glow(ctx: Ctx, S: number, g: Glow) {
  const [px0, py0] = P(g.x, g.y, g.z);
  const cx = px0 * S;
  const cy = py0 * S;
  const sy = g.sy ?? 1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, sy); // 地上的光是扁的橢圓（等角視角）
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, g.r * S);
  grad.addColorStop(0, hexA(g.color, g.a));
  grad.addColorStop(1, hexA(g.color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(-g.r * S, -g.r * S, g.r * 2 * S, g.r * 2 * S);
  ctx.restore();
}

function hexA(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(255,255,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 房間底下的柔和影子（畫在房間之前） */
function drawGroundShadow(ctx: Ctx, S: number) {
  const [cx, cy] = P(ROOM / 2, ROOM / 2, -8);
  ctx.save();
  ctx.translate(cx * S, (cy + 30) * S);
  ctx.scale(1, 0.32);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 190 * S);
  grad.addColorStop(0, "rgba(0,0,0,0.28)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(-190 * S, -190 * S, 380 * S, 380 * S);
  ctx.restore();
}

/** 燈光：只照在房間有畫東西的地方（source-atop），深色（夜晚）時比較明顯 */
function drawLights(ctx: Ctx, S: number, c: Palette, present: Record<AiRoleKey, boolean>, frame: number) {
  const night = !!c.night;
  const k = night ? 1 : 0.45;
  const warm = "#ffd27a";
  const screen = "#8fd3ff";
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  // 夜晚：整間房間先暗一點、四周更暗（暗角），燈光才顯得出來
  if (night) {
    const [cx, cy] = P(ROOM / 2, ROOM / 2, 30);
    const g = ctx.createRadialGradient(cx * S, cy * S, 40 * S, cx * S, cy * S, 230 * S);
    g.addColorStop(0, "rgba(5,8,20,0.05)");
    g.addColorStop(1, "rgba(5,8,20,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SCENE_W * S, SCENE_H * S);
  }
  // 吊燈照在長桌上、燈管本身發光
  for (const lx of [2.0, 4.6]) {
    glow(ctx, S, { x: lx + 0.6, y: 3.3, z: 18, r: 70, color: warm, a: 0.32 * k, sy: 0.55 });
    glow(ctx, S, { x: lx + 0.6, y: 3.3, z: 80, r: 22, color: warm, a: 0.5 * k });
  }
  // 主管桌燈
  glow(ctx, S, { x: 7.5, y: 6.1, z: 24, r: 38, color: warm, a: 0.4 * k, sy: 0.7 });
  // 螢幕光（有人在才亮；打字的人螢幕光會微微閃）
  const flick = frame % 6 < 3 ? 1 : 0.85;
  for (const [r, x] of [["fundamental", 2.4], ["debate", 5.2]] as const) {
    if (present[r]) glow(ctx, S, { x, y: 3.6, z: 26, r: 34, color: screen, a: 0.22 * k * flick });
  }
  for (const [r, x] of [["tech", 2.4], ["news", 5.2]] as const) {
    if (present[r]) glow(ctx, S, { x, y: 2.6, z: 28, r: 26, color: screen, a: 0.2 * k * flick });
  }
  // 電視光
  glow(ctx, S, { x: 3.75, y: 0.2, z: 62, r: 40, color: screen, a: 0.18 * k });
  // 窗戶的光：白天是暖暖的日光、晚上是月光
  for (const y of [1.2, 2.4, 3.6, 4.8]) {
    glow(ctx, S, { x: 0.6, y, z: 40, r: 50, color: night ? "#9fb4ff" : "#fff6dc", a: night ? 0.1 : 0.22 });
  }
  ctx.restore();
}

/** 放大倍數：手機（3 倍螢幕、寬約 390px）與桌機（約 1000px）都夠清楚 */
const SCALE = 4;

const SPOT_HREF: Record<string, string> = { today: TODAY_HREF, market: MARKET_HREF, screener: SCREENER_HREF, portfolio: PORTFOLIO_HREF };

export default function OfficeScene({ present, loading, redUp, chartHref, onOpen, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useThemeColors(); // 只當作「主題變了」的訊號，顏色另外讀
  const key = ROLE_ORDER.map((r) => (present[r] ? 1 : 0)).join("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; // 沒有 canvas（極舊瀏覽器）：只顯示名牌、標籤與下方內容
    const c = readPalette(redUp);
    // 為什麼要放大成整數倍？像素畫直接用 CSS 縮放到非整數倍（例如 0.97×、2.3×）時，
    // 有的像素變 2 格、有的變 3 格，看起來粗糙不平均。先在程式裡放大 S 倍（每個像素都是 S×S），
    // 再讓瀏覽器平滑縮到畫面大小，邊緣就會又清楚又整齊。
    const S = SCALE;
    canvas.width = SCENE_W * S;
    canvas.height = SCENE_H * S;
    const mk = () => {
      const el = document.createElement("canvas");
      el.width = SCENE_W;
      el.height = SCENE_H;
      return el;
    };
    const bg = mk();
    const lo = mk();
    const bctx = bg.getContext("2d");
    const lctx = lo.getContext("2d");
    if (!bctx || !lctx) return;
    drawRoom(bctx, c);

    const render = (frame: number) => {
      drawFrame(lctx, bg, c, present, frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGroundShadow(ctx, S);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(lo, 0, 0, SCENE_W * S, SCENE_H * S);
      drawLights(ctx, S, c, present, frame);
    };

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = -1;
    const tick = (now: number) => {
      const frame = Math.floor(now / 125); // 每秒 8 格
      if (frame !== last) {
        last = frame;
        render(frame);
      }
      raf = requestAnimationFrame(tick);
    };
    if (still) render(1);
    else raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
    // present 用 key 判斷有沒有變（物件每次 render 都是新的）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, redUp, key]);

  const tags = useMemo(() => ROLE_ORDER.map((r) => ({ r, ...tagPosition(r) })), []);
  const hrefOf = (p: Page) => (p === "chart" ? chartHref : SPOT_HREF[p]);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="office-scene">
      <canvas ref={canvasRef} width={SCENE_W * SCALE} height={SCENE_H * SCALE} role="img" aria-label={t("像素風辦公室：5 位 AI 分析師在座位上工作")} />
      {/* 物件的點擊範圍（窗戶、電視、看板、書櫃、門），和標籤連到同一頁 */}
      {NAV_SPOTS.map((s) => (
        <a
          key={`hit-${s.page}`}
          className="office-spot-hit"
          href={hrefOf(s.page)}
          style={{ left: pct(s.hit[0], SCENE_W), top: pct(s.hit[1], SCENE_H), width: pct(s.hit[2], SCENE_W), height: pct(s.hit[3], SCENE_H) }}
          aria-hidden="true"
          tabIndex={-1}
        />
      ))}
      {tags.map(({ r, left, top }) => (
        <span key={`hit-${r}`} className="office-hit" style={{ left: `${left}%`, top: `${top}%` }} onClick={() => onOpen(r)} aria-hidden="true" />
      ))}
      <nav aria-label={t("頁面")}>
        {NAV_SPOTS.map((s) => {
          const p = spotPosition(s.at);
          return (
            <a key={s.page} className="office-spot" href={hrefOf(s.page)} style={{ left: `${p.left}%`, top: `${p.top}%` }}>
              {t(s.label)}
              <span className="office-spot-go" aria-hidden="true">›</span>
            </a>
          );
        })}
      </nav>
      {tags.map(({ r, left, top }) => (
        <button key={r} type="button" className={`office-tag ${present[r] ? "is-done" : "is-off"}`} style={{ left: `${left}%`, top: `${top}%` }} onClick={() => onOpen(r)} aria-haspopup="dialog">
          <i aria-hidden="true" />
          {t(ROLE_NAME[r])}
          {!loading && <span className={present[r] ? "sr-only" : "office-tag-off"}>{present[r] ? t("已完成") : t("休假中")}</span>}
        </button>
      ))}
      {children}
    </div>
  );
}
