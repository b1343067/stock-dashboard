// AI 辦公室（首頁）的像素場景：3/4 俯視角（後牆正對畫面、地板斜看、人物面向畫面）
// 原創繪製，全部用程式一格一格畫，不用任何外部圖片。版面資料與純函式在 lib/officeLayout.ts。
//
// 畫法：
//   1. 在 320×224 的小畫布上畫像素（牆、地板只在主題改變時畫一次；家具與人物每格重畫）
//   2. 整數倍（SCALE）放大到大畫布：每個像素都是 S×S，瀏覽器再平滑縮到畫面大小，邊緣才清楚整齊
//   3. 疊上平滑漸層的光影（吊燈、霓虹燈、螢幕、窗光；深色主題是夜景）
// 動畫每秒 8 格；分頁在背景時瀏覽器自動暫停；使用者設定「減少動態」時只畫一張靜態圖。
// 人物頭上的名牌、物件（門、窗、電視、看板、書櫃）上的標籤都是 HTML 連結／按鈕，可以用鍵盤操作；
// 辦公室頁不顯示底部導覽列，改由這些物件切換頁面。

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  hash01,
  isDarkColor,
  NAV_SPOTS,
  SCENE_H,
  SCENE_W,
  SEATS,
  shade,
  spans,
  spotPosition,
  tagPosition,
  WALL_BOTTOM,
  WALL_LEFT,
  WALL_RIGHT,
  WALL_TOP,
  type Pt,
} from "../../lib/officeLayout";
import { ROLE_NAME, ROLE_ORDER } from "../../lib/aiReport";
import { t } from "../../lib/i18n";
import {
  MARKET_HREF,
  PORTFOLIO_HREF,
  SCREENER_HREF,
  TODAY_HREF,
  type Page,
} from "../../lib/route";
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
  "--iso-wall",
  "--iso-floor",
  "--iso-sky",
  "--iso-city",
  "--iso-lit",
  "--iso-desk",
  "--iso-metal",
  "--iso-screen",
  "--iso-plant",
  "--iso-pot",
  "--iso-rug",
  "--iso-board",
  "--iso-fire",
  "--iso-brick",
  "--iso-beam",
  "--iso-wood",
  "--iso-neon",
  "--office-skin",
  "--office-hair-1",
  "--office-hair-2",
  "--office-hair-3",
  "--office-ink",
  "--office-mug",
  "--office-chair",
  "--s1",
  "--s2",
  "--s3",
  "--s4",
  "--accent-strong",
  "--red",
  "--green",
];

function readPalette(redUp: boolean): Palette {
  const cs = getComputedStyle(document.documentElement);
  const p: Record<string, string> = {};
  for (const v of VARS) p[v] = cs.getPropertyValue(v).trim() || "#888888";
  return {
    ...p,
    night: isDarkColor(p["--iso-wall"]) ? "1" : "",
    up: redUp ? p["--red"] : p["--green"],
    down: redUp ? p["--green"] : p["--red"],
  };
}

// ---------------------------------------------------------------------------
// 基本畫法
// ---------------------------------------------------------------------------
function poly(ctx: Ctx, pts: Pt[], color: string) {
  ctx.fillStyle = color;
  for (const [y, x, w] of spans(pts)) ctx.fillRect(x, y, w, 1);
}
function px(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
/** 有深色外框的長方形（家具的基本形狀） */
function block(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  edge = shade(color, -0.5),
) {
  px(ctx, x, y, w, h, edge);
  px(ctx, x + 1, y + 1, w - 2, h - 2, color);
}
/** 像素圓形（葉叢、燈泡） */
function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.6));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
  }
}
/** 地上的影子（半透明） */
function floorShadow(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h = 3,
  a = 0.18,
) {
  px(ctx, x + 1, y, w - 2, h, `rgba(0,0,0,${a})`);
  px(ctx, x + 3, y + h, w - 6, 1, `rgba(0,0,0,${a * 0.6})`);
}

// 霓虹招牌用的 5×7 像素字（只需要 AI OFFICE 這幾個字母）
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  " ": ["000", "000", "000", "000", "000", "000", "000"],
};
const NEON_TEXT = "AI OFFICE";
const NEON_S = 2;
function textWidth(s: string) {
  return [...s].reduce(
    (w, ch) => w + (FONT[ch][0].length + 1) * NEON_S,
    -NEON_S,
  );
}
function drawText(ctx: Ctx, s: string, x: number, y: number, color: string) {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch];
    g.forEach((row, ry) =>
      [...row].forEach(
        (b, rx) =>
          b === "1" &&
          px(ctx, cx + rx * NEON_S, y + ry * NEON_S, NEON_S, NEON_S, color),
      ),
    );
    cx += (g[0].length + 1) * NEON_S;
  }
}

// ---------------------------------------------------------------------------
// 背景：牆（磚牆、木樑、側牆、窗戶）、地板、牆上的東西（主題改變時才重畫）
// ---------------------------------------------------------------------------
const FLOOR: Pt[] = [
  [WALL_LEFT, WALL_BOTTOM],
  [WALL_RIGHT, WALL_BOTTOM],
  [SCENE_W, WALL_BOTTOM + 20],
  [SCENE_W, SCENE_H],
  [0, SCENE_H],
  [0, WALL_BOTTOM + 20],
];
const LEFT_WALL: Pt[] = [
  [0, 0],
  [WALL_LEFT, WALL_TOP],
  [WALL_LEFT, WALL_BOTTOM],
  [0, WALL_BOTTOM + 20],
];
const RIGHT_WALL: Pt[] = [
  [WALL_RIGHT, WALL_TOP],
  [SCENE_W, 0],
  [SCENE_W, WALL_BOTTOM + 20],
  [WALL_RIGHT, WALL_BOTTOM],
];
/** 左牆上的窗戶（通往「市場」） */
const WINDOW: Pt[] = [
  [3, 18],
  [15, 22],
  [15, 62],
  [3, 72],
];

