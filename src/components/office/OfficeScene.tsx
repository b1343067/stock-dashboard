// AI 辦公室的等角像素場景（原創，全部用程式畫，不用任何外部圖片）
// 做法：在 352×252 的小畫布上一格一格畫，再用 CSS 放大（image-rendering: pixelated）。
// 背景（牆、地板、家具）只在主題改變時重畫一次存起來；每一格動畫只重畫角色和螢幕，
// 大約每秒 8 格；分頁在背景時瀏覽器會自動暫停；使用者設定「減少動態」時只畫一張靜態圖。
// 角色上方的名牌是 HTML 按鈕（可以用鍵盤、螢幕報讀器操作），點了打開報告。

import { useEffect, useMemo, useRef } from "react";
import { project, ROOM, SCENE_H, SCENE_W, SEATS, shade, SIT_Z, spans, tagPosition, WALL_H, type Pt } from "../../lib/iso";
import { ROLE_NAME, ROLE_ORDER } from "../../lib/aiReport";
import { t } from "../../lib/i18n";
import { useThemeColors } from "../../lib/theme";
import type { AiRoleKey } from "../../lib/types";

interface Props {
  /** 每個角色今天有沒有報告（沒有 = 休假中，座位空著） */
  present: Record<AiRoleKey, boolean>;
  loading: boolean;
  redUp: boolean;
  onOpen: (role: AiRoleKey) => void;
}

type Ctx = CanvasRenderingContext2D;
type Palette = Record<string, string>;

const VARS = [
  "--iso-wall", "--iso-floor", "--iso-sky", "--iso-city", "--iso-lit", "--iso-desk", "--iso-metal", "--iso-screen", "--iso-plant", "--iso-pot", "--iso-rug", "--iso-board",
  "--office-skin", "--office-hair-1", "--office-hair-2", "--office-hair-3", "--office-ink", "--office-mug", "--office-chair",
  "--s1", "--s2", "--s3", "--s4", "--accent-strong", "--red", "--green",
];

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const p: Palette = {};
  for (const v of VARS) p[v] = cs.getPropertyValue(v).trim() || "#888888";
  return p;
}

// ---- 基本畫法 ----
function poly(ctx: Ctx, pts: Pt[], color: string) {
  ctx.fillStyle = color;
  for (const [y, x, w] of spans(pts)) ctx.fillRect(x, y, w, 1);
}
function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
/** 2:1 斜線（地板木紋、邊線） */
function line(ctx: Ctx, a: Pt, b: Pt, color: string) {
  ctx.fillStyle = color;
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(a[0] + ((b[0] - a[0]) * i) / n), Math.round(a[1] + ((b[1] - a[1]) * i) / n), 1, 1);
}
/** 長方體：看得到上面、+y 面（左前）、+x 面（右前），三面深淺不同就有立體感 */
function box(ctx: Ctx, x: number, y: number, z: number, w: number, d: number, h: number, color: string) {
  const P = (a: number, b: number, c: number) => project(a, b, c);
  poly(ctx, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(color, -0.12));
  poly(ctx, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], shade(color, -0.25));
  poly(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], color);
}
/** 左牆（x = 0 平面）上的長方形 */
function onLeftWall(ctx: Ctx, y0: number, y1: number, z0: number, z1: number, color: string, x = 0) {
  poly(ctx, [project(x, y0, z0), project(x, y1, z0), project(x, y1, z1), project(x, y0, z1)], color);
}
/** 右牆（y = 0 平面）上的長方形 */
function onRightWall(ctx: Ctx, x0: number, x1: number, z0: number, z1: number, color: string, y = 0) {
  poly(ctx, [project(x0, y, z0), project(x1, y, z0), project(x1, y, z1), project(x0, y, z1)], color);
}

