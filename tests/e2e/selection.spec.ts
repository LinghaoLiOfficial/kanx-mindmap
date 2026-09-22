import { test, expect, type Page } from "@playwright/test";
const topic = (page: Page, id: string) =>
  page.locator(`.react-flow__node [data-topic-id="${id}"]`);
const selected = (page: Page) =>
  page.locator(".react-flow__node .topic.is-selected");
async function expectSelection(page: Page, ids: string[]) {
  await expect(selected(page)).toHaveCount(ids.length);
  for (const id of ids)
    await expect(topic(page, id)).toHaveClass(/is-selected/);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".canvas-area")).toHaveClass(/is-ready/);
  await expect(topic(page, "observe")).toBeVisible();
});
for (const modifier of ["Control", "Meta"] as const) {
  test(`${modifier} toggles selection and focuses only the current topic`, async ({
    page,
  }) => {
    await topic(page, "observe").click();
    await topic(page, "collect").click({ modifiers: [modifier] });
    await expectSelection(page, ["observe", "collect"]);
    await expect(topic(page, "collect").locator("textarea")).toBeFocused();
    await topic(page, "collect").click({ modifiers: [modifier] });
    await expectSelection(page, ["observe"]);
    await expect(topic(page, "observe").locator("textarea")).toBeFocused();
    await topic(page, "observe").click({ modifiers: [modifier] });
    await expectSelection(page, []);
    await topic(page, "discover").click();
    await topic(page, "act").click({ modifiers: [modifier] });
    await topic(page, "collect").click();
    await expectSelection(page, ["collect"]);
  });
}
test("Shift selects sibling ranges, preserves anchor and wins over Ctrl", async ({
  page,
}) => {
  await topic(page, "organize").click();
  await topic(page, "tips").click({ modifiers: ["Shift"] });
  await expectSelection(page, ["organize", "act", "tips"]);
  await topic(page, "act").click({ modifiers: ["Shift"] });
  await expectSelection(page, ["organize", "act"]);
  await topic(page, "discover").click({ modifiers: ["Control", "Shift"] });
  await expectSelection(page, ["discover", "organize"]);
  await topic(page, "observe").click({ modifiers: ["Shift"] });
  await expectSelection(page, ["observe"]);
  await page.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
  await expectSelection(page, []);
});
for (const method of ["Delete", "Backspace", "toolbar"]) {
  test(`batch deletion via ${method} is one undoable operation`, async ({
    page,
  }) => {
    await topic(page, "observe").click();
    await topic(page, "step").click({ modifiers: ["Control"] });
    if (method === "toolbar")
      await page.getByRole("button", { name: "删除", exact: true }).click();
    else await page.keyboard.press(method);
    await expect(topic(page, "observe")).toHaveCount(0);
    await expect(topic(page, "step")).toHaveCount(0);
    await expectSelection(page, ["review"]);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(topic(page, "observe")).toBeVisible();
    await expect(topic(page, "step")).toBeVisible();
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(topic(page, "observe")).toHaveCount(0);
    await expect(topic(page, "step")).toHaveCount(0);
  });
}
test("multiple selection disables folding and dragging; editing restores single selection", async ({
  page,
}) => {
  await topic(page, "discover").click();
  await topic(page, "act").click({ modifiers: ["Control"] });
  await expect(
    page.getByRole("button", { name: "折叠", exact: true }),
  ).toBeDisabled();
  await expect(topic(page, "discover").locator(".fold-toggle")).toBeDisabled();
  const a = await topic(page, "act").boundingBox();
  if (!a) throw new Error("Missing topic");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 80, a.y + a.height / 2 + 30, {
    steps: 10,
  });
  await expect(page.locator(".canvas-area")).not.toHaveClass(/is-dragging/);
  await expect(
    page.locator(".drop-child, .drop-before, .drop-after"),
  ).toHaveCount(0);
  await page.mouse.up();
  await expectSelection(page, ["discover", "act"]);
  await page.keyboard.press("F2");
  await expectSelection(page, ["act"]);
  await expect(topic(page, "act")).toHaveClass(/is-editing/);
});