function drawRoom(ctx: Ctx, c: Palette) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  const night = !!c.night;
  const brick = c["--iso-brick"];
  const beam = c["--iso-beam"];
  const plaster = c["--iso-wall"];

  // ---- 後牆：磚牆（每塊磚深淺略不同、灰縫、錯開排列）----
  px(
    ctx,
    WALL_LEFT,
    WALL_TOP,
    WALL_RIGHT - WALL_LEFT,
    WALL_BOTTOM - WALL_TOP,
    shade(brick, -0.35),
  ); // 灰縫顏色
  for (let row = 0, y = WALL_TOP + 5; y < WALL_BOTTOM - 3; row++, y += 5) {
    const off = row % 2 ? 6 : 0;
    for (let x = WALL_LEFT - off, i = 0; x < WALL_RIGHT; x += 12, i++) {
      const x0 = Math.max(WALL_LEFT, x);
      const x1 = Math.min(WALL_RIGHT, x + 11);
      if (x1 <= x0) continue;
      const v = hash01(row, i) * 0.16 - 0.08;
      px(ctx, x0, y, x1 - x0, 4, shade(brick, v));
      px(ctx, x0, y, x1 - x0, 1, shade(brick, v + 0.1)); // 磚塊上緣亮一點
    }
  }
  // 木樑：上方橫樑、幾根柱子；牆腳的踢腳板
  px(ctx, WALL_LEFT, WALL_TOP, WALL_RIGHT - WALL_LEFT, 5, beam);
  px(
    ctx,
    WALL_LEFT,
    WALL_TOP + 4,
    WALL_RIGHT - WALL_LEFT,
    1,
    shade(beam, -0.35),
  );
  px(ctx, WALL_LEFT, WALL_TOP, WALL_RIGHT - WALL_LEFT, 1, shade(beam, 0.25));
  for (const x of [WALL_LEFT, 258, WALL_RIGHT - 4]) {
    px(ctx, x, WALL_TOP, 4, WALL_BOTTOM - WALL_TOP, beam);
    px(ctx, x, WALL_TOP, 1, WALL_BOTTOM - WALL_TOP, shade(beam, 0.22));
    px(ctx, x + 3, WALL_TOP, 1, WALL_BOTTOM - WALL_TOP, shade(beam, -0.3));
  }
  px(
    ctx,
    WALL_LEFT,
    WALL_BOTTOM - 3,
    WALL_RIGHT - WALL_LEFT,
    3,
    shade(beam, -0.15),
  );

  // ---- 地板：木地板（每條木板深淺不同、錯開的接縫、木紋）----
  const floor = c["--iso-floor"];
  const floorRows = spans(FLOOR);
  for (const [yy, x0, w] of floorRows) {
    const row = Math.floor((yy - WALL_BOTTOM) / 7);
    px(ctx, x0, yy, w, 1, shade(floor, (hash01(row, 7) - 0.5) * 0.12));
  }
  for (let row = 0, y = WALL_BOTTOM; y < SCENE_H; row++, y += 7) {
    px(ctx, 0, y, SCENE_W, 1, shade(floor, -0.18));
    for (let k = 0; k < 6; k++) {
      const sx = Math.floor(hash01(row, k) * SCENE_W);
      px(ctx, sx, y + 1, 1, 6, shade(floor, -0.14)); // 接縫
      px(ctx, (sx + 23) % SCENE_W, y + 3, 4, 1, shade(floor, -0.07)); // 木紋
    }
  }
  // ---- 天花板（後牆上方那一條，用深色木頭）----
  poly(
    ctx,
    [
      [0, 0],
      [SCENE_W, 0],
      [WALL_RIGHT, WALL_TOP],
      [WALL_LEFT, WALL_TOP],
    ],
    shade(beam, -0.35),
  );
  for (let x = 30; x < SCENE_W; x += 40)
    px(ctx, x, 0, 2, WALL_TOP - 1, shade(beam, -0.15)); // 天花板木條
  // ---- 側牆（灰泥牆，比後牆暗一點）----
  poly(ctx, LEFT_WALL, shade(plaster, night ? -0.05 : -0.22));
  poly(ctx, RIGHT_WALL, shade(plaster, night ? -0.12 : -0.3));
  poly(
    ctx,
    [
      [0, 0],
      [WALL_LEFT, WALL_TOP],
      [WALL_LEFT, WALL_TOP + 5],
      [0, 5],
    ],
    beam,
  );
  poly(
    ctx,
    [
      [WALL_RIGHT, WALL_TOP],
      [SCENE_W, 0],
      [SCENE_W, 5],
      [WALL_RIGHT, WALL_TOP + 5],
    ],
    beam,
  );

  // ---- 左牆的窗戶：天空漸層、城市剪影、窗框 ----
  const sky = c["--iso-sky"];
  const city = c["--iso-city"];
  for (const [y, x0, w] of spans(WINDOW)) {
    for (let x = x0; x < x0 + w; x++) {
      const skyline = 46 + Math.floor(hash01(Math.floor(x / 3)) * 14); // 每 3 像素一棟樓
      let col = night
        ? shade(sky, -0.3 + (y - 18) / 140)
        : shade(sky, 0.35 - (y - 18) / 120);
      if (y > skyline)
        col =
          (y + x) % 4 === 0 && night
            ? c["--iso-lit"]
            : shade(city, night ? -0.1 : 0.15);
      px(ctx, x, y, 1, 1, col);
    }
  }
  const frame = c["--iso-beam"];
  poly(
    ctx,
    [
      [1, 16],
      [3, 17],
      [3, 74],
      [1, 75],
    ],
    frame,
  ); // 左框
  poly(
    ctx,
    [
      [15, 21],
      [17, 21],
      [17, 62],
      [15, 63],
    ],
    frame,
  ); // 右框
  poly(
    ctx,
    [
      [2, 17],
      [16, 21],
      [16, 23],
      [2, 19],
    ],
    frame,
  ); // 上框
  poly(
    ctx,
    [
      [2, 71],
      [16, 61],
      [16, 64],
      [2, 74],
    ],
    shade(frame, 0.2),
  ); // 窗台
  poly(
    ctx,
    [
      [8, 18],
      [10, 19],
      [10, 66],
      [8, 68],
    ],
    frame,
  ); // 中間直框
  poly(
    ctx,
    [
      [3, 43],
      [15, 42],
      [15, 43],
      [3, 45],
    ],
    frame,
  ); // 橫框

  // 右牆：時鐘外框（指針在 drawWallAnim）、小掛畫
  disc(ctx, 311, 30, 5, shade(plaster, -0.55));
  disc(ctx, 311, 30, 4, c["--iso-board"]);
  block(ctx, 305, 44, 12, 14, c["--iso-plant"], shade(beam, -0.1));
  px(ctx, 307, 50, 8, 6, shade(c["--iso-plant"], -0.2));

  // 牆腳的陰影
  px(
    ctx,
    WALL_LEFT,
    WALL_BOTTOM,
    WALL_RIGHT - WALL_LEFT,
    2,
    "rgba(0,0,0,0.18)",
  );
  px(
    ctx,
    WALL_LEFT,
    WALL_BOTTOM + 2,
    WALL_RIGHT - WALL_LEFT,
    2,
    "rgba(0,0,0,0.08)",
  );

  // ---- 地毯（中間走道）：邊框＋花紋 ----
  const rug = c["--iso-rug"];
  block(ctx, 120, 104, 80, 70, rug, shade(rug, -0.3));
  px(ctx, 124, 108, 72, 62, shade(rug, -0.08));
  px(ctx, 126, 110, 68, 58, rug);
  for (let i = 0; i < 4; i++) {
    const cy = 118 + i * 14;
    poly(
      ctx,
      [
        [160, cy - 4],
        [166, cy],
        [160, cy + 4],
        [154, cy],
      ],
      shade(rug, -0.18),
    );
    px(ctx, 159, cy - 1, 2, 2, shade(rug, 0.2));
  }
  for (let x = 122; x < 198; x += 4) px(ctx, x, 173, 2, 2, shade(rug, -0.25)); // 流蘇

  // ---- 後牆上的東西：電視外框、看板、門、霓虹招牌鐵架 ----
  block(ctx, 63, 18, 48, 30, c["--iso-metal"], shade(c["--iso-metal"], -0.5)); // 電視（看盤）
  px(ctx, 85, 48, 4, 3, shade(c["--iso-metal"], -0.3));
  const board = c["--iso-board"];
  block(ctx, 210, 15, 46, 36, board, shade(beam, -0.1)); // 看板（篩選）
  px(ctx, 211, 16, 44, 1, "#ffffff");
  [c["--s1"], c["--s4"], c["--s3"]].forEach((col, i) => {
    const x = 214 + i * 14;
    px(ctx, x, 19, 12, 3, col);
    for (let k = 0; k < 3 - (i === 2 ? 1 : 0); k++) {
      block(ctx, x + 1, 24 + k * 8, 10, 7, shade(col, 0.55), shade(col, -0.1));
      px(ctx, x + 3, 26 + k * 8, 6, 1, shade(col, -0.25));
    }
  });
  px(ctx, 214, 48, 38, 2, shade(board, -0.3)); // 筆槽
  px(ctx, 220, 47, 5, 1, c["--red"]);
  px(ctx, 228, 47, 5, 1, c["--s1"]);
  const door = shade(c["--iso-wood"], -0.15); // 門（今日）
  block(
    ctx,
    264,
    22,
    30,
    WALL_BOTTOM - 22,
    shade(door, -0.3),
    shade(door, -0.6),
  );
  px(ctx, 267, 25, 24, WALL_BOTTOM - 25, door);
  block(ctx, 270, 28, 18, 14, shade(door, -0.08), shade(door, -0.3));
  block(ctx, 270, 45, 18, 16, shade(door, -0.08), shade(door, -0.3));
  px(ctx, 286, 44, 2, 3, "#e8c46a");
  block(ctx, 272, 15, 14, 6, "#1f9d55", "#0d5c31"); // 出口燈
  px(ctx, 275, 17, 8, 2, "#d8f5e3");
  const nw = textWidth(NEON_TEXT);
  const nx = Math.round(160 - nw / 2);
  px(ctx, nx - 4, 14, nw + 8, 1, shade(c["--iso-metal"], 0.2));
  px(ctx, nx - 4, 34, nw + 8, 1, shade(c["--iso-metal"], 0.2));
}