// ---- 背景：牆、窗、白板、地板、家具（不會動的部分）----
function drawRoom(ctx: Ctx, c: Palette, redUp: boolean) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  const wall = c["--iso-wall"];
  // 牆：左牆稍暗、右牆亮；上緣一條厚邊、下緣踢腳板
  onLeftWall(ctx, 0, ROOM, 0, WALL_H, shade(wall, -0.1));
  onRightWall(ctx, 0, ROOM, 0, WALL_H, wall);
  onLeftWall(ctx, 0, ROOM, 0, 3, shade(wall, -0.35));
  onRightWall(ctx, 0, ROOM, 0, 3, shade(wall, -0.3));
  onLeftWall(ctx, 0, ROOM, WALL_H - 3, WALL_H, shade(wall, -0.4));
  onRightWall(ctx, 0, ROOM, WALL_H - 3, WALL_H, shade(wall, -0.3));

  // 左牆兩扇大窗：天空、城市剪影、亮著的窗戶
  for (const [y0, y1] of [[1.0, 4.0], [4.8, 7.8]]) {
    onLeftWall(ctx, y0, y1, 18, 56, c["--iso-sky"]);
    const heights = [15, 26, 12, 31, 19, 23, 14, 28];
    const step = (y1 - y0) / heights.length;
    heights.forEach((h, i) => {
      const a = y0 + i * step;
      onLeftWall(ctx, a, a + step * 0.9, 18, 18 + h, c["--iso-city"]);
      for (let z = 22; z < 18 + h - 3; z += 5) {
        if ((i * 7 + z) % 3 === 0) onLeftWall(ctx, a + step * 0.3, a + step * 0.5, z, z + 2, c["--iso-lit"]);
      }
    });
    // 窗框
    const frame = c["--iso-metal"];
    onLeftWall(ctx, y0 - 0.08, y1 + 0.08, 16, 18, frame);
    onLeftWall(ctx, y0 - 0.08, y1 + 0.08, 56, 58, frame);
    for (const y of [y0 - 0.08, (y0 + y1) / 2 - 0.04, y1]) onLeftWall(ctx, y, y + 0.08, 16, 58, frame);
  }

  // 右牆：白板（便利貼）、K 線海報、時鐘、門
  const board = c["--iso-board"];
  onRightWall(ctx, 1.0, 3.9, 24, 54, shade(board, -0.35));
  onRightWall(ctx, 1.1, 3.8, 26, 52, board);
  const notes = [c["--s1"], c["--s4"], c["--s3"], c["--s2"], c["--s4"], c["--s1"]];
  notes.forEach((col, i) => {
    const x = 1.3 + (i % 3) * 0.5;
    const z = i < 3 ? 42 : 33;
    onRightWall(ctx, x, x + 0.35, z, z + 6, col);
  });
  for (const z of [47, 44]) onRightWall(ctx, 2.9, 3.6, z, z + 1, shade(board, -0.5));
  // K 線海報：漲的顏色跟著紅漲綠跌設定
  onRightWall(ctx, 4.4, 6.0, 26, 54, c["--iso-screen"]);
  const up = redUp ? c["--red"] : c["--green"];
  const down = redUp ? c["--green"] : c["--red"];
  const candles = [[30, 7, 1], [34, 6, 0], [32, 8, 1], [37, 7, 1], [40, 5, 0], [38, 9, 1], [43, 7, 1]];
  candles.forEach(([z, h, isUp], i) => {
    const x = 4.6 + i * 0.2;
    onRightWall(ctx, x, x + 0.1, z, z + h, isUp ? up : down);
  });
  // 時鐘
  onRightWall(ctx, 6.6, 7.2, 50, 58, shade(board, -0.5));
  onRightWall(ctx, 6.68, 7.12, 51, 57, board);
  onRightWall(ctx, 6.88, 6.94, 53, 56, c["--office-ink"]);
  // 門
  onRightWall(ctx, 8.1, 9.5, 0, 48, shade(c["--iso-floor"], -0.35));
  onRightWall(ctx, 8.2, 9.4, 0, 46, shade(c["--iso-floor"], -0.1));
  onRightWall(ctx, 9.15, 9.25, 22, 25, c["--iso-board"]);

  // 地板：木頭，每半格一條木紋
  const floor = c["--iso-floor"];
  poly(ctx, [project(0, 0), project(ROOM, 0), project(ROOM, ROOM), project(0, ROOM)], floor);
  for (let k = 1; k < ROOM * 2; k++) line(ctx, project(0, k / 2), project(ROOM, k / 2), shade(floor, -0.1));
  // 主管桌下的地毯
  poly(ctx, [project(7.3, 5.6), project(9.9, 5.6), project(9.9, 8.6), project(7.3, 8.6)], c["--iso-rug"]);
}

// ---- 家具 ----
function plant(ctx: Ctx, c: Palette, x: number, y: number, big = false) {
  box(ctx, x, y, 0, 0.6, 0.6, big ? 10 : 8, c["--iso-pot"]);
  const [sx, sy] = project(x + 0.3, y + 0.3, big ? 10 : 8);
  const g = c["--iso-plant"];
  const leaves: [number, number, number, number][] = big
    ? [[-6, -12, 12, 10], [-4, -20, 8, 9], [-8, -8, 4, 5], [4, -9, 4, 5], [-2, -25, 4, 6]]
    : [[-5, -9, 10, 8], [-3, -14, 6, 6], [-6, -6, 3, 4], [3, -7, 3, 4]];
  leaves.forEach(([dx, dy, w, h], i) => px(ctx, sx + dx, sy + dy, w, h, i % 2 ? shade(g, -0.2) : g));
  px(ctx, sx - 1, sy - 2, 2, 2, shade(g, -0.35));
}

