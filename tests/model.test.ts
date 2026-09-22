import { describe, expect, it, beforeEach } from "vitest";
import {
  applyCommand,
  descendants,
  parseDocument,
  sampleTree,
  visible,
  type Tree,
} from "../lib/mindmap/model";
import { createMindMapStore, type MindMapStore } from "../lib/mindmap/store";
import { ElkMindMapLayout, LayoutRequestGuard } from "../lib/mindmap/layout";
describe("canonical tree commands", () => {
  it("adds a child or sibling at its semantic index, expands parent", () => {
    let t = sampleTree();
    t = applyCommand(t, { type: "collapse", id: "discover" });
    t = applyCommand(t, {
      type: "add",
      parentId: "discover",
      id: "new",
      index: 1,
    });
    expect(t.nodes.discover.children).toEqual(["observe", "new", "collect"]);
    expect(t.nodes.discover.collapsed).toBe(false);
    expect(t.nodes.new.parentId).toBe("discover");
  });
  it("deletes entire subtrees and protects root", () => {
    const t = sampleTree();
    expect(applyCommand(t, { type: "delete", id: "root" })).toBe(t);
    const next = applyCommand(t, { type: "delete", id: "discover" });
    expect(next.nodes.discover).toBeUndefined();
    expect(next.nodes.observe).toBeUndefined();
    expect(next.nodes.root.children).not.toContain("discover");
    expect(t.nodes.observe).toBeDefined();
  });
  it("commits multiline text and normalizes blank input", () => {
    const t = applyCommand(sampleTree(), {
      type: "text",
      id: "root",
      text: "中文\nmultiline",
    });
    expect(t.nodes.root.text).toBe("中文\nmultiline");
    expect(
      applyCommand(t, { type: "text", id: "root", text: "  " }).nodes.root.text,
    ).toBe("新主题");
  });
  it("hides descendants while preserving all business data", () => {
    const t = applyCommand(sampleTree(), { type: "collapse", id: "discover" });
    expect(visible(t).some((n) => n.id === "observe")).toBe(false);
    expect(descendants(t, "discover")).toHaveLength(2);
    expect(
      visible(applyCommand(t, { type: "collapse", id: "discover" })),
    ).toHaveLength(13);
  });
  it("reorders forward and backward correctly", () => {
    const t = sampleTree();
    const moved = applyCommand(t, {
      type: "move",
      id: "discover",
      parentId: "root",
      index: 3,
    });
    expect(moved.nodes.root.children).toEqual([
      "organize",
      "act",
      "discover",
      "tips",
    ]);
    expect(
      applyCommand(moved, {
        type: "move",
        id: "discover",
        parentId: "root",
        index: 0,
      }).nodes.root.children,
    ).toEqual(t.nodes.root.children);
  });
  it("reparents subtrees and prevents cycles or root movement", () => {
    const t = sampleTree();
    for (const [id, parentId] of [
      ["root", "act"],
      ["discover", "observe"],
      ["discover", "discover"],
    ])
      expect(applyCommand(t, { type: "move", id, parentId, index: 0 })).toBe(t);
    const next = applyCommand(t, {
      type: "move",
      id: "discover",
      parentId: "act",
      index: 1,
    });
    expect(next.nodes.discover.parentId).toBe("act");
    expect(next.nodes.act.children).toEqual(["step", "discover", "review"]);
    expect(next.nodes.observe.parentId).toBe("discover");
  });
});
describe("history and import", () => {
  let store: MindMapStore;
  beforeEach(() => {
    store = createMindMapStore(sampleTree());
  });
  it("selects the next sibling when deleting the first topic, then the parent when none remain", () => {
    const s = store.getState;
    s().select("observe");
    s().execute({ type: "delete", id: "observe" });
    expect(s().selected).toBe("collect");

    s().execute({ type: "delete", id: "collect" });
    expect(s().selected).toBe("discover");
  });
  it("selects the preceding sibling after deleting a selected topic", () => {
    const s = store.getState;
    s().select("collect");
    s().execute({ type: "delete", id: "collect" });
    expect(s().selected).toBe("observe");

    s().select("observe");
    s().execute({ type: "delete", id: "observe" });
    expect(s().selected).toBe("discover");
  });
  it("undoes and redoes every semantic command including import", () => {
    const s = store.getState,
      initial = s().tree;
    s().execute({ type: "add", id: "new", parentId: "root" });
    s().execute({ type: "text", id: "new", text: "hello" });
    s().execute({ type: "move", id: "new", parentId: "act", index: 1 });
    s().execute({ type: "collapse", id: "act" });
    s().execute({ type: "delete", id: "act" });
    s().execute({ type: "import", tree: sampleTree() });
    expect(s().history).toHaveLength(6);
    for (let i = 0; i < 6; i++) s().undo();
    expect(s().tree).toEqual(initial);
    for (let i = 0; i < 6; i++) s().redo();
    expect(s().tree).toEqual(sampleTree());
    s().undo();
    s().execute({ type: "text", id: "root", text: "new branch" });
    expect(s().future).toHaveLength(0);
  });
  it("round trips JSON, removes unknown fields and rejects invalid graphs", () => {
    const t = sampleTree();
    expect(
      parseDocument(JSON.parse(JSON.stringify({ version: 1, tree: t }))),
    ).toEqual(t);
    const invalid: unknown[] = [null, {}, { version: 2, tree: { rootId: "missing", nodes: {} } }];
    for (const modify of [
      (t: Tree) => {
        t.nodes.root.parentId = "act";
      },
      (t: Tree) => {
        t.nodes.root.children.push("missing");
      },
      (t: Tree) => {
        t.nodes.act.children.push("root");
      },
      (t: Tree) => {
        t.nodes.root.children.push("act");
      },
      (t: Tree) => {
        t.nodes.root.children = t.nodes.root.children.filter(
          (id) => id !== "act",
        );
      },
      (t: Tree) => {
        t.nodes.observe.parentId = "act";
      },
    ]) {
      const bad = sampleTree();
      modify(bad);
      invalid.push({ version: 1, tree: bad });
    }
    for (const value of invalid) expect(() => parseDocument(value)).toThrow();
  });
  it("supports image nodes, resizing, and rejects text edits on images", () => {
    const tree = sampleTree();
    const image = applyCommand(tree, {
      type: "addImage", parentId: "root", id: "picture", assetId: "asset-1", width: 200, aspectRatio: 2,
    });
    expect(image.nodes.picture).toMatchObject({ kind: "image", image: { assetId: "asset-1", width: 200, aspectRatio: 2 } });
    expect(applyCommand(image, { type: "text", id: "picture", text: "nope" })).toBe(image);
    const resized = applyCommand(image, { type: "resizeImage", id: "picture", width: 1200 });
    expect(resized.nodes.picture).toMatchObject({ kind: "image", image: { width: 1200 } });
    expect(applyCommand(image, { type: "resizeImage", id: "picture", width: 1201 })).toBe(image);
    expect(() => parseDocument({ version: 2, tree: resized })).not.toThrow();
  });
  it("keeps image history and rejects malformed image metadata", () => {
    const store = createMindMapStore(sampleTree());
    store.getState().execute({
      type: "addImage",
      parentId: "root",
      id: "picture",
      assetId: "asset-1",
      width: 200,
      aspectRatio: 1.5,
    });
    store.getState().execute({ type: "resizeImage", id: "picture", width: 1200 });
    expect(store.getState().tree.nodes.picture).toMatchObject({
      image: { width: 1200 },
    });
    store.getState().undo();
    expect(store.getState().tree.nodes.picture).toMatchObject({
      image: { width: 200 },
    });
    store.getState().redo();
    expect(store.getState().tree.nodes.picture).toMatchObject({
      image: { width: 1200 },
    });
    for (const image of [
      { assetId: "", width: 200, aspectRatio: 1 },
      { assetId: "  ", width: 200, aspectRatio: 1 },
      { assetId: "asset", width: 79, aspectRatio: 1 },
      { assetId: "asset", width: 1201, aspectRatio: 1 },
      { assetId: "asset", width: 200, aspectRatio: 0 },
      { assetId: "asset", width: 200, aspectRatio: -1 },
    ]) {
      expect(
        applyCommand(sampleTree(), {
          type: "addImage",
          parentId: "root",
          id: "bad",
          ...image,
        }),
      ).toEqual(sampleTree());
    }
  });
});
describe("ELK layout", () => {
  it("anchors the root center at the origin across structural and size changes", async () => {
    const engine = new ElkMindMapLayout();
    let tree = sampleTree();
    const variants = [tree];
    tree = applyCommand(tree, {
      type: "add",
      id: "new-root-child",
      parentId: tree.rootId,
    });
    variants.push(tree);
    tree = applyCommand(tree, { type: "delete", id: "discover" });
    variants.push(tree);
    tree = applyCommand(tree, { type: "collapse", id: "organize" });
    variants.push(tree);
    tree = applyCommand(tree, {
      type: "move",
      id: "review",
      parentId: "tips",
      index: 0,
    });
    variants.push(tree);

    for (const [index, variant] of variants.entries()) {
      const rootSize = {
        width: 220 + index * 17,
        height: 70 + index * 11,
      };
      const sizes = Object.fromEntries(
        visible(variant).map((node) => [
          node.id,
          node.id === variant.rootId
            ? rootSize
            : { width: 105 + (index % 3) * 20, height: 49 },
        ]),
      );
      const positions = await engine.layout(variant, sizes);
      expect(positions[variant.rootId].x + rootSize.width / 2).toBeCloseTo(0);
      expect(positions[variant.rootId].y + rootSize.height / 2).toBeCloseTo(0);
    }
  });

  it("keeps dimensions, direction, order and non-overlap across folding and long text", async () => {
    const engine = new ElkMindMapLayout();
    for (const tree of [
      sampleTree(),
      applyCommand(sampleTree(), { type: "collapse", id: "discover" }),
    ]) {
      const ns = visible(tree),
        sizes = Object.fromEntries(
          ns.map((n, i) => [
            n.id,
            { width: i % 2 ? 260 : 130, height: i % 3 ? 46 : 110 },
          ]),
        );
      const positions = await engine.layout(tree, sizes);
      for (const n of ns)
        if (n.parentId)
          expect(positions[n.id].x).toBeGreaterThanOrEqual(
            positions[n.parentId].x + sizes[n.parentId].width,
          );
      for (const n of ns)
        if (!n.collapsed)
          for (let i = 1; i < n.children.length; i++)
            expect(positions[n.children[i]].y).toBeGreaterThan(
              positions[n.children[i - 1]].y,
            );
      for (let i = 0; i < ns.length; i++)
        for (let j = i + 1; j < ns.length; j++) {
          const a = positions[ns[i].id],
            b = positions[ns[j].id],
            as = sizes[ns[i].id],
            bs = sizes[ns[j].id];
          expect(
            a.x + as.width <= b.x ||
              b.x + bs.width <= a.x ||
              a.y + as.height <= b.y ||
              b.y + bs.height <= a.y,
          ).toBe(true);
        }
    }
  });
  it("rejects stale asynchronous layouts", () => {
    const g = new LayoutRequestGuard();
    const first = g.next();
    const second = g.next();
    expect(g.isCurrent(first)).toBe(false);
    expect(g.isCurrent(second)).toBe(true);
  });
});