// ---------------------------------------------------------------------------
// 會動的牆面：霓虹燈、電視 K 線、時鐘
// ---------------------------------------------------------------------------
function drawWallAnim(ctx: Ctx, c: Palette, frame: number) {
  const night = !!c.night;
  // 霓虹燈：晚上亮、白天是淡淡的燈管顏色；偶爾閃一下
  const nw = textWidth(NEON_TEXT);
  const nx = Math.round(160 - nw / 2);
  const flicker = frame % 97 === 0 || frame % 97 === 2;
  const tube =
    night && !flicker
      ? shade(c["--iso-neon"], 0.45)
      : shade(c["--iso-neon"], night ? -0.1 : 0.25);
  drawText(ctx, NEON_TEXT, nx + 1, 19, shade(c["--iso-neon"], -0.55)); // 燈管的影子
  drawText(ctx, NEON_TEXT, nx, 18, tube);
  if (night && !flicker)
    drawText(ctx, NEON_TEXT, nx, 18, "rgba(255,240,250,0.35)"); // 燈管中心的白光

  // 電視：深色畫面、格線、K 線（最後一根會跳動）
  px(ctx, 65, 20, 44, 26, c["--iso-screen"]);
  for (const y of [27, 34, 41])
    px(ctx, 65, y, 44, 1, shade(c["--iso-screen"], 0.1));
  const bars = [
    [34, 6, 1],
    [32, 5, 0],
    [33, 7, 1],
    [30, 6, 1],
    [28, 5, 0],
    [29, 7, 1],
    [26, 6, 1],
    [24, 5, 0],
    [25, 6, 1],
    [22, 7, 1],
  ];
  bars.forEach(([y, h, up], i) => {
    const x = 67 + i * 4;
    const hh = i === bars.length - 1 ? 3 + (frame % 6) : h;
    const col = up ? c.up : c.down;
    px(ctx, x + 1, y - 2, 1, hh + 4, col);
    px(ctx, x, y, 3, hh, col);
  });
  for (let i = 0; i < 9; i++)
    px(ctx, 68 + i * 4, 38 - i * 1.6, 4, 1, c["--s4"]); // 均線
  px(ctx, 66, 21, 10, 1, "rgba(255,255,255,0.12)"); // 螢幕反光

  // 時鐘（右牆）：秒針每秒走一格
  const sec = Math.floor(frame / 8) % 12;
  const ang = (sec / 12) * Math.PI * 2;
  px(ctx, 311, 27, 1, 3, c["--office-ink"]);
  px(
    ctx,
    311 + Math.round(Math.sin(ang) * 3),
    30 - Math.round(Math.cos(ang) * 3),
    1,
    1,
    c["--red"],
  );
}

// ---------------------------------------------------------------------------
// 家具
// ---------------------------------------------------------------------------
/** 盆栽：陶盆（盆緣、泥土）＋三階明暗的圓形葉叢 */
function plant(
  ctx: Ctx,
  c: Palette,
  cx: number,
  floorY: number,
  size: 1 | 2 | 3,
) {
  const pot = c["--iso-pot"];
  const pw = 8 + size * 2;
  const ph = 7 + size * 2;
  floorShadow(ctx, cx - pw / 2 - 1, floorY - 1, pw + 2);
  block(ctx, cx - pw / 2, floorY - ph, pw, ph, pot);
  px(ctx, cx - pw / 2 - 1, floorY - ph, pw + 2, 3, shade(pot, 0.15));
  px(ctx, cx - pw / 2 + 1, floorY - ph + 3, 2, ph - 4, shade(pot, 0.12));
  const g = c["--iso-plant"];
  const dark = shade(g, -0.32);
  const light = shade(g, 0.3);
  const top = floorY - ph;
  const clumps: [number, number, number][] =
    size === 3
      ? [
          [-7, -8, 6],
          [7, -8, 6],
          [0, -15, 7],
          [-6, -22, 6],
          [6, -22, 6],
          [0, -29, 5],
          [-9, -15, 5],
          [9, -15, 5],
        ]
      : size === 2
        ? [
            [-5, -6, 5],
            [5, -6, 5],
            [0, -11, 6],
            [-3, -16, 4],
            [4, -16, 4],
          ]
        : [
            [-3, -4, 4],
            [3, -4, 4],
            [0, -8, 4],
          ];
  for (const [dx, dy, r] of clumps)
    disc(ctx, cx + dx + 1, top + dy + 1, r, dark);
  for (const [dx, dy, r] of clumps) disc(ctx, cx + dx, top + dy, r - 1, g);
  for (const [dx, dy, r] of clumps)
    disc(ctx, cx + dx - 1, top + dy - 2, Math.max(1, r - 3), light);
  for (const [dx, dy] of clumps) px(ctx, cx + dx + 2, top + dy + 1, 1, 1, dark);
}

