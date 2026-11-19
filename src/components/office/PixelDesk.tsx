// 像素風工作站：桌子、螢幕、角色（全部用 SVG 方塊畫，原創圖案，不用任何外部圖片）
// shapeRendering="crispEdges" 讓方塊邊緣不模糊，看起來才像像素畫。
// 動作（打字、喝咖啡、待機晃動）用 CSS 動畫做（styles.css 的 .px-*），使用者設定「減少動態」時會停住。

import type { AiRoleKey } from "../../lib/types";

export type Action = "typing" | "coffee" | "idle";

/** 每個角色的衣服顏色（CSS 變數）、髮色、動作。顏色只是區分角色，不代表漲跌 */
export const ROLE_LOOK: Record<
  AiRoleKey,
  { shirt: string; hair: string; action: Action }
> = {
  tech: { shirt: "--s1", hair: "--office-hair-1", action: "typing" },
  news: { shirt: "--s2", hair: "--office-hair-2", action: "typing" },
  fundamental: { shirt: "--s3", hair: "--office-hair-3", action: "coffee" },
  debate: { shirt: "--s4", hair: "--office-hair-1", action: "idle" },
  lead: { shirt: "--accent-strong", hair: "--office-hair-2", action: "coffee" },
};

interface Props {
  role: AiRoleKey;
  /** false = 休假中：椅子空著、螢幕關著 */
  present: boolean;
}

export default function PixelDesk({ role, present }: Props) {
  const look = ROLE_LOOK[role];
  const c = (v: string) => `var(${v})`;
  return (
    // px-stage：每個工作站自己的小背景（上面是牆、下面是地板）
    <span className="px-stage">
      <svg
        className={`px-desk ${present ? `px-${look.action}` : "px-off"}`}
        viewBox="0 0 48 40"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {/* 椅背 */}
        <rect x="8" y="16" width="14" height="14" fill={c("--office-chair")} />
        {present && (
          <g className="px-person">
            {/* 頭髮、臉、眼睛 */}
            <rect x="10" y="5" width="10" height="3" fill={c(look.hair)} />
            <rect
              x="10"
              y="8"
              width="10"
              height="7"
              fill={c("--office-skin")}
            />
            <rect x="10" y="8" width="2" height="3" fill={c(look.hair)} />
            <rect
              className="px-eyes"
              x="15"
              y="10"
              width="1"
              height="1"
              fill={c("--office-ink")}
            />
            <rect
              className="px-eyes"
              x="18"
              y="10"
              width="1"
              height="1"
              fill={c("--office-ink")}
            />
            {/* 身體 */}
            <rect x="9" y="15" width="12" height="11" fill={c(look.shirt)} />
            {/* 手臂（打字時上下動） */}
            <g className="px-arms">
              <rect x="19" y="20" width="7" height="3" fill={c(look.shirt)} />
              <rect
                x="26"
                y="20"
                width="2"
                height="3"
                fill={c("--office-skin")}
              />
            </g>
          </g>
        )}
        {/* 螢幕：上班時亮著 */}
        <rect x="28" y="9" width="16" height="12" fill={c("--office-frame")} />
        <rect
          className="px-screen"
          x="29"
          y="10"
          width="14"
          height="10"
          fill={c(present ? "--office-screen" : "--office-screen-off")}
        />
        {present && (
          <g className="px-lines">
            <rect
              x="31"
              y="12"
              width="8"
              height="1"
              fill={c("--office-frame")}
            />
            <rect
              x="31"
              y="14"
              width="10"
              height="1"
              fill={c("--office-frame")}
            />
            <rect
              x="31"
              y="16"
              width="6"
              height="1"
              fill={c("--office-frame")}
            />
          </g>
        )}
        <rect x="35" y="21" width="2" height="4" fill={c("--office-frame")} />
        {/* 桌面、鍵盤、桌腳 */}
        <rect x="2" y="25" width="44" height="3" fill={c("--office-desk")} />
        <rect x="27" y="23" width="9" height="2" fill={c("--office-frame")} />
        <rect
          x="4"
          y="28"
          width="3"
          height="10"
          fill={c("--office-desk-dark")}
        />
        <rect
          x="41"
          y="28"
          width="3"
          height="10"
          fill={c("--office-desk-dark")}
        />
        {/* 咖啡杯（喝咖啡時舉起來） */}
        <g className="px-mug">
          <rect x="39" y="21" width="4" height="4" fill={c("--office-mug")} />
          <rect x="43" y="22" width="1" height="2" fill={c("--office-mug")} />
        </g>
        {/* 休假中：螢幕上的 z */}
        {!present && (
          <g className="px-zzz" fill={c("--office-frame")}>
            <rect x="33" y="12" width="5" height="1" />
            <rect x="36" y="13" width="1" height="1" />
            <rect x="35" y="14" width="1" height="1" />
            <rect x="34" y="15" width="1" height="1" />
            <rect x="33" y="16" width="5" height="1" />
          </g>
        )}
      </svg>
    </span>
  );
}
