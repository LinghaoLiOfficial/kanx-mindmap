import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand, sampleTree } from "../lib/mindmap/model";
import { createMindMapStore, type MindMapStore } from "../lib/mindmap/store";

let store: MindMapStore;
let state: MindMapStore["getState"];
beforeEach(() => {
  store = createMindMapStore(sampleTree());
  state = store.getState;
});

describe("multiple topic selection", () => {
  it("toggles topics, transfers current topic and clears the last selection", () => {
    state().select("observe");
    state().select("collect", "toggle");
    expect(state().selectedIds).toEqual(["observe", "collect"]);
    expect(state().selected).toBe("collect");
    state().select("collect", "toggle");
    expect(state().selected).toBe("observe");
    expect(state().selectionAnchor).toBe("observe");
    state().select("observe", "toggle");
    expect(state().selectedIds).toEqual([]);
    expect(state().selected).toBeNull();
    expect(state().selectionAnchor).toBeNull();
  });
  it("extends and shrinks ranges in either direction without selecting children", () => {
    state().select("organize");
    state().select("tips", "range");
    expect(state().selectedIds).toEqual(["organize", "act", "tips"]);
    state().select("act", "range");
    expect(state().selectedIds).toEqual(["organize", "act"]);
    state().select("discover", "range");
    expect(state().selectedIds).toEqual(["discover", "organize"]);
    expect(state().selectionAnchor).toBe("organize");
  });
  it("preserves the current topic when toggling off another range member", () => {
    state().select("tips");
    state().select("discover", "range");
    state().select("act", "toggle");
    expect(state().selected).toBe("discover");
    expect(state().selectionAnchor).toBe("discover");
  });
  it("resets cross-parent ranges and uses a single topic without an anchor", () => {
    state().select("observe");
    state().select("act", "range");
    expect(state().selectedIds).toEqual(["act"]);
    expect(state().selectionAnchor).toBe("act");
    state().select(null);
    state().select("collect", "range");
    expect(state().selectedIds).toEqual(["collect"]);
  });
  it("cleans hidden selection and anchors, including after undo and redo", () => {
    state().select("observe");
    state().select("collect", "toggle");
    state().execute({ type: "collapse", id: "discover" });
    expect(state().selectedIds).toEqual(["root"]);
    expect(state().selectionAnchor).toBe("root");
    state().undo();
    state().select("observe");
    state().redo();
    expect(state().selectedIds).toEqual(["root"]);
    state().select("collect", "range");
    expect(state().selectedIds).toEqual(["root"]);
  });
  it("editing, adding and importing restore single selection", () => {
    state().select("observe");
    state().select("collect", "toggle");
    state().edit("collect");
    expect(state().selectedIds).toEqual(["collect"]);
    state().select("observe", "toggle");
    state().execute({ type: "add", id: "new", parentId: "observe" });
    expect(state().selectedIds).toEqual(["new"]);
    state().execute({ type: "import", tree: sampleTree() });
    expect(state().selectedIds).toEqual(["root"]);
  });
});

describe("batch deletion", () => {
  it("protects root, ignores invalid and duplicate IDs, and deduplicates subtrees", () => {
    const tree = sampleTree();
    expect(
      applyCommand(tree, { type: "deleteMany", ids: ["root", "missing"] }),
    ).toBe(tree);
    const next = applyCommand(tree, {
      type: "deleteMany",
      ids: ["root", "discover", "observe", "discover", "missing", "step"],
    });
    expect(next.nodes.root).toBeDefined();
    for (const id of ["discover", "observe", "collect", "step"])
      expect(next.nodes[id]).toBeUndefined();
    expect(next.nodes.root.children).not.toContain("discover");
    expect(next.nodes.act.children).toEqual(["review"]);
    expect(tree.nodes.observe).toBeDefined();
  });
  it("deletes across branches in one undoable operation", () => {
    const initial = state().tree;
    state().select("observe");
    state().select("step", "toggle");
    state().deleteSelected();
    expect(state().tree.nodes.observe).toBeUndefined();
    expect(state().tree.nodes.step).toBeUndefined();
    expect(state().selectedIds).toEqual(["review"]);
    expect(state().history).toHaveLength(1);
    state().undo();
    expect(state().tree).toEqual(initial);
    state().redo();
    expect(state().tree.nodes.observe).toBeUndefined();
    expect(state().tree.nodes.step).toBeUndefined();
  });
  it("finds surviving previous or next siblings and then ancestors", () => {
    state().select("organize");
    state().select("act", "toggle");
    state().deleteSelected();
    expect(state().selected).toBe("discover");
    state().hydrate(sampleTree());
    state().select("discover");
    state().select("organize", "toggle");
    state().deleteSelected();
    expect(state().selected).toBe("act");
    state().select("act");
    state().select("step", "toggle");
    state().deleteSelected();
    expect(state().selected).toBe("root");
  });
  it("retains a protected current root and skips history for empty deletion", () => {
    state().select("discover");
    state().select("root", "toggle");
    state().deleteSelected();
    expect(state().selectedIds).toEqual(["root"]);
    state().deleteSelected();
    expect(state().history).toHaveLength(1);
  });
});