it("preserves canonical order and variable-size separation in a wide 500-node tree", async () => {
  const tree: Tree = {
    rootId: "r",
    nodes: {
      r: {
        kind: "text",
        id: "r",
        text: "root",
        parentId: null,
        children: [],
        collapsed: false,
      },
    },
  };
  for (let i = 1; i < 500; i++) {
    const id = `node${i}`,
      parentId = i <= 10 ? "r" : `node${1 + (i % 10)}`;
    tree.nodes[id] = { kind: "text", id, text: id, parentId, children: [], collapsed: false };
    tree.nodes[parentId].children.unshift(id);
  }
  const sizes = Object.fromEntries(
    visible(tree).map((n, i) => [
      n.id,
      { width: 100 + (i % 7) * 25, height: 35 + (i % 5) * 20 },
    ]),
  );
  const positions = await new ElkMindMapLayout().layout(tree, sizes);
  for (const n of visible(tree))
    for (let i = 1; i < n.children.length; i++) {
      const before = n.children[i - 1],
        after = n.children[i];
      expect(positions[after].y).toBeGreaterThanOrEqual(
        positions[before].y + sizes[before].height,
      );
    }
});

it("ignores selection and editing events from nodes removed by a newer tree", () => {
  const s = createMindMapStore(sampleTree()).getState;
  s().hydrate(sampleTree());
  s().execute({ type: "delete", id: "discover" });
  s().select("observe");
  s().edit("observe");
  expect(s().selected).toBe("root");
  expect(s().editing).toBeNull();
});
it("accepts opaque imported IDs without colliding with layout internals", async () => {
  const tree: Tree = {
    rootId: "graph",
    nodes: {
      graph: {
        kind: "text",
        id: "graph",
        parentId: null,
        children: ["topic:graph"],
        text: "根",
        collapsed: false,
      },
      "topic:graph": {
        kind: "text",
        id: "topic:graph",
        parentId: "graph",
        children: [],
        text: "叶",
        collapsed: false,
      },
    },
  };
  const parsed = parseDocument({ version: 1, tree });
  const positions = await new ElkMindMapLayout().layout(parsed, {});
  expect(Object.keys(positions).sort()).toEqual(["graph", "topic:graph"]);
  expect(positions["topic:graph"].x).toBeGreaterThan(positions.graph.x);
});

it("aligns siblings including short and long leaves with branched siblings", async () => {
  let tree = sampleTree();
  tree = applyCommand(tree, {
    type: "add",
    id: "short-leaf",
    parentId: "root",
  });
  tree = applyCommand(tree, { type: "add", id: "long-leaf", parentId: "root" });
  for (const variant of [
    tree,
    applyCommand(tree, { type: "collapse", id: "discover" }),
  ]) {
    const ns = visible(variant);
    const sizes = Object.fromEntries(
      ns.map((n) => [
        n.id,
        {
          width: n.id === "long-leaf" ? 260 : 105,
          height: n.id === "long-leaf" ? 90 : 49,
        },
      ]),
    );
    const positions = await new ElkMindMapLayout().layout(variant, sizes);
    for (const parent of ns) {
      if (parent.collapsed) continue;
      expect(
        new Set(parent.children.map((id) => positions[id].x)).size,
      ).toBeLessThanOrEqual(1);
      for (const id of parent.children)
        expect(
          positions[id].x - positions[parent.id].x - sizes[parent.id].width,
        ).toBeGreaterThanOrEqual(76);
    }
  }
});