/** 桌子：桌面＋前擋板＋一側抽屜櫃＋桌腳 */
function desk(
  ctx: Ctx,
  c: Palette,
  cx: number,
  top: number,
  w: number,
  wood = false,
) {
  const col = wood ? c["--iso-wood"] : c["--iso-desk"];
  const x = Math.round(cx - w / 2);
  const depth = 10;
  const h = 15;
  floorShadow(ctx, x - 1, top + depth + h - 1, w + 2, 4, 0.22);
  block(ctx, x + w - 6, top + depth, 5, h, shade(col, -0.35)); // 桌腳
  block(ctx, x + 1, top + depth, 18, h, shade(col, -0.18)); // 抽屜櫃
  for (const yy of [top + depth + 4, top + depth + 9]) {
    px(ctx, x + 2, yy, 16, 1, shade(col, -0.45));
    px(ctx, x + 8, yy + 2, 4, 1, shade(col, 0.3)); // 抽屜把手
  }
  block(ctx, x, top + depth - 1, w, 6, shade(col, -0.25)); // 前擋板
  block(ctx, x, top, w, depth, col, shade(col, -0.45)); // 桌面
  px(ctx, x + 1, top + 1, w - 2, 1, shade(col, 0.3));
  if (wood)
    for (let i = 0; i < 4; i++)
      px(ctx, x + 4 + i * 17, top + 4 + (i % 2) * 2, 9, 1, shade(col, -0.1)); // 木紋
}

/** 螢幕：底座、支架、外框、畫面內容（依角色不同）、反光 */
function monitor(
  ctx: Ctx,
  c: Palette,
  x: number,
  baseY: number,
  kind: string,
  frame: number,
  on: boolean,
) {
  const metal = c["--iso-metal"];
  px(ctx, x + 6, baseY - 2, 8, 2, shade(metal, 0.2));
  px(ctx, x + 9, baseY - 5, 2, 3, metal);
  block(ctx, x, baseY - 19, 20, 15, metal, shade(metal, -0.5));
  const sx = x + 2;
  const sy = baseY - 17;
  px(ctx, sx, sy, 16, 11, c["--iso-screen"]);
  if (on) {
    if (kind === "bars") {
      [4, 7, 5, 9, 6].forEach((h, i) =>
        px(
          ctx,
          sx + 2 + i * 3,
          sy + 10 - h,
          2,
          h,
          i === 3 ? c["--s3"] : shade(c["--s3"], -0.25),
        ),
      );
    } else if (kind === "split") {
      px(ctx, sx + 2, sy + 3, 5, 6, c.up);
      px(ctx, sx + 9, sy + 3, 5, 6, c.down);
      if (frame % 4 < 2) px(ctx, sx + 3, sy + 1, 3, 1, c.up);
    } else if (kind === "news") {
      for (let i = 0; i < 4; i++)
        px(
          ctx,
          sx + 2,
          sy + 2 + i * 2,
          i === 0 ? 12 : 8 + ((i + frame) % 4),
          1,
          i === 0 ? c["--s2"] : shade(c["--iso-board"], -0.3),
        );
    } else {
      for (let i = 0; i < 5; i++) {
        const h = 2 + ((i * 3 + frame) % 5);
        px(
          ctx,
          sx + 2 + i * 3,
          sy + 9 - h,
          1,
          h,
          (i + frame) % 3 ? c.up : c.down,
        );
      }
    }
  } else {
    px(ctx, sx + 7, sy + 5, 2, 1, shade(c["--iso-screen"], 0.2)); // 待機燈
  }
  px(ctx, sx + 11, sy + 1, 4, 1, "rgba(255,255,255,0.14)"); // 玻璃反光
  px(ctx, x + 17, baseY - 6, 1, 1, on ? "#4ade80" : "#6b7280"); // 電源燈
}

/** 鍵盤（桌面上） */
function keyboard(ctx: Ctx, c: Palette, cx: number, y: number) {
  const base = shade(c["--iso-metal"], 0.35);
  block(ctx, cx - 9, y, 18, 5, base, shade(base, -0.4));
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < 7; k++)
      px(ctx, cx - 7 + k * 2 + (r % 2), y + 1 + r * 2, 1, 1, shade(base, 0.5));
}

/** 辦公椅的椅背（在人的後面） */
function chairBack(ctx: Ctx, c: Palette, cx: number, deskTop: number) {
  const col = c["--office-chair"];
  const x = Math.round(cx);
  const top = deskTop - 26;
  block(ctx, x - 10, top + 2, 20, 26, shade(col, 0.05), shade(col, -0.5));
  px(ctx, x - 9, top + 1, 18, 2, shade(col, -0.5));
  px(ctx, x - 8, top + 2, 16, 2, shade(col, 0.3));
  px(ctx, x - 9, top + 10, 18, 1, shade(col, -0.18)); // 頭枕分隔
}

/** 沙發（左下角休息區） */
function sofa(ctx: Ctx, c: Palette, x: number, y: number) {
  const body = shade(c["--s1"], -0.15);
  floorShadow(ctx, x, y + 24, 46, 3, 0.22);
  block(ctx, x, y, 46, 14, shade(body, -0.1)); // 椅背
  block(ctx, x, y + 12, 46, 13, body); // 座墊
  block(ctx, x - 3, y + 6, 8, 19, shade(body, -0.05)); // 扶手
  block(ctx, x + 41, y + 6, 8, 19, shade(body, -0.05));
  for (const cx of [x + 6, x + 24]) {
    block(ctx, cx, y + 13, 17, 6, shade(body, 0.12));
    px(ctx, cx + 1, y + 14, 15, 1, shade(body, 0.3));
  }
  block(ctx, x + 30, y + 4, 9, 8, c["--s4"]); // 抱枕
  px(ctx, x + 31, y + 5, 7, 1, shade(c["--s4"], 0.3));
}

