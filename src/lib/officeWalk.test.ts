import { describe, expect, it } from "vitest";
import { along, PAUSE, ROUTES, WALK_SPEED, walkPose } from "./officeWalk";
import { SEATS } from "./iso";
import type { AiRoleKey } from "./types";

const seatOf = (r: AiRoleKey): [number, number] => [SEATS[r].x, SEATS[r].y];

describe("走動", () => {
  it("剛打開頁面時大家都坐著；主管永遠坐著", () => {
    for (const r of ["tech", "news", "fundamental", "debate", "lead"] as AiRoleKey[]) expect(walkPose(r, 5, seatOf(r)).seated).toBe(true);
    expect(walkPose("lead", 1000, seatOf("lead")).seated).toBe(true);
  });

  it("沿著路線內插位置", () => {
    const p = along([[0, 0], [2, 0], [2, 2]], 3);
    expect(p.x).toBeCloseTo(2);
    expect(p.y).toBeCloseTo(1);
  });

  it("出發 → 走到目的地停留（背影）→ 走回來 → 坐下", () => {
    const r = ROUTES.tech!;
    const len = r.route.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - r.route[i][0], p[1] - r.route[i][1]), 0);
    const d = len / WALK_SPEED;
    const out = walkPose("tech", r.start + d / 2, seatOf("tech"));
    expect(out.walking).toBe(true);
    const at = walkPose("tech", r.start + d + PAUSE / 2, seatOf("tech"));
    expect(at).toMatchObject({ walking: false, seated: false, front: false });
    expect([at.x, at.y]).toEqual(r.route[r.route.length - 1]);
    expect(walkPose("tech", r.start + d * 1.5 + PAUSE, seatOf("tech")).walking).toBe(true);
    expect(walkPose("tech", r.start + d * 2 + PAUSE + 1, seatOf("tech")).seated).toBe(true);
  });

  it("路線從座位出發、整條都在房間裡、不穿過長桌", () => {
    for (const [role, r] of Object.entries(ROUTES)) {
      expect(r.route[0], role).toEqual(seatOf(role as AiRoleKey));
      for (let t = 0; t < r.cycle * 3; t += 0.25) {
        const p = walkPose(role as AiRoleKey, t, seatOf(role as AiRoleKey));
        expect(p.x).toBeGreaterThan(0.3);
        expect(p.x).toBeLessThan(7.7);
        expect(p.y).toBeGreaterThan(0.3);
        expect(p.y).toBeLessThan(7.7);
        if (!p.seated) {
          const inDesk = p.x > 1.15 && p.x < 6.65 && p.y > 2.6 && p.y < 4.0;
          expect(inDesk, `${role} 在 t=${t} 走進長桌`).toBe(false);
        }
      }
    }
  });

  it("面向：往畫面這邊走看得到臉、往畫面左邊走要翻轉", () => {
    const r = ROUTES.fundamental!;
    const len = r.route.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - r.route[i][0], p[1] - r.route[i][1]), 0);
    // 去程最後一段是往 y 變小（往裡面走）→ 背影
    const near = walkPose("fundamental", r.start + (len - 0.2) / WALK_SPEED, seatOf("fundamental"));
    expect(near.front).toBe(false);
  });
});