function monitor(ctx: Ctx, c: Palette, x: number, y: number, screenFront: boolean) {
  const metal = c["--iso-metal"];
  box(ctx, x + 0.4, y, 15, 0.2, 0.1, 3, metal); // 支架
  box(ctx, x, y, 18, 1.0, 0.12, 13, metal);
  if (screenFront) {
    // 螢幕朝向畫面（+y 面），內嵌深色螢幕
    poly(ctx, [project(x + 0.1, y + 0.12, 20), project(x + 0.9, y + 0.12, 20), project(x + 0.9, y + 0.12, 29), project(x + 0.1, y + 0.12, 29)], c["--iso-screen"]);
  }
}

/** 螢幕上的小圖表（動畫的一部分：打字的人螢幕會閃） */
function screenChart(ctx: Ctx, c: Palette, x: number, y: number, frame: number, redUp: boolean, active: boolean) {
  const yy = y + 0.12;
  if (!active) return;
  const up = redUp ? c["--red"] : c["--green"];
  const down = redUp ? c["--green"] : c["--red"];
  for (let i = 0; i < 6; i++) {
    const h = 2 + ((i * 5 + frame) % 4);
    const [sx, sy] = project(x + 0.18 + i * 0.12, yy, 21 + ((i * 3) % 3));
    px(ctx, sx, sy - h, 1, h, (i + frame) % 3 === 0 ? down : up);
  }
}

function chair(ctx: Ctx, c: Palette, x: number, y: number, part: "seat" | "back", facing: "front" | "back") {
  const col = c["--office-chair"];
  const [sx, sy] = project(x, y);
  if (part === "seat") {
    px(ctx, sx - 1, sy - SIT_Z + 2, 2, SIT_Z - 3, shade(col, -0.3)); // 腳柱
    px(ctx, sx - 5, sy - 1, 10, 1, shade(col, -0.3));
    px(ctx, sx - 6, sy - SIT_Z, 12, 3, col);
  } else if (facing === "front") {
    // 面向畫面的人：椅背在他後面，露出肩膀兩側
    px(ctx, sx - 7, sy - SIT_Z - 17, 14, 15, shade(col, 0.08));
    px(ctx, sx - 7, sy - SIT_Z - 17, 14, 1, shade(col, 0.25));
  } else {
    // 背對畫面的人：椅背擋住下半身，上半身露出來
    px(ctx, sx - 6, sy - SIT_Z - 7, 12, 8, shade(col, 0.08));
    px(ctx, sx - 6, sy - SIT_Z - 7, 12, 1, shade(col, 0.25));
  }
}