// ---------------------------------------------------------------------------
// 人物：先畫在小畫布（精靈圖），自動描一圈深色外框再貼到場景上（外框是像素畫精緻的關鍵）。
// 人坐在桌子後面、面向畫面：桌面上緣在精靈圖的 y = SPR_DESK，身體露出、頭 12×11。
// ---------------------------------------------------------------------------
const SPR_W = 52;
const SPR_H = 52;
const SPR_X = 22;
const SPR_DESK = 38;
let sprite: HTMLCanvasElement | null = null;

function outlineSprite(sctx: Ctx, color: [number, number, number]) {
  const img = sctx.getImageData(0, 0, SPR_W, SPR_H);
  const d = img.data;
  const solid = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < SPR_W &&
    y < SPR_H &&
    d[(y * SPR_W + x) * 4 + 3] > 200;
  const add: number[] = [];
  for (let y = 0; y < SPR_H; y++)
    for (let x = 0; x < SPR_W; x++) {
      if (d[(y * SPR_W + x) * 4 + 3] !== 0) continue;
      if (
        solid(x - 1, y) ||
        solid(x + 1, y) ||
        solid(x, y - 1) ||
        solid(x, y + 1)
      )
        add.push((y * SPR_W + x) * 4);
    }
  for (const i of add) {
    d[i] = color[0];
    d[i + 1] = color[1];
    d[i + 2] = color[2];
    d[i + 3] = 235;
  }
  sctx.putImageData(img, 0, 0);
}

function person(ctx: Ctx, c: Palette, role: AiRoleKey, frame: number) {
  if (!sprite) {
    sprite = document.createElement("canvas");
    sprite.width = SPR_W;
    sprite.height = SPR_H;
  }
  const sctx = sprite.getContext("2d", { willReadFrequently: true });
  if (!sctx) return;
  sctx.clearRect(0, 0, SPR_W, SPR_H);
  drawPersonSprite(sctx, c, role, frame);
  outlineSprite(sctx, [22, 20, 34]);
  const s = SEATS[role];
  ctx.drawImage(sprite, Math.round(s.x) - SPR_X, s.desk - SPR_DESK);
}

