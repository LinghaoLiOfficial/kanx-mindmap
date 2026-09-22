import { test, expect } from "@playwright/test";
import { palettes, PALETTE_STORAGE } from "../../lib/mindmap/palettes";

test("palette panel toggles, applies every theme without moving the map, and persists", async ({
  page,
}) => {
  const lastPalette = palettes[palettes.length - 1];
  expect(palettes[0].canvas).toBe("#ffffff");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const root = page.locator(".react-flow__node .topic-root");
  await expect(root).toBeVisible();
  const toggle = page.getByRole("button", { name: "配色", exact: true });
  const panel = page.getByRole("complementary", { name: "配方方案" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(panel).toBeVisible();
  await page.waitForTimeout(300);
  const statusbar = page.locator(".statusbar");
  const canvas = page.locator(".canvas-area");
  const panelBounds = (await panel.boundingBox())!;
  const canvasBounds = (await canvas.boundingBox())!;
  const panelBottom = panelBounds.y + panelBounds.height;
  const statusbarTop = (await statusbar.boundingBox())!.y;
  expect(panelBottom).toBeLessThanOrEqual(statusbarTop);
  expect(panelBounds.x + panelBounds.width).toBeCloseTo(
    canvasBounds.x + canvasBounds.width - 18,
    0,
  );
  expect(panelBounds.y).toBeCloseTo(canvasBounds.y + 18, 0);
  expect(statusbarTop - panelBottom).toBeCloseTo(18, 0);
  await page.getByRole("button", { name: "快捷键" }).click();
  const help = page.getByLabel("快捷键说明");
  await expect(help).toBeVisible();
  const [helpBox, paletteBox] = await Promise.all([
    help.boundingBox(),
    panel.boundingBox(),
  ]);
  expect(helpBox!.x + helpBox!.width).toBeLessThanOrEqual(paletteBox!.x);
  expect(
    Math.abs(
      helpBox!.y + helpBox!.height - (paletteBox!.y + paletteBox!.height),
    ),
  ).toBeLessThanOrEqual(1);
  expect(paletteBox!.y + paletteBox!.height).toBeLessThanOrEqual(statusbarTop);
  expect(paletteBox!.x + paletteBox!.width).toBeCloseTo(
    canvasBounds.x + canvasBounds.width - 18,
    0,
  );
  await help.getByRole("button", { name: "关闭帮助" }).click();
  await expect(
    panel
      .getByRole("group", { name: "配色方案" })
      .getByRole("button", { pressed: false }),
  ).toHaveCount(palettes.length - 1);
  const viewport = page.locator(".react-flow__viewport");
  // Allow the initial fit-to-view to finish before comparing transforms.
  await page.waitForTimeout(400);
  const position = await viewport.getAttribute("style");
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  for (const palette of palettes) {
    await panel
      .getByRole("button", { name: palette.name, exact: true })
      .click();
    await expect(root).toHaveCSS("background-color", rgb(palette.root));
    await expect(page.locator(".canvas-area")).toHaveCSS(
      "background-color",
      rgb(palette.canvas),
    );
    await expect(
      panel.getByRole("button", { name: palette.name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const edgeColors = await page
      .locator(".react-flow__edge-path")
      .evaluateAll((edges) =>
        edges.map((edge) => getComputedStyle(edge).stroke),
      );
    expect(edgeColors.length).toBeGreaterThan(0);
    expect(
      edgeColors.every((color) => palette.branches.map(rgb).includes(color)),
    ).toBe(true);
    await expect(viewport).toHaveAttribute("style", position!);
  }
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await expect(panel).toBeVisible();
  await toggle.click();
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(root).toHaveCSS("background-color", rgb(lastPalette.root));
  expect(
    await page.evaluate((key) => localStorage.getItem(key), PALETTE_STORAGE),
  ).toBe(lastPalette.id);
  await page.setViewportSize({ width: 390, height: 740 });
  await toggle.click();
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: lastPalette.name })
    .scrollIntoViewIfNeeded();
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/palette-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/palette-desktop.png" });
  await panel.getByRole("button", { name: "收起配色" }).click();
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});