// ---- 角色（畫面座標的小精靈圖：身體 10×10、頭 8×8）----
function person(ctx: Ctx, c: Palette, role: AiRoleKey, frame: number) {
  const s = SEATS[role];
  const [sx, sy] = project(s.x, s.y);
  const shirt = c[s.shirt];
  const hair = c[s.hair];
  const skin = c["--office-skin"];
  const ink = c["--office-ink"];
  // 待機：每 0.8 秒上下晃 1px
  const bob = s.action === "idle" && Math.floor(frame / 6) % 2 ? 1 : 0;
  const hip = sy - SIT_Z + bob;
  const x = Math.round(sx);
  // 身體（上面一排亮一點當肩膀）
  px(ctx, x - 5, hip - 10, 10, 10, shirt);
  px(ctx, x - 5, hip - 10, 10, 1, shade(shirt, 0.18));
  // 頭
  const headY = hip - 10 - 8;
  px(ctx, x - 4, headY, 8, 8, skin);
  if (s.facing === "front") {
    px(ctx, x - 4, headY - 1, 8, 3, hair);
    px(ctx, x - 4, headY + 2, 1, 3, hair);
    px(ctx, x + 3, headY + 2, 1, 2, hair);
    px(ctx, x - 2, headY + 4, 1, 2, ink);
    px(ctx, x + 1, headY + 4, 1, 2, ink);
    px(ctx, x - 1, headY + 7, 2, 1, shade(skin, -0.2));
    // 領口
    px(ctx, x - 1, hip - 10, 2, 2, shade(shirt, -0.25));
  } else {
    px(ctx, x - 4, headY - 1, 8, 8, hair);
    px(ctx, x - 5, headY + 3, 1, 2, skin); // 耳朵
    px(ctx, x + 4, headY + 3, 1, 2, skin);
    px(ctx, x - 3, headY + 7, 6, 1, shade(skin, -0.15)); // 脖子
  }
  // 手：打字時左右手交替上下
  const typing = s.action === "typing";
  const flip = frame % 2 === 0;
  const armL = typing && flip ? 1 : 0;
  const armR = typing && !flip ? 1 : 0;
  if (s.facing === "front") {
    px(ctx, x - 7, hip - 8 - armL, 2, 6, shade(shirt, -0.1));
    px(ctx, x + 5, hip - 8 - armR, 2, 6, shade(shirt, -0.1));
    px(ctx, x - 7, hip - 2 - armL, 2, 2, skin);
    px(ctx, x + 5, hip - 2 - armR, 2, 2, skin);
  } else {
    px(ctx, x - 7, hip - 9 + armL, 2, 7, shade(shirt, -0.12));
    px(ctx, x + 5, hip - 9 + armR, 2, 7, shade(shirt, -0.12));
  }
  if (s.action === "coffee") {
    // 每 3 秒舉杯一次（約 0.75 秒）
    const sip = frame % 24 >= 18;
    const mx = x + 6;
    const my = sip ? headY + 4 : hip - 4;
    px(ctx, mx, my, 4, 4, c["--office-mug"]);
    px(ctx, mx + 4, my + 1, 1, 2, c["--office-mug"]);
    px(ctx, mx, my, 4, 1, shade(c["--office-mug"], -0.3));
    px(ctx, mx - 1, my + 2, 2, 2, skin);
    if (!sip && frame % 8 < 4) px(ctx, mx + 1, my - 3, 1, 2, shade(c["--office-mug"], -0.1)); // 熱氣
  }
  if (s.action === "idle" && Math.floor(frame / 12) % 2 === 0) {
    // 辯論中：頭上冒出「…」對話框
    const by = headY - 11;
    px(ctx, x + 3, by, 13, 7, c["--iso-board"]);
    px(ctx, x + 4, by + 7, 2, 2, c["--iso-board"]);
    for (const dx of [5, 9, 13]) px(ctx, x + dx, by + 3, 1, 1, ink);
  }
}