function drawPersonSprite(
  ctx: Ctx,
  c: Palette,
  role: AiRoleKey,
  frame: number,
) {
  const s = SEATS[role];
  const shirt = c[s.shirt];
  const shirtD = shade(shirt, -0.22);
  const shirtL = shade(shirt, 0.22);
  const hair = c[s.hair];
  const hairL = shade(hair, 0.28);
  const skin = c["--office-skin"];
  const skinD = shade(skin, -0.14);
  const ink = c["--office-ink"];
  const bob = s.action === "idle" && Math.floor(frame / 6) % 2 ? 1 : 0;
  const x = SPR_X;
  const top = SPR_DESK - 10 + bob; // 肩膀
  const headY = top - 11;

  // ---- 身體（只露出桌面以上）----
  if (role === "lead") {
    const suit = shade(shirt, -0.35);
    px(ctx, x - 7, top, 14, 11, suit);
    px(ctx, x - 7, top, 14, 1, shade(suit, 0.25));
    px(ctx, x - 2, top, 4, 10, c["--iso-board"]);
    px(ctx, x - 3, top, 1, 6, shade(suit, 0.15));
    px(ctx, x + 2, top, 1, 6, shade(suit, 0.15));
    px(ctx, x, top + 1, 1, 1, c["--red"]);
    px(ctx, x - 1, top + 2, 2, 8, c["--red"]);
    px(ctx, x - 1, top + 2, 1, 8, shade(c["--red"], 0.25));
  } else {
    px(ctx, x - 7, top, 14, 11, shirt);
    px(ctx, x - 7, top, 14, 1, shirtL);
    px(ctx, x - 7, top + 1, 1, 10, shirtD);
    px(ctx, x + 6, top + 1, 1, 10, shirtD);
    if (role === "tech") {
      px(ctx, x - 4, top - 1, 8, 2, shirtD); // 連帽
      px(ctx, x - 2, top + 1, 1, 5, shirtL);
      px(ctx, x + 1, top + 1, 1, 5, shirtL);
    } else if (role === "debate") {
      px(ctx, x - 3, top, 6, 3, c["--iso-board"]); // 襯衫領子
      px(ctx, x - 1, top + 3, 2, 7, shirtD); // 前襟
      px(ctx, x, top + 4, 1, 1, shirtL);
      px(ctx, x, top + 7, 1, 1, shirtL);
    } else {
      px(ctx, x - 2, top, 4, 2, skin); // 圓領
      px(ctx, x - 2, top + 2, 4, 1, c["--iso-lit"]); // 項鍊
      if (role === "fundamental") px(ctx, x - 7, top + 5, 14, 1, shirtL); // 條紋
    }
  }

  // ---- 頭 ----
  px(ctx, x - 6, headY, 12, 11, skin);
  px(ctx, x + 4, headY + 1, 2, 10, skinD);
  px(ctx, x - 7, headY + 4, 1, 3, skin);
  px(ctx, x + 6, headY + 4, 1, 3, skinD);
  // 髮型
  px(ctx, x - 6, headY - 2, 12, 4, hair);
  px(ctx, x - 5, headY - 3, 10, 1, hair);
  px(ctx, x - 4, headY - 2, 5, 1, hairL);
  if (s.style === "short") {
    px(ctx, x - 6, headY + 2, 2, 2, hair);
    px(ctx, x + 3, headY + 2, 3, 1, hair);
    px(ctx, x - 3, headY - 4, 2, 1, hair);
    px(ctx, x + 1, headY - 4, 2, 1, hair);
  } else if (s.style === "long") {
    px(ctx, x - 8, headY - 1, 3, 17, hair);
    px(ctx, x + 5, headY - 1, 3, 17, hair);
    px(ctx, x - 8, headY, 1, 13, hairL);
    px(ctx, x - 5, headY + 2, 4, 1, hair);
    px(ctx, x + 1, headY + 2, 3, 1, hair);
  } else if (s.style === "neat") {
    px(ctx, x - 6, headY + 2, 4, 1, hair);
    px(ctx, x - 6, headY + 3, 1, 2, hair);
    px(ctx, x + 5, headY + 2, 1, 3, hair);
  } else if (s.style === "bun") {
    px(ctx, x - 3, headY - 8, 6, 5, hair);
    px(ctx, x - 2, headY - 9, 4, 1, hair);
    px(ctx, x - 2, headY - 7, 2, 2, hairL);
    px(ctx, x - 4, headY - 3, 8, 1, c["--s2"]); // 髮圈
    px(ctx, x - 6, headY + 2, 3, 3, hair);
    px(ctx, x + 3, headY + 2, 3, 3, hair);
  } else if (s.style === "curly") {
    for (const [dx, dy] of [
      [-8, -1],
      [6, -1],
      [-8, 3],
      [6, 3],
      [-6, -5],
      [-2, -6],
      [2, -6],
      [5, -4],
      [-8, 7],
      [6, 7],
    ]) {
      px(ctx, x + dx, headY + dy, 3, 3, hair);
      px(ctx, x + dx, headY + dy, 1, 1, hairL);
    }
  }
  // 眉毛、眼睛（眨眼、反光）、眼鏡、腮紅、嘴巴
  const blink = (frame + role.length * 7) % 44 === 0;
  if (!s.glasses) {
    px(ctx, x - 4, headY + 4, 2, 1, shade(hair, -0.1));
    px(ctx, x + 2, headY + 4, 2, 1, shade(hair, -0.1));
  }
  if (blink) {
    px(ctx, x - 4, headY + 6, 2, 1, ink);
    px(ctx, x + 2, headY + 6, 2, 1, ink);
  } else {
    px(ctx, x - 3, headY + 5, 1, 2, ink);
    px(ctx, x + 2, headY + 5, 1, 2, ink);
    px(ctx, x - 4, headY + 5, 1, 1, "#ffffff");
    px(ctx, x + 3, headY + 5, 1, 1, "#ffffff");
  }
  if (s.glasses) {
    px(ctx, x - 5, headY + 4, 4, 1, ink);
    px(ctx, x + 1, headY + 4, 4, 1, ink);
    px(ctx, x - 5, headY + 7, 4, 1, ink);
    px(ctx, x + 1, headY + 7, 4, 1, ink);
    px(ctx, x - 1, headY + 5, 2, 1, ink);
  }
  px(ctx, x - 5, headY + 8, 2, 1, shade(c["--red"], 0.55));
  px(ctx, x + 3, headY + 8, 2, 1, shade(c["--red"], 0.55));
  px(ctx, x - 1, headY + 9, 3, 1, shade(skin, -0.35));

  // ---- 手臂與手（手放在桌面上；打字時左右交替）----
  const typing = s.action === "typing";
  const flip = frame % 2 === 0;
  const armL = typing && flip ? 1 : 0;
  const armR = typing && !flip ? 1 : 0;
  const sleeve = role === "lead" ? shade(shirt, -0.42) : shirtD;
  px(ctx, x - 10, top + 2, 3, 9, sleeve);
  px(ctx, x + 7, top + 2, 3, 9, sleeve);
  if (role === "news") {
    px(ctx, x - 10, top + 6, 3, 1, shirtL); // 捲袖
    px(ctx, x + 7, top + 6, 3, 1, shirtL);
  }
  px(ctx, x - 9, SPR_DESK + 1 - armL, 4, 3, skin);
  px(ctx, x + 5, SPR_DESK + 1 - armR, 4, 3, skin);

  // ---- 喝咖啡：每 3 秒舉杯一次，杯子冒熱氣 ----
  if (s.action === "coffee") {
    const sip = frame % 24 >= 18;
    const mx = x + 9;
    const my = sip ? headY + 5 : SPR_DESK - 4;
    px(ctx, mx, my, 5, 6, c["--office-mug"]);
    px(ctx, mx + 5, my + 1, 2, 3, c["--office-mug"]);
    ctx.clearRect(mx + 5, my + 2, 1, 1);
    px(ctx, mx, my, 5, 1, shade(c["--office-mug"], -0.35));
    px(ctx, mx + 1, my + 3, 3, 1, c["--s2"]);
    if (sip) px(ctx, mx - 2, my + 3, 3, 3, skin);
    else {
      const st = frame % 6;
      px(
        ctx,
        mx + 1 + (st > 2 ? 1 : 0),
        my - 3 - (st % 3),
        1,
        2,
        "rgba(255,255,255,0.6)",
      );
      px(
        ctx,
        mx + 3 - (st > 2 ? 1 : 0),
        my - 5 - (st % 3),
        1,
        2,
        "rgba(255,255,255,0.45)",
      );
    }
  }

  // ---- 辯論中：頭的右邊輪流冒出「漲」「跌」箭頭（顏色跟著紅漲綠跌設定）----
  if (s.action === "idle") {
    const phase = Math.floor(frame / 10) % 3;
    if (phase < 2) {
      const by = headY - 6;
      const bx = x + 10;
      const paper = c["--iso-board"];
      px(ctx, bx, by, 15, 11, paper);
      px(ctx, bx - 1, by + 1, 17, 9, paper);
      px(ctx, bx - 2, by + 8, 3, 2, paper);
      px(ctx, bx - 3, by + 10, 2, 1, paper);
      const col = phase === 0 ? c.up : c.down;
      const ax = bx + 7;
      if (phase === 0) {
        px(ctx, ax, by + 2, 1, 1, col);
        px(ctx, ax - 1, by + 3, 3, 1, col);
        px(ctx, ax - 2, by + 4, 5, 1, col);
        px(ctx, ax - 3, by + 5, 7, 1, col);
        px(ctx, ax - 1, by + 6, 3, 3, col);
      } else {
        px(ctx, ax - 1, by + 2, 3, 3, col);
        px(ctx, ax - 3, by + 5, 7, 1, col);
        px(ctx, ax - 2, by + 6, 5, 1, col);
        px(ctx, ax - 1, by + 7, 3, 1, col);
        px(ctx, ax, by + 8, 1, 1, col);
      }
    }
  }
}

/** 一個工作站：椅背 → 桌子 → 螢幕 → 人 → 桌面前方的小東西 */
function workstation(
  ctx: Ctx,
  c: Palette,
  role: AiRoleKey,
  frame: number,
  on: boolean,
) {
  const s = SEATS[role];
  const lead = role === "lead";
  chairBack(ctx, c, s.x, s.desk);
  desk(ctx, c, s.x, s.desk, s.deskW, lead);
  const mx = s.monitor === "right" ? s.x + 12 : s.x - 32;
  const kind =
    role === "fundamental"
      ? "bars"
      : role === "debate"
        ? "split"
        : role === "news"
          ? "news"
          : "chart";
  monitor(ctx, c, mx, s.desk + 4, kind, frame, on);
  if (on) person(ctx, c, role, frame);
  keyboard(ctx, c, s.x, s.desk + 4);
  // 桌上的小東西：文件、筆筒、名牌、桌燈
  const other = s.monitor === "right" ? s.x - 26 : s.x + 14;
  if (lead) {
    block(ctx, s.x - 34, s.desk - 9, 3, 11, c["--iso-metal"]); // 桌燈
    block(ctx, s.x - 37, s.desk - 12, 9, 4, c["--s4"]);
    block(ctx, s.x - 10, s.desk + 6, 20, 4, c["--iso-beam"]); // 名牌
    px(ctx, s.x - 7, s.desk + 7, 14, 1, "#e8c46a");
  } else {
    block(ctx, other, s.desk + 2, 10, 6, c["--iso-board"]); // 文件
    px(ctx, other + 2, s.desk + 4, 6, 1, shade(c["--iso-board"], -0.3));
    block(ctx, other + 3, s.desk - 4, 4, 7, c["--s2"]); // 筆筒
  }
}

