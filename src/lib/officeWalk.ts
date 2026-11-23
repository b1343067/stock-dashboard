// AI 辦公室：人物走動的時間表與路線（純函式，測試在 officeWalk.test.ts）
//
// 每位分析師有自己的週期：大部分時間坐著，輪到時起身沿著走道走到某個地方（電視、飲水機、窗邊、書櫃），
// 停幾秒再走回座位。路線只走在走道上（桌子後面、前面、左側），不會穿過家具。
// 主管坐鎮不走動。剛打開頁面的前十幾秒大家都坐著。

import type { AiRoleKey } from "./types";

export interface WalkPose {
  x: number;
  y: number;
  /** 正在走（有腳步動作）；false 且 seated=false = 站在目的地 */
  walking: boolean;
  /** 坐在位子上（照原本的坐姿畫） */
  seated: boolean;
  /** 面向畫面（看得到臉）；false = 背影 */
  front: boolean;
  /** 往畫面左邊（圖要左右翻轉） */
  flip: boolean;
}

type Pt = [number, number];
interface Route {
  /** 週期（秒）與第一次出發的時間（秒） */
  cycle: number;
  start: number;
  /** 從座位出發的路線，最後一點是目的地 */
  route: Pt[];
  /** 在目的地停留時：背對畫面，看向左邊（窗戶）或右邊（牆上的東西） */
  lookLeft: boolean;
}

export const WALK_SPEED = 0.9; // 格／秒
export const PAUSE = 5; // 在目的地停留幾秒

export const ROUTES: Partial<Record<AiRoleKey, Route>> = {
  tech: { cycle: 48, start: 12, route: [[2.4, 2.1], [2.4, 1.35], [3.7, 1.35], [3.7, 0.9]], lookLeft: false }, // 走到電視前看 K 線
  news: { cycle: 56, start: 30, route: [[5.2, 2.1], [5.2, 1.35], [5.2, 0.8]], lookLeft: false }, // 去飲水機倒水
  fundamental: { cycle: 62, start: 21, route: [[2.4, 4.5], [2.4, 5.15], [0.75, 5.15], [0.75, 4.4]], lookLeft: true }, // 走到落地窗前看夜景（不走到長桌左邊：那裡會被螢幕擋住）
  debate: { cycle: 54, start: 40, route: [[5.2, 4.5], [5.2, 5.15], [1.05, 5.15], [1.05, 6.6]], lookLeft: true }, // 走到書櫃前找書
};

function length(route: Pt[]): number {
  let s = 0;
  for (let i = 1; i < route.length; i++) s += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  return s;
}

/** 沿著路線走了 dist 格之後的位置與移動方向 */
export function along(route: Pt[], dist: number): { x: number; y: number; dx: number; dy: number } {
  let left = Math.max(0, dist);
  for (let i = 1; i < route.length; i++) {
    const [ax, ay] = route[i - 1];
    const [bx, by] = route[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (left <= seg || i === route.length - 1) {
      const t = seg === 0 ? 1 : Math.min(1, left / seg);
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, dx: bx - ax, dy: by - ay };
    }
    left -= seg;
  }
  const [x, y] = route[route.length - 1];
  return { x, y, dx: 0, dy: 0 };
}

/** 移動方向 → 面向：往畫面這邊（x 或 y 變大）看得到臉；畫面上往左（x 變小或 y 變大）要翻轉 */
function facing(dx: number, dy: number): { front: boolean; flip: boolean } {
  return { front: dx + dy > 0, flip: dx - dy < 0 };
}

/**
 * t 秒時這個角色在哪裡、在做什麼。沒有路線（主管）或今天休假 → 一律坐著。
 * speed = 走路速度倍數（officeMood.ts：恐慌時走比較快）；只影響走路，停留時間不變。
 */
export function walkPose(role: AiRoleKey, t: number, seat: Pt, speed = 1): WalkPose {
  const r = ROUTES[role];
  const seated: WalkPose = { x: seat[0], y: seat[1], walking: false, seated: true, front: true, flip: false };
  if (!r || t < r.start) return seated;
  const len = length(r.route);
  const v = WALK_SPEED * speed;
  const d = len / v;
  const tc = (t - r.start) % r.cycle;
  if (tc < d) {
    const p = along(r.route, tc * v);
    return { x: p.x, y: p.y, walking: true, seated: false, ...facing(p.dx, p.dy) };
  }
  if (tc < d + PAUSE) {
    const [x, y] = r.route[r.route.length - 1];
    return { x, y, walking: false, seated: false, front: false, flip: r.lookLeft };
  }
  if (tc < 2 * d + PAUSE) {
    const back = [...r.route].reverse();
    const p = along(back, (tc - d - PAUSE) * v);
    return { x: p.x, y: p.y, walking: true, seated: false, ...facing(p.dx, p.dy) };
  }
  return seated;
}