// ---- 整個場景（依前後順序畫：後面的先畫，前面的蓋上去）----
function drawFrame(ctx: Ctx, bg: HTMLCanvasElement, c: Palette, present: Record<AiRoleKey, boolean>, frame: number, redUp: boolean) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  ctx.drawImage(bg, 0, 0);
  const desk = c["--iso-desk"];
  const metal = c["--iso-metal"];
  const P = present;

  // 後排靠牆的東西
  plant(ctx, c, 0.2, 0.2, true);
  box(ctx, 4.2, 0, 0, 1.9, 0.7, 16, desk); // 咖啡吧檯
  box(ctx, 4.5, 0.1, 16, 0.5, 0.4, 10, metal); // 咖啡機
  px(ctx, project(4.75, 0.5, 18)[0] - 1, project(4.75, 0.5, 18)[1] - 1, 2, 2, c["--office-mug"]);
  box(ctx, 6.6, 0, 0, 1.1, 0.8, 14, shade(metal, 0.3)); // 印表機櫃
  box(ctx, 6.7, 0.1, 14, 0.9, 0.6, 6, c["--iso-board"]);
  box(ctx, 0, 8.3, 0, 0.6, 0.5, 22, c["--iso-board"]); // 飲水機
  box(ctx, 0.1, 8.35, 22, 0.4, 0.4, 9, c["--iso-sky"]);
  plant(ctx, c, 9.3, 1.0);

  // 後排兩位（面向畫面）：椅背 → 椅子 → 人
  for (const r of ["tech", "news"] as AiRoleKey[]) {
    const s = SEATS[r];
    chair(ctx, c, s.x, s.y, "back", "front");
    chair(ctx, c, s.x, s.y, "seat", "front");
    if (P[r]) person(ctx, c, r, frame);
  }

  // 長桌：桌腳、桌面
  for (const [lx, ly] of [[2.3, 4.0], [7.4, 4.0], [2.3, 5.1], [7.4, 5.1]]) box(ctx, lx, ly, 0, 0.12, 0.12, 12, metal);
  box(ctx, 2.2, 3.9, 12, 5.4, 1.4, 3, desk);
  // 後排的螢幕（螢幕朝向後排的人，我們看到背面）
  for (const r of ["tech", "news"] as AiRoleKey[]) monitor(ctx, c, SEATS[r].x - 0.5, 4.35, false);
  // 中間隔板
  box(ctx, 2.4, 4.55, 15, 5.0, 0.08, 9, shade(c["--iso-sky"], -0.1));
  // 前排的螢幕（朝向畫面，看得到圖表）
  for (const r of ["fundamental", "debate"] as AiRoleKey[]) {
    monitor(ctx, c, SEATS[r].x - 0.5, 4.8, true);
    screenChart(ctx, c, SEATS[r].x - 0.5, 4.8, frame, redUp, P[r]);
  }
  // 鍵盤、咖啡杯
  for (const r of ["fundamental", "debate"] as AiRoleKey[]) box(ctx, SEATS[r].x - 0.35, 5.0, 15, 0.7, 0.2, 1, shade(metal, 0.4));

  // 前排兩位（背對畫面）：椅子 → 人 → 椅背
  for (const r of ["fundamental", "debate"] as AiRoleKey[]) {
    const s = SEATS[r];
    chair(ctx, c, s.x, s.y, "seat", "back");
    if (P[r]) person(ctx, c, r, frame);
    chair(ctx, c, s.x, s.y, "back", "back");
  }

  // 左前方：書櫃、盆栽
  box(ctx, 0, 9.0, 0, 0.6, 0.9, 30, shade(c["--iso-floor"], -0.2));
  for (const z of [8, 16, 24]) box(ctx, 0.05, 9.05, z, 0.5, 0.8, 1, shade(c["--iso-floor"], -0.4));
  const books = [c["--s1"], c["--s2"], c["--s3"], c["--s4"], c["--iso-board"], c["--s1"]];
  for (const z of [9, 17, 25]) books.forEach((col, i) => i < 5 && box(ctx, 0.1, 9.1 + i * 0.14, z, 0.4, 0.1, 5 + ((i + z) % 2), col));
  plant(ctx, c, 2.0, 9.0, true);

  // 主管：椅背 → 人 → 桌子（桌子在人前面）
  const L = SEATS.lead;
  chair(ctx, c, L.x, L.y, "back", "front");
  chair(ctx, c, L.x, L.y, "seat", "front");
  if (P.lead) person(ctx, c, "lead", frame);
  for (const [lx, ly] of [[8.0, 7.0], [9.6, 7.0], [8.0, 7.9], [9.6, 7.9]]) box(ctx, lx, ly, 0, 0.12, 0.12, 12, metal);
  box(ctx, 7.9, 6.9, 12, 1.9, 1.1, 3, shade(c["--iso-floor"], -0.25));
  monitor(ctx, c, L.x - 0.5, 7.2, false);
  box(ctx, L.x - 1.0, 7.6, 15, 0.25, 0.25, 3, c["--office-mug"]);
}

export default function OfficeScene({ present, loading, redUp, onOpen }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useThemeColors(); // 只當作「主題變了」的訊號，顏色另外讀
  const key = ROLE_ORDER.map((r) => (present[r] ? 1 : 0)).join("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; // 測試環境或極舊瀏覽器沒有 canvas：只顯示名牌與下方列表
    const c = readPalette();
    const bg = document.createElement("canvas");
    bg.width = SCENE_W;
    bg.height = SCENE_H;
    const bctx = bg.getContext("2d");
    if (!bctx) return;
    drawRoom(bctx, c, redUp);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = -1;
    const tick = (now: number) => {
      const frame = Math.floor(now / 125); // 每秒 8 格
      if (frame !== last) {
        last = frame;
        drawFrame(ctx, bg, c, present, frame, redUp);
      }
      raf = requestAnimationFrame(tick);
    };
    if (still) drawFrame(ctx, bg, c, present, 0, redUp);
    else raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
    // present 用 key 判斷有沒有變（物件每次 render 都是新的）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, redUp, key]);

  const tags = useMemo(() => ROLE_ORDER.map((r) => ({ r, ...tagPosition(r) })), []);

  return (
    <div className="office-scene">
      <canvas ref={canvasRef} width={SCENE_W} height={SCENE_H} role="img" aria-label={t("像素風辦公室：5 位 AI 分析師在座位上工作")} />
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
          {!loading && <span className={present[r] ? "sr-only" : "office-tag-off"}>{present[r] ? t("已完成") : t("休假中")}</span>}
        </button>
      ))}
      {/* 點角色本身也能打開（名牌之外的較大點擊範圍；鍵盤使用名牌按鈕即可） */}
      {tags.map(({ r, left, top }) => (
        <span key={`hit-${r}`} className="office-hit" style={{ left: `${left}%`, top: `${top}%` }} onClick={() => onOpen(r)} aria-hidden="true" />
      ))}
    </div>
  );
}