// ---------------------------------------------------------------------------
// 整個場景（後面的先畫，前面的蓋上去）
// ---------------------------------------------------------------------------
function drawFrame(
  ctx: Ctx,
  bg: HTMLCanvasElement,
  c: Palette,
  present: Record<AiRoleKey, boolean>,
  frame: number,
) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  ctx.drawImage(bg, 0, 0);
  drawWallAnim(ctx, c, frame);
  const wood = c["--iso-wood"];

  // ---- 靠後牆的家具 ----
  // 書櫃（組合）：外框、四層書、上面一盆小植物
  const bx = 24;
  floorShadow(ctx, bx - 1, 81, 36, 3);
  block(ctx, bx, 22, 34, 60, shade(wood, -0.2));
  px(ctx, bx + 2, 24, 30, 56, shade(wood, -0.5));
  const books = [
    c["--s1"],
    c["--s2"],
    c["--s3"],
    c["--s4"],
    c["--iso-board"],
    c["--accent-strong"],
    c["--s1"],
    c["--s3"],
  ];
  for (let shelf = 0; shelf < 4; shelf++) {
    const sy = 24 + shelf * 14;
    px(ctx, bx + 2, sy + 12, 30, 2, shade(wood, -0.1));
    let x = bx + 3;
    for (let i = 0; i < 9 && x < bx + 30; i++) {
      const w = 2 + Math.floor(hash01(shelf, i) * 2);
      const h = 8 + Math.floor(hash01(i, shelf) * 3);
      if (hash01(shelf * 3, i * 5) < 0.12) {
        x += w + 1;
        continue;
      }
      const col = books[(i + shelf * 3) % books.length];
      px(ctx, x, sy + 12 - h, Math.min(w, bx + 31 - x), h, col);
      px(ctx, x, sy + 12 - h + 2, Math.min(w, bx + 31 - x), 1, shade(col, 0.4));
      x += w;
    }
  }
  plant(ctx, c, bx + 26, 22, 1);
  // 電視下的矮櫃＋印表機＋小盆栽
  floorShadow(ctx, 62, 79, 52, 3);
  block(ctx, 63, 56, 50, 24, shade(wood, -0.1));
  px(ctx, 64, 57, 48, 2, shade(wood, 0.2));
  px(ctx, 87, 60, 1, 18, shade(wood, -0.45));
  px(ctx, 82, 67, 3, 1, "#e8c46a");
  px(ctx, 90, 67, 3, 1, "#e8c46a");
  block(ctx, 94, 47, 16, 10, shade(c["--iso-metal"], 0.55)); // 印表機
  px(ctx, 97, 45, 10, 2, c["--iso-board"]);
  block(ctx, 66, 50, 8, 7, c["--iso-pot"]);
  disc(ctx, 70, 46, 4, c["--iso-plant"]);
  disc(ctx, 69, 45, 2, shade(c["--iso-plant"], 0.3));
  // 主管兩側的大盆栽、門旁的飲水機
  plant(ctx, c, 112, 96, 3);
  plant(ctx, c, 208, 96, 2);
  floorShadow(ctx, 296, 88, 14, 3);
  block(ctx, 297, 58, 12, 31, c["--iso-board"]);
  block(
    ctx,
    298,
    46,
    10,
    13,
    c.night ? shade(c["--iso-sky"], 0.4) : c["--iso-sky"],
  );
  px(ctx, 300, 48, 2, 8, "rgba(255,255,255,0.4)");
  px(ctx, 300, 66, 3, 2, c["--s1"]);
  px(ctx, 305, 66, 3, 2, c["--red"]);

  // ---- 主管（後排中間，霓虹招牌下）----
  workstation(ctx, c, "lead", frame, present.lead);

  // ---- 左邊：咖啡吧檯（窗戶下）----
  floorShadow(ctx, 2, 125, 26, 3);
  block(ctx, 2, 102, 26, 24, shade(wood, -0.15));
  block(ctx, 1, 98, 28, 6, wood);
  block(ctx, 6, 86, 10, 13, c["--iso-metal"]); // 咖啡機
  px(ctx, 8, 92, 6, 3, shade(c["--iso-metal"], 0.4));
  px(ctx, 13, 88, 2, 1, "#ef4444");
  block(ctx, 19, 93, 5, 6, c["--office-mug"]);

  // ---- 第一排：技術分析師、新聞分析師；右邊檔案櫃 ----
  workstation(ctx, c, "tech", frame, present.tech);
  workstation(ctx, c, "news", frame, present.news);
  floorShadow(ctx, 288, 167, 26, 3);
  block(ctx, 288, 128, 26, 40, shade(c["--iso-metal"], 0.45));
  for (const yy of [131, 144, 157]) {
    block(ctx, 290, yy, 22, 11, shade(c["--iso-metal"], 0.55));
    px(ctx, 297, yy + 4, 8, 2, shade(c["--iso-metal"], 0.1));
  }

  // ---- 第二排：基本面分析師、多空辯論；左下沙發、前排盆栽 ----
  sofa(ctx, c, 6, 178);
  workstation(ctx, c, "fundamental", frame, present.fundamental);
  workstation(ctx, c, "debate", frame, present.debate);
  plant(ctx, c, 296, 214, 3);
  plant(ctx, c, 160, 222, 2);

  // ---- 天花板垂下來的燈泡（最前面）----
  for (const lx of [70, 160, 250]) {
    px(ctx, lx, 0, 1, 9, shade(c["--iso-metal"], 0.1));
    block(ctx, lx - 3, 8, 7, 3, c["--iso-metal"]);
    disc(ctx, lx, 13, 2, c.night ? "#ffe9a8" : "#fff6dc");
  }
}

