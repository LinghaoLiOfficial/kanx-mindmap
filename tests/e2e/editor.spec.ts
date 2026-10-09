import { test, expect, type Page } from "@playwright/test";
import { sampleTree, type Tree } from "../../lib/mindmap/model";
const topic = (page: Page, id: string) =>
  page.locator(`.react-flow__node [data-topic-id="${id}"]`);
async function saved(page: Page): Promise<Tree> {
  await page.waitForTimeout(450);
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("kanx-mindmap.document.v1")!).tree,
  );
}
async function importTree(page: Page, tree: Tree) {
  await page.getByTestId("import-file").setInputFiles({
    name: "tree.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, tree })),
  });
  await expect(page.locator(".canvas-area")).toHaveClass(/is-ready/);
  await page.waitForTimeout(800);
}
async function topicCenter(page: Page, id: string) {
  const box = await topic(page, id).boundingBox();
  if (!box) throw new Error(`missing topic ${id}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function expectTopicCenter(
  page: Page,
  id: string,
  expected: { x: number; y: number },
) {
  await expect
    .poll(async () => {
      const actual = await topicCenter(page, id);
      return Math.max(
        Math.abs(actual.x - expected.x),
        Math.abs(actual.y - expected.y),
      );
    })
    .toBeLessThan(1);
}
async function drag(
  page: Page,
  from: string,
  to: string,
  zone: "child" | "before" | "after" = "child",
) {
  await topic(page, from).click({ trial: true });
  await topic(page, to).click({ trial: true });
  await page.waitForTimeout(250);
  const a = await topic(page, from).boundingBox(),
    b = await topic(page, to).boundingBox();
  if (!a || !b) throw new Error("missing drag target");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, {
    steps: 4,
  });
  await page.mouse.move(
    b.x + b.width / 2,
    b.y + b.height * (zone === "before" ? 0.1 : zone === "after" ? 0.9 : 0.5),
    { steps: 20 },
  );
  await expect(page.locator(`.react-flow__node.drop-${zone}`)).toBeVisible();
  await page.mouse.up();
  await page.waitForTimeout(650);
}
const runtimeErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().includes("https://reactflow.dev/error#002")) {
      errors.push(message.text());
    }
  });
  await page.goto("/");
  await expect(topic(page, "root")).toBeVisible();
  await expect(page.locator(".canvas-area")).toHaveClass(/is-ready/);
  await page.waitForTimeout(500);
});
test("initial appearance, screenshots, zoom, pan, fit, help and console", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".react-flow__node")).toHaveCount(13);
  await page.screenshot({ path: "test-results/screenshots/desktop-1440.png" });
  const zoom = page.locator(".react-flow__viewport");
  const initial = await zoom.getAttribute("style");
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(zoom).not.toHaveAttribute("style", initial!);
  await page.getByRole("button", { name: "缩小", exact: true }).click();
  await page.getByRole("button", { name: "适应画布" }).click();
  const canvas = page.locator(".react-flow__viewport");
  const before = await canvas.getAttribute("style");
  await page.mouse.move(800, 720);
  await page.mouse.down();
  await page.mouse.move(900, 740, { steps: 10 });
  await page.mouse.up();
  expect(await canvas.getAttribute("style")).not.toBe(before);
  await page.getByRole("button", { name: "适应画布" }).click();
  await page.getByRole("button", { name: "快捷键", exact: true }).click();
  await expect(page.getByLabel("快捷键说明")).toBeVisible();
  await page.getByRole("button", { name: "关闭帮助" }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "适应画布" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/screenshots/desktop-1024.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("add child/sibling, edit commit/cancel/blank/multiline, navigate and delete", async ({
  page,
}) => {
  await topic(page, "discover").click();
  await page.keyboard.press("Tab");
  let t = await saved(page);
  const id = t.nodes.discover.children.at(-1)!;
  await expect(topic(page, id)).toBeVisible();
  await page.keyboard.press("F2");
  const newTopicInput = page.getByRole("textbox", { name: "主题文本" });
  await expect(newTopicInput).toHaveValue("新主题");
  expect(
    await newTopicInput.evaluate((el: HTMLTextAreaElement) => [
      el.selectionStart,
      el.selectionEnd,
    ]),
  ).toEqual([0, 3]);
  await newTopicInput.fill("新的中文主题");
  await page.keyboard.press("Enter");
  await expect(topic(page, id)).toHaveText("新的中文主题");
  await page.keyboard.press("F2");
  await expect(page.getByRole("textbox")).toHaveValue("新的中文主题");
  await page.getByRole("textbox").fill("取消编辑");
  await page.keyboard.press("Escape");
  await expect(topic(page, id)).toHaveText("新的中文主题");
  await topic(page, id).dblclick();
  await page.getByRole("textbox").fill("第一行");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("second");
  await page.keyboard.press("Enter");
  await expect(topic(page, id)).toHaveText("第一行\nsecond");
  await page.keyboard.press("F2");
  await page.getByRole("textbox").fill("   ");
  await page.keyboard.press("Enter");
  await expect(topic(page, id)).toHaveText("新主题");
  await page.keyboard.press("Enter");
  t = await saved(page);
  const sibling = t.nodes.discover.children.at(-1)!;
  expect(sibling).not.toBe(id);
  await page.keyboard.press("ArrowUp");
  await expect(topic(page, id)).toHaveClass(/is-selected/);
  await page.keyboard.press("ArrowDown");
  await expect(topic(page, sibling)).toHaveClass(/is-selected/);
  await page.keyboard.press("ArrowLeft");
  await expect(topic(page, "discover")).toHaveClass(/is-selected/);
  await page.keyboard.press("ArrowRight");
  await expect(topic(page, id)).toHaveClass(/is-selected/);
  await topic(page, sibling).click();
  await page.keyboard.press("Delete");
  await expect(topic(page, sibling)).toHaveCount(0);
  await expect(topic(page, id)).toHaveClass(/is-selected/);
  await topic(page, "root").click();
  await page.keyboard.press("Delete");
  await expect(topic(page, "root")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "删除", exact: true }),
  ).toBeDisabled();
});
for (const method of ["Delete", "Backspace", "toolbar"] as const) {
  test(`deleting topics selects the previous sibling, next sibling or parent via ${method}`, async ({
    page,
  }) => {
    for (const [id, selected] of [
      ["observe", "collect"],
      ["collect", "discover"],
      ["organize", "discover"],
      ["discover", "act"],
      ["act", "tips"],
      ["tips", "root"],
    ]) {
      await topic(page, id).click();
      await page.evaluate(
        ({ id, selected }) => {
          const canvas = document.querySelector(".react-flow__nodes")!;
          const violations: string[] = [];
          const observer = new MutationObserver(() => {
            if (
              canvas.querySelector(`[data-topic-id="${id}"]`) &&
              canvas.querySelector(`[data-topic-id="${selected}"].is-selected`)
            ) {
              violations.push(
                "The next topic was selected before the deleted topic disappeared",
              );
            }
          });
          observer.observe(canvas, {
            childList: true,
            subtree: true,
            attributes: true,
          });
          Object.assign(window, { deletionCheck: { observer, violations } });
        },
        { id, selected },
      );
      if (method === "toolbar") {
        await page.getByRole("button", { name: "删除", exact: true }).click();
      } else {
        await page.keyboard.press(method);
      }
      await expect(topic(page, id)).toHaveCount(0);
      await expect(topic(page, selected)).toHaveClass(/is-selected/);
      await expect(page.locator(".topic.is-selected")).toHaveCount(1);
      const violations = await page.evaluate(() => {
        const check = (
          window as unknown as {
            deletionCheck: { observer: MutationObserver; violations: string[] };
          }
        ).deletionCheck;
        check.observer.disconnect();
        return check.violations;
      });
      expect(violations).toEqual([]);
    }
  });
}

test("fold/unfold, toolbar commands, undo/redo and reload persistence", async ({
  page,
}) => {
  await topic(page, "discover").click();
  await page.getByRole("button", { name: "折叠", exact: true }).click();
  await expect(topic(page, "observe")).toHaveCount(0);
  await page.getByRole("button", { name: "展开", exact: true }).click();
  await expect(topic(page, "observe")).toBeVisible();
  await page.getByRole("button", { name: "子主题", exact: false }).click();
  const id = (await saved(page)).nodes.discover.children.at(-1)!;
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(topic(page, id)).toHaveCount(0);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(topic(page, id)).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(topic(page, id)).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(topic(page, id)).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(topic(page, id)).toBeVisible();
  await topic(page, "discover").click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(topic(page, "discover")).toHaveCount(0);
  await expect(topic(page, id)).toHaveCount(0);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(topic(page, id)).toBeVisible();
});
test("drag reorder, reparent, collapsed destination, invalid and blank drop", async ({
  page,
}) => {
  await drag(page, "tips", "discover", "before");
  expect((await saved(page)).nodes.root.children).toEqual([
    "tips",
    "discover",
    "organize",
    "act",
  ]);
  await drag(page, "observe", "act");
  expect((await saved(page)).nodes.observe.parentId).toBe("act");
  await page
    .getByRole("button", { name: "折叠 梳理思路", exact: true })
    .click();
  await drag(page, "collect", "organize");
  const moved = await saved(page);
  expect(moved.nodes.collect.parentId).toBe("organize");
  expect(moved.nodes.organize.collapsed).toBe(false);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await saved(page)).nodes.collect.parentId).toBe("discover");
  const t = await saved(page),
    a = (await topic(page, "act").boundingBox())!,
    b = (await topic(page, "step").boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await expect(page.locator(".drop-child")).toHaveCount(0);
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await saved(page)).toEqual(t);
  const c = (await topic(page, "act").boundingBox())!;
  await page.mouse.move(c.x + 20, c.y + 20);
  await page.mouse.down();
  await page.mouse.move(1200, 700, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await saved(page)).toEqual(t);
});
test("JSON export/import, rejection, import undo and IME event isolation", async ({
  page,
}) => {
  const exported = await page.evaluate(() => {
    const raw = localStorage.getItem("kanx-mindmap.document.v1");
    return raw ? JSON.parse(raw) : null;
  });
  expect(exported.version).toBe(2);
  expect(exported.tree.nodes.root.kind).toBe("text");
  expect(exported.tree.nodes.root.text).toBe("让好想法，生长");
  const changed = sampleTree();
  changed.nodes.root.text = "导入后的主题";
  await importTree(page, changed);
  await expect(topic(page, "root")).toContainText("导入后的主题");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(topic(page, "root")).toContainText("让好想法，生长");
  await page.getByTestId("import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":1,"tree":{}}'),
  });
  await expect(page.locator(".error-toast[role=alert]")).toBeVisible();
  await expect(topic(page, "root")).toContainText("让好想法，生长");
  await page.getByRole("button", { name: "关闭提示" }).click();
  await topic(page, "observe").dblclick();
  const input = page.getByRole("textbox");
  await input.dispatchEvent("compositionstart");
  await input.fill("中文输入测试");
  await input.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
    bubbles: true,
  });
  await expect(input).toBeVisible();
  await input.dispatchEvent("compositionend");
  await page.keyboard.press("Enter");
  await expect(topic(page, "observe")).toHaveText("中文输入测试");
  await topic(page, "observe").dblclick();
  await input.fill("失焦保存");
  await page.getByRole("button", { name: "自动布局" }).click();
  await expect(topic(page, "observe")).toHaveText("失焦保存");
});
test("long multiline layout and repeated automatic layouts do not overlap", async ({
  page,
}) => {
  const t = sampleTree();
  t.nodes.observe.text =
    "这是一段用于验证动态节点测量的很长的中文内容，需要自动换行并且不能遮挡旁边的主题。\n第二行保留换行";
  await importTree(page, t);
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "自动布局" }).click();
  await page.waitForTimeout(600);
  const boxes = await page
    .locator(".react-flow__node .topic")
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      expect(
        a.x + a.w <= b.x + 1 ||
          b.x + b.w <= a.x + 1 ||
          a.y + a.h <= b.y + 1 ||
          b.y + b.h <= a.y + 1,
      ).toBe(true);
    }
  await page.screenshot({ path: "test-results/screenshots/multiline.png" });
});

test("XMind-style edges stay outside non-endpoint topics", async ({ page }) => {
  const tree: Tree = {
    rootId: "root",
    nodes: {
      root: {
        kind: "text",
        id: "root",
        text: "单个论文画像",
        parentId: null,
        children: ["metadata", "long-topic"],
        collapsed: false,
      },
      metadata: {
        kind: "text",
        id: "metadata",
        text: "文献元数据",
        parentId: "root",
        children: ["title", "author", "journal", "date", "abstract", "keyword"],
        collapsed: false,
      },
      "long-topic": {
        kind: "text",
        id: "long-topic",
        text: "大语言模型下的人机协同知识管理新模式",
        parentId: "root",
        children: [],
        collapsed: false,
      },
      title: {
        kind: "text",
        id: "title",
        text: "标题",
        parentId: "metadata",
        children: [],
        collapsed: false,
      },
      author: {
        kind: "text",
        id: "author",
        text: "作者",
        parentId: "metadata",
        children: [],
        collapsed: false,
      },
      journal: {
        kind: "text",
        id: "journal",
        text: "期刊",
        parentId: "metadata",
        children: [],
        collapsed: false,
      },
      date: {
        kind: "text",
        id: "date",
        text: "发表时间",
        parentId: "metadata",
        children: [],
        collapsed: false,
      },
      abstract: {
        kind: "text",
        id: "abstract",
        text: "摘要",
        parentId: "metadata",
        children: ["detail"],
        collapsed: false,
      },
      keyword: {
        kind: "text",
        id: "keyword",
        text: "关键词",
        parentId: "metadata",
        children: [],
        collapsed: false,
      },
      detail: {
        kind: "text",
        id: "detail",
        text: "分点提炼",
        parentId: "abstract",
        children: ["entity", "description"],
        collapsed: false,
      },
      entity: {
        kind: "text",
        id: "entity",
        text: "实体",
        parentId: "detail",
        children: [],
        collapsed: false,
      },
      description: {
        kind: "text",
        id: "description",
        text: "阐述",
        parentId: "detail",
        children: [],
        collapsed: false,
      },
    },
  };
  await importTree(page, tree);
  await page.getByRole("button", { name: "适应画布" }).click();
  await page.waitForTimeout(350);

  const paths = page.locator(".react-flow__edge-path");
  await expect(paths).toHaveCount(11);
  const pathData = await paths.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("d") ?? ""),
  );
  expect(pathData.every((path) => /^M .+ H /.test(path))).toBe(true);
  expect(pathData.some((path) => /H.+C.+H/.test(path))).toBe(true);

  const intersections = await paths.evaluateAll((elements) => {
    const topics = Array.from(
      document.querySelectorAll<HTMLElement>("[data-topic-id]"),
    ).map((element) => ({
      id: element.dataset.topicId!,
      rect: element.getBoundingClientRect(),
    }));
    const hits: string[] = [];
    for (const [edgeIndex, element] of elements.entries()) {
      const path = element as SVGPathElement,
        matrix = path.getScreenCTM();
      if (!matrix) continue;
      const length = path.getTotalLength(),
        screenPoint = (distance: number) => {
          const point = path.getPointAtLength(distance);
          return new DOMPoint(point.x, point.y).matrixTransform(matrix);
        },
        start = screenPoint(0),
        end = screenPoint(length),
        endpoints = new Set(
          topics
            .filter(({ rect }) =>
              [start, end].some(
                (point) =>
                  point.x >= rect.left - 2 &&
                  point.x <= rect.right + 2 &&
                  point.y >= rect.top - 2 &&
                  point.y <= rect.bottom + 2,
              ),
            )
            .map(({ id }) => id),
        );
      for (let distance = 1; distance < length; distance += 1) {
        const point = screenPoint(distance);
        for (const { id, rect } of topics) {
          if (
            !endpoints.has(id) &&
            point.x > rect.left + 1 &&
            point.x < rect.right - 1 &&
            point.y > rect.top + 1 &&
            point.y < rect.bottom - 1
          )
            hits.push(`edge ${edgeIndex} crossed ${id}`);
        }
      }
    }
    return hits;
  });
  expect(intersections).toEqual([]);
  expect(
    new Set(
      await paths.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).stroke),
      ),
    ).size,
  ).toBeGreaterThan(1);
  await page.screenshot({ path: "test-results/screenshots/xmind-edges.png" });
});

for (const count of [100, 300, 500])
  test(`scale ${count}: layout, fold, edit and zoom`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    const tree: Tree = {
      rootId: "r",
      nodes: {
        r: {
          kind: "text",
          id: "r",
          parentId: null,
          children: [],
          text: `${count} 节点规模验证`,
          collapsed: false,
        },
      },
    };
    for (let i = 1; i < count; i++) {
      const id = `n${i}`,
        parentId = i <= 10 ? "r" : `n${1 + (i % 10)}`;
      tree.nodes[id] = {
        kind: "text",
        id,
        parentId,
        children: [],
        text: `主题 ${i} · 性能验证`,
        collapsed: false,
      };
      tree.nodes[parentId].children.push(id);
    }
    const start = Date.now();
    await importTree(page, tree);
    await expect(page.locator(".react-flow__node")).toHaveCount(count);
    const layoutMs = Date.now() - start;
    await page.getByRole("button", { name: "重置缩放" }).click();
    await page.waitForTimeout(250);
    // Select root through the rendered node after fitting to keep the operation user-facing.
    await page.getByRole("button", { name: "适应画布" }).click();
    await page.waitForTimeout(250);
    const foldStart = Date.now();
    await page.getByRole("button", { name: "折叠", exact: true }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(1);
    const foldMs = Date.now() - foldStart;
    await page.getByRole("button", { name: "适应画布" }).click();
    await page.waitForTimeout(300);
    await topic(page, "r").dblclick();
    await page.getByRole("textbox").fill(`${count} 个节点编辑完成`);
    await page.keyboard.press("Enter");
    await expect(topic(page, "r")).toContainText("编辑完成");
    await page.getByRole("button", { name: "展开", exact: true }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(count);
    await page.getByRole("button", { name: "放大", exact: true }).click();
    await testInfo.attach("performance", {
      body: JSON.stringify({ count, layoutMs, foldMs }),
      contentType: "application/json",
    });
    console.log(JSON.stringify({ count, layoutMs, foldMs }));
  });

test("storage failures remain editable and corrupt saved documents fall back safely", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("storage unavailable", "QuotaExceededError");
    };
  });
  await page.reload();
  await expect(page.locator(".error-toast")).toContainText("本地保存失败");
  await topic(page, "root").click();
  await page.keyboard.press("Tab");
  await expect(page.locator(".react-flow__node")).toHaveCount(14);
  await expect(page.locator(".error-toast")).toBeVisible();
});

test("corrupt storage shows a recoverable error and reduced motion disables layout transitions", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("kanx-mindmap.document.v1", '{"version":1,"tree":{}}'),
  );
  await page.reload();
  await expect(page.locator(".error-toast")).toContainText("无法读取");
  await expect(topic(page, "root")).toBeVisible();
  await page.getByRole("button", { name: "关闭提示" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".react-flow__node").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await topic(page, "discover").click();
  const before = await page
    .locator('.react-flow__node[data-id="discover"]')
    .evaluate((el) => getComputedStyle(el).transform);
  await page.keyboard.press("ArrowRight");
  await expect(topic(page, "collect")).toHaveClass(/is-selected/);
  expect(
    await page
      .locator('.react-flow__node[data-id="discover"]')
      .evaluate((el) => getComputedStyle(el).transform),
  ).toBe(before);
});

test("direct typing replaces once, cancels, undoes and supports native composition", async ({
  page,
}) => {
  const node = topic(page, "observe");
  await node.click();
  await page.keyboard.type("New 123!");
  const input = page.getByRole("textbox", { name: "主题文本" });
  await expect(input).toHaveValue("New 123!");
  await page.keyboard.press("Enter");
  await expect(node).toHaveText("New 123!");
  await page.keyboard.press("Control+z");
  await expect(node).toHaveText("保持好奇，观察日常");
  await page.keyboard.press("Control+Shift+z");
  await expect(node).toHaveText("New 123!");
  await node.click();
  await page.keyboard.type("cancel");
  await page.keyboard.press("Escape");
  await expect(node).toHaveText("New 123!");
  await node.click();
  const client = await page.context().newCDPSession(page);
  await client.send("Input.imeSetComposition", {
    text: "中文",
    selectionStart: 2,
    selectionEnd: 2,
  });
  await expect(input).toHaveValue("中文");
  await input.dispatchEvent("keydown", {
    key: "Enter",
    isComposing: true,
    bubbles: true,
  });
  await expect(node).toHaveClass(/is-editing/);
  await client.send("Input.insertText", { text: "中文主题" });
  await expect(input).toHaveValue("中文主题");
  await page.keyboard.press("Enter");
  await expect(node).toHaveText("中文主题");
  await client.detach();
});

test("pasting an image creates one image child with its natural ratio", async ({ page }) => {
  await topic(page, "discover").click();
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 1;
    canvas.getContext("2d")?.fillRect(0, 0, 2, 1);
    const image = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob!), "image/png"),
    );
    const clipboard = new DataTransfer();
    clipboard.items.add("ignored", "text/plain");
    clipboard.items.add(new File([image], "first.png", { type: "image/png" }));
    clipboard.items.add(new File([image], "second.png", { type: "image/png" }));
    document.querySelector(".mindmap-root")?.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    );
  });
  await expect.poll(async () => {
    const tree = await saved(page);
    return Object.values(tree.nodes).filter((node) => node.kind === "image").length;
  }).toBe(1);
  const tree = await saved(page);
  const image = Object.values(tree.nodes).find((node) => node.kind === "image");
  expect(image).toMatchObject({
    parentId: "discover",
    image: { width: 200, aspectRatio: 2 },
  });
  await expect(page.locator(".react-flow__node .topic-image")).toHaveCount(1);
});

test("editing preserves initial geometry then grows with draft", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "重置缩放" }).click();
  const node = topic(page, "discover");
  await node.click();
  const canvas = page.locator(".canvas-area");
  const geometry = () =>
    page.locator(".react-flow__node .topic").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
    );
  const before = await geometry();
  await expect(canvas).toHaveScreenshot("topic-before.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.002,
  });
  await node.dblclick();
  const input = page.getByRole("textbox", { name: "主题文本" });
  await expect(input).toHaveValue("发现灵感");
  expect(
    await input.evaluate((el: HTMLTextAreaElement) => [
      el.selectionStart,
      el.selectionEnd,
    ]),
  ).toEqual([4, 4]);
  expect(await geometry()).toEqual(before);
  await expect(input).toHaveCSS("resize", "none");
  await expect(canvas).toHaveScreenshot("topic-editing.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.002,
  });
  await input.fill(
    "第一行很长的中文主题，需要保持画布稳定\n第二行继续输入\n第三行继续输入",
  );
  expect((await node.boundingBox())!.height).toBeGreaterThan(before[1][3]);
  await expect(canvas).toHaveScreenshot("topic-editing-grown.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.002,
  });
  await page.keyboard.press("Enter");
  await expect(node).not.toHaveClass(/is-editing/);
  await expect
    .poll(async () => JSON.stringify(await geometry()))
    .not.toBe(JSON.stringify(before));
  await expect(canvas).toHaveScreenshot("topic-committed.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.002,
  });
  const boxes = await geometry();
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [x, y, w, h] = boxes[i],
        [a, b, c, d] = boxes[j];
      expect(
        x + w <= a + 1 || a + c <= x + 1 || y + h <= b + 1 || b + d <= y + 1,
      ).toBe(true);
    }
});

for (const mode of ["letters", "ime"] as const) {
  test(`single root Tab transfers input to new child (${mode})`, async ({
    page,
  }) => {
    await importTree(page, {
      rootId: "root",
      nodes: {
        root: {
          kind: "text",
          id: "root",
          parentId: null,
          children: [],
          text: "单个论文画像",
          collapsed: false,
        },
      },
    });
    await topic(page, "root").click();
    await page.keyboard.press("Tab");
    const child = page.locator(
      '.react-flow__node .topic.is-selected:not([data-topic-id="root"])',
    );
    await expect(child).toBeVisible();
    await expect(child.locator("textarea")).toBeFocused();
    // Do not click the child or use F2: typing must follow the selection.
    if (mode === "letters") {
      await page.keyboard.type("Paper123");
    } else {
      const client = await page.context().newCDPSession(page);
      await client.send("Input.imeSetComposition", {
        text: "文",
        selectionStart: 1,
        selectionEnd: 1,
      });
      await expect(child.locator("textarea")).toHaveValue("文");
      await client.send("Input.insertText", { text: "文献元数据" });
      await client.detach();
    }
    await expect(child).toHaveClass(/is-editing/);
    await page.keyboard.press("Enter");
    await expect(child).toHaveText(
      mode === "letters" ? "Paper123" : "文献元数据",
    );
    await expect(topic(page, "root")).toContainText("单个论文画像");
    const tree = await saved(page);
    expect(tree.nodes.root.text).toBe("单个论文画像");
    expect(tree.nodes[tree.nodes.root.children[0]].text).toBe(
      mode === "letters" ? "Paper123" : "文献元数据",
    );
  });
}

test("draft grows in two width steps then wraps, and Escape restores size", async ({
  page,
}) => {
  await page.getByRole("button", { name: "重置缩放" }).click();
  await topic(page, "discover").click();
  await page.keyboard.press("Tab");
  const node = page.locator(".react-flow__node .topic.is-selected");
  await expect(node).toHaveText("新主题");
  const size = () =>
    node.evaluate((el) => ({
      width: (el as HTMLElement).offsetWidth,
      height: (el as HTMLElement).offsetHeight,
    }));
  const original = await size();
  await page.keyboard.press("F2");
  const input = page.getByRole("textbox", { name: "主题文本" });
  expect(await size()).toEqual(original);
  await input.fill("文".repeat(6));
  const first = await size();
  expect(first.width).toBeGreaterThan(original.width);
  expect(first.width).toBeLessThan(260);
  expect(first.height).toBe(original.height);
  await input.fill("文".repeat(12));
  expect((await size()).width).toBe(260);
  expect((await size()).height).toBe(original.height);
  await input.fill("文".repeat(60) + "\n");
  const wrapped = await size();
  expect(wrapped.width).toBe(260);
  expect(wrapped.height).toBeGreaterThan(original.height);
  expect(
    await input.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  ).toBe(true);
  await input.fill("短");
  expect((await size()).width).toBe(260);
  await page.keyboard.press("Escape");
  expect(await size()).toEqual(original);
  await expect(node).toHaveText("新主题");
});

test("blank canvas clears selection and only held left button shows grabbing", async ({
  page,
}) => {
  const pane = page.locator(".react-flow__pane");
  await topic(page, "observe").click();
  await expect(pane).toHaveCSS("cursor", "default");
  await page.mouse.move(100, 450);
  await page.mouse.down();
  await expect(pane).toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  await expect(pane).toHaveCSS("cursor", "default");
  await expect(page.locator(".topic.is-selected")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "删除", exact: true }),
  ).toBeDisabled();
  await page.keyboard.type("abc123");
  await page.keyboard.press("Delete");
  await expect(page.getByRole("textbox", { name: "主题文本" })).toHaveCount(0);
  await expect(page.locator(".react-flow__node")).toHaveCount(13);
  await topic(page, "observe").click();
  await page.keyboard.type("selected");
  await expect(page.getByRole("textbox", { name: "主题文本" })).toHaveValue(
    "selected",
  );
  await pane.click({ position: { x: 100, y: 200 } });
  await expect(page.locator(".topic.is-selected")).toHaveCount(0);
  await expect(topic(page, "observe")).toHaveText("selected");
});

for (const commit of ["Enter", "blank"] as const) {
  test(`committing with ${commit} never paints the previous text`, async ({
    page,
  }) => {
    const node = topic(page, "observe");
    await node.dblclick();
    await page
      .getByRole("textbox", { name: "主题文本" })
      .fill("修改后的主题文本");
    await node.evaluate((el) => {
      const samples: string[] = [];
      (window as unknown as { commitSamples: string[] }).commitSamples =
        samples;
      let frames = 0;
      const record = () => {
        if (!el.classList.contains("is-editing"))
          samples.push(el.querySelector(".topic-content > span")!.textContent!);
        if (++frames < 45) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });
    if (commit === "Enter") await page.keyboard.press("Enter");
    else
      await page
        .locator(".react-flow__pane")
        .click({ position: { x: 100, y: 200 } });
    await expect(node).toHaveText("修改后的主题文本");
    await page.waitForTimeout(800);
    const samples = await page.evaluate(
      () => (window as unknown as { commitSamples: string[] }).commitSamples,
    );
    expect(samples.length).toBeGreaterThan(0);
    expect([...new Set(samples)]).toEqual(["修改后的主题文本"]);
  });
}

test("root children align regardless of descendants or text width", async ({
  page,
}) => {
  const tree = sampleTree();
  for (const [id, text] of [
    ["short", "短主题"],
    ["long", "这是一个较长的主题文本，需要换行显示，而且没有子主题"],
  ]) {
    tree.nodes[id] = {
      kind: "text",
      id,
      text,
      parentId: "root",
      children: [],
      collapsed: false,
    };
    tree.nodes.root.children.push(id);
  }
  await importTree(page, tree);
  const assertAligned = async () => {
    const xs = await Promise.all(
      tree.nodes.root.children.map(
        async (id) => (await topic(page, id).boundingBox())!.x,
      ),
    );
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
  };
  await assertAligned();
  await page
    .getByRole("button", { name: "折叠 发现灵感", exact: true })
    .click();
  await expect(topic(page, "observe")).toHaveCount(0);
  await assertAligned();
  await page.getByRole("button", { name: "自动布局", exact: true }).click();
  await assertAligned();
});

test("structural relayout keeps the root center and viewport fixed", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await importTree(page, sampleTree());
  await page.getByRole("button", { name: "适应画布" }).click();
  await page.waitForTimeout(250);
  const root = await topicCenter(page, "root"),
    viewport = page.locator(".react-flow__viewport"),
    initialViewport = await viewport.getAttribute("style");
  const assertStable = async () => {
    await expectTopicCenter(page, "root", root);
    await expect(viewport).toHaveAttribute("style", initialViewport!);
  };

  await page.getByRole("button", { name: "自动布局", exact: true }).click();
  await assertStable();
  await topic(page, "discover").click();
  await page.getByRole("button", { name: "折叠", exact: true }).click();
  await expect(topic(page, "observe")).toHaveCount(0);
  await assertStable();
  await page.getByRole("button", { name: "展开", exact: true }).click();
  await expect(topic(page, "observe")).toBeVisible();
  await assertStable();
  await topic(page, "act").click();
  await page.keyboard.press("Delete");
  await expect(topic(page, "act")).toHaveCount(0);
  await assertStable();
  await page.keyboard.press("Control+z");
  await expect(topic(page, "act")).toBeVisible();
  await assertStable();
  await page.keyboard.press("Control+Shift+z");
  await expect(topic(page, "act")).toHaveCount(0);
  await assertStable();
});

test("root text growth stays center-anchored", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await importTree(page, sampleTree());
  const before = await topicCenter(page, "root"),
    viewport = page.locator(".react-flow__viewport"),
    initialViewport = await viewport.getAttribute("style");
  await topic(page, "root").dblclick();
  await page
    .getByRole("textbox", { name: "主题文本" })
    .fill("这是一个明显更长并且会改变根主题宽高的中心主题\n第二行");
  await page.keyboard.press("Enter");
  await expect(topic(page, "root")).toContainText("第二行");
  await expectTopicCenter(page, "root", before);
  await expect(viewport).toHaveAttribute("style", initialViewport!);
});

test("an offscreen added topic is minimally revealed without changing zoom", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 480 });
  await importTree(page, {
    rootId: "root",
    nodes: {
      root: {
        kind: "text",
        id: "root",
        parentId: null,
        children: [],
        text: "根主题",
        collapsed: false,
      },
    },
  });
  await page.getByRole("button", { name: "适应画布" }).click();
  await page.waitForTimeout(250);
  const viewport = page.locator(".react-flow__viewport"),
    beforeTransform = await viewport.getAttribute("style"),
    beforeZoom = await viewport.evaluate(
      (element) => new DOMMatrix(getComputedStyle(element).transform).a,
    ),
    rootWorldTransform = await topic(page, "root").evaluate(
      (element) =>
        element.closest<HTMLElement>(".react-flow__node")!.style.transform,
    );

  await topic(page, "root").click();
  for (let depth = 0; depth < 5; depth++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
  }

  await expect(viewport).not.toHaveAttribute("style", beforeTransform!);
  expect(
    await viewport.evaluate(
      (element) => new DOMMatrix(getComputedStyle(element).transform).a,
    ),
  ).toBeCloseTo(beforeZoom, 5);
  expect(
    await topic(page, "root").evaluate(
      (element) =>
        element.closest<HTMLElement>(".react-flow__node")!.style.transform,
    ),
  ).toBe(rootWorldTransform);
  const selected = page.locator(".react-flow__node .topic.is-selected"),
    selectedBox = await selected.boundingBox(),
    canvasBox = await page.locator(".canvas-area").boundingBox();
  expect(selectedBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(selectedBox!.x).toBeGreaterThanOrEqual(canvasBox!.x + 31);
  expect(selectedBox!.x + selectedBox!.width).toBeLessThanOrEqual(
    canvasBox!.x + canvasBox!.width - 31,
  );
  expect(selectedBox!.y).toBeGreaterThanOrEqual(canvasBox!.y + 31);
  expect(selectedBox!.y + selectedBox!.height).toBeLessThanOrEqual(
    canvasBox!.y + canvasBox!.height - 31,
  );
});
