// K 線畫圖工具：水平線、趨勢線、復原、清除；重新整理後還在；換週期各自一份
import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test("畫圖工具：畫線、存檔、復原、清除", async ({ page }) => {
  const t = trackErrors(page);
  await page.goto("/#/NVDA/daily");
  const canvas = page.locator(".chart-canvas");
  await expect(canvas.locator("canvas").first()).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

  // 水平線：點一下就畫好，工具自動取消
  const hline = page.getByRole("button", { name: /水平線/ });
  await hline.click();
  await expect(canvas).toHaveClass(/drawing/);
  await page.mouse.click(at(0.5, 0.3).x, at(0.5, 0.3).y);
  await expect(canvas).toHaveAttribute("data-drawings", "1");
  await expect(hline).toHaveAttribute("aria-pressed", "false");

  // 趨勢線：點兩下（不同的 K 棒）
  await page.getByRole("button", { name: /趨勢線/ }).click();
  await page.mouse.click(at(0.3, 0.6).x, at(0.3, 0.6).y);
  await expect(page.locator(".draw-hint")).toContainText("再點一下");
  await page.mouse.click(at(0.7, 0.4).x, at(0.7, 0.4).y);
  await expect(canvas).toHaveAttribute("data-drawings", "2");

  // 重新整理後還在（存在瀏覽器）
  await page.reload();
  await expect(page.locator(".chart-canvas")).toHaveAttribute("data-drawings", "2");

  // 週線是另一份
  await page.getByRole("radio", { name: "週線" }).click();
  await expect(page.locator(".chart-canvas")).toHaveAttribute("data-drawings", "0");
  await page.getByRole("radio", { name: "日線" }).click();
  await expect(page.locator(".chart-canvas")).toHaveAttribute("data-drawings", "2");

  // 復原刪最後一條、清除刪全部（會先確認）
  await page.getByRole("button", { name: /復原/ }).click();
  await expect(page.locator(".chart-canvas")).toHaveAttribute("data-drawings", "1");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "清除" }).click();
  await expect(page.locator(".chart-canvas")).toHaveAttribute("data-drawings", "0");
  await expect(page.getByRole("button", { name: /復原/ })).toBeDisabled();

  // 選了工具後按 Esc 取消
  await page.getByRole("button", { name: /趨勢線/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".chart-canvas")).not.toHaveClass(/drawing/);
  await t.expectNoErrors();
});