// ---------------------------------------------------------------------------
// 光影（畫在放大後的高解析度畫布上，用平滑漸層）
// ---------------------------------------------------------------------------
function hexA(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(255,255,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function glow(
  ctx: Ctx,
  S: number,
  x: number,
  y: number,
  r: number,
  color: string,
  a: number,
  sy = 1,
) {
  ctx.save();
  ctx.translate(x * S, y * S);
  ctx.scale(1, sy);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * S);
  grad.addColorStop(0, hexA(color, a));
  grad.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(-r * S, -r * S, r * 2 * S, r * 2 * S);
  ctx.restore();
}

function drawLights(
  ctx: Ctx,
  S: number,
  c: Palette,
  present: Record<AiRoleKey, boolean>,
  frame: number,
) {
  const night = !!c.night;
  const k = night ? 1 : 0.5;
  const warm = "#ffd27a";
  const screen = "#8fd3ff";
  ctx.save();
  if (night) {
    // 夜晚：整間房先暗下來、四周更暗（暗角），燈光才顯得出來
    const g = ctx.createRadialGradient(
      160 * S,
      120 * S,
      40 * S,
      160 * S,
      120 * S,
      230 * S,
    );
    g.addColorStop(0, "rgba(6,8,22,0.12)");
    g.addColorStop(1, "rgba(6,8,22,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SCENE_W * S, SCENE_H * S);
  } else {
    // 白天：窗戶照進來的一道斜光
    ctx.fillStyle = "rgba(255,246,214,0.16)";
    ctx.beginPath();
    ctx.moveTo(15 * S, 62 * S);
    ctx.lineTo(3 * S, 74 * S);
    ctx.lineTo(28 * S, 128 * S);
    ctx.lineTo(56 * S, 104 * S);
    ctx.closePath();
    ctx.fill();
  }
  if (!night) {
    const v = ctx.createRadialGradient(
      160 * S,
      120 * S,
      80 * S,
      160 * S,
      120 * S,
      220 * S,
    );
    v.addColorStop(0, "rgba(80,50,20,0)");
    v.addColorStop(1, "rgba(80,50,20,0.16)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, SCENE_W * S, SCENE_H * S);
  }
  ctx.globalCompositeOperation = night ? "lighter" : "source-over";
  // 燈泡與燈光照到的地板
  for (const lx of [70, 160, 250]) {
    glow(ctx, S, lx, 13, 16, warm, 0.55 * k);
    glow(ctx, S, lx, 110, 70, warm, 0.12 * k, 0.6);
  }
  // 霓虹招牌（晚上很亮，偶爾閃一下）
  const flicker = frame % 97 === 0 || frame % 97 === 2;
  if (!flicker)
    glow(ctx, S, 160, 25, 75, c["--iso-neon"], night ? 0.42 : 0.08, 0.45);
  // 主管桌燈
  glow(ctx, S, SEATS.lead.x - 32, SEATS.lead.desk - 6, 26, warm, 0.45 * k);
  // 螢幕光（有人在才亮，微微閃）
  const fl = frame % 6 < 3 ? 1 : 0.85;
  for (const r of ROLE_ORDER) {
    if (!present[r]) continue;
    const s = SEATS[r];
    const mx = s.monitor === "right" ? s.x + 22 : s.x - 22;
    glow(ctx, S, mx, s.desk - 8, 22, screen, 0.2 * k * fl);
  }
  glow(ctx, S, 87, 33, 34, screen, 0.15 * k); // 電視
  glow(ctx, S, 9, 45, 36, night ? "#9fb4ff" : "#fff6dc", night ? 0.18 : 0.3); // 窗戶
  ctx.restore();
}

/** 放大倍數：手機（3 倍螢幕、寬約 390px）與桌機都夠清楚 */
const SCALE = 4;

const SPOT_HREF: Record<string, string> = {
  today: TODAY_HREF,
  market: MARKET_HREF,
  screener: SCREENER_HREF,
  portfolio: PORTFOLIO_HREF,
};

export default function OfficeScene({
  present,
  loading,
  redUp,
  chartHref,
  onOpen,
  children,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useThemeColors(); // 只當作「主題變了」的訊號，顏色另外讀
  const key = ROLE_ORDER.map((r) => (present[r] ? 1 : 0)).join("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; // 沒有 canvas（極舊瀏覽器）：只顯示名牌、標籤與下方內容
    const c = readPalette(redUp);
    // 為什麼要放大成整數倍？像素畫直接用 CSS 縮放到非整數倍（例如 1.2×）時，
    // 有的像素變 1 格、有的變 2 格，看起來粗糙。先在程式裡放大 S 倍（每個像素都是 S×S），
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

  const tags = useMemo(
    () => ROLE_ORDER.map((r) => ({ r, ...tagPosition(r) })),
    [],
  );
  const hrefOf = (p: Page) => (p === "chart" ? chartHref : SPOT_HREF[p]);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="office-scene">
      {/* 報告日期、完成人數等資訊放在房間上方一列（疊在房間上會擋住物件標籤） */}
      {children && <div className="office-hud-row">{children}</div>}
      {/* 名牌與標籤用百分比定位，所以和畫布放在同一個容器（不含上面那一列） */}
      <div className="office-stage">
        <canvas
          ref={canvasRef}
          width={SCENE_W * SCALE}
          height={SCENE_H * SCALE}
          role="img"
          aria-label={t("像素風辦公室：5 位 AI 分析師在座位上工作")}
        />
        {/* 物件的點擊範圍（窗戶、電視、看板、書櫃、門），和標籤連到同一頁 */}
        {NAV_SPOTS.map((s) => (
          <a
            key={`hit-${s.page}`}
            className="office-spot-hit"
            href={hrefOf(s.page)}
            style={{
              left: pct(s.hit[0], SCENE_W),
              top: pct(s.hit[1], SCENE_H),
              width: pct(s.hit[2], SCENE_W),
              height: pct(s.hit[3], SCENE_H),
            }}
            aria-hidden="true"
            tabIndex={-1}
          />
        ))}
        {tags.map(({ r, left, top }) => (
          <span
            key={`hit-${r}`}
            className="office-hit"
            style={{ left: `${left}%`, top: `${top}%` }}
            onClick={() => onOpen(r)}
            aria-hidden="true"
          />
        ))}
        <nav aria-label={t("頁面")}>
          {NAV_SPOTS.map((s) => {
            const p = spotPosition(s.at);
            return (
              <a
                key={s.page}
                className="office-spot"
                href={hrefOf(s.page)}
                style={{ left: `${p.left}%`, top: `${p.top}%` }}
              >
                {t(s.label)}
                <span className="office-spot-go" aria-hidden="true">
                  ›
                </span>
              </a>
            );
          })}
        </nav>
        {tags.map(({ r, left, top }) => (
          <button
            key={r}
            type="button"
            className={`office-tag ${present[r] ? "is-done" : "is-off"}`}
            style={{ left: `${left}%`, top: `${top}%` }}
            onClick={() => onOpen(r)}
            aria-haspopup="dialog"
          >
            <i aria-hidden="true" />
            {t(ROLE_NAME[r])}
            {!loading && (
              <span className={present[r] ? "sr-only" : "office-tag-off"}>
                {present[r] ? t("已完成") : t("休假中")}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
