import { createStore, type StoreApi } from "zustand/vanilla";
import {
  applyCommand,
  type Command,
  type ImageDescriptor,
  type MindNode,
  type Tree,
  sampleTree,
  visible,
} from "./model";

type Patch = { rootId: string; nodes: Record<string, MindNode | null> };
type Entry = { command: Command; forward: Patch; backward: Patch };

export type EditingState = { id: string; initialText?: string };
export type SelectionMode = "single" | "toggle" | "range";
export type MindMapChangeSource = "user" | "undo" | "redo" | "import";
export type MindMapChangeDetail = { command: Command; source: MindMapChangeSource };
export type MindMapChangeHandler = (tree: Tree, detail: MindMapChangeDetail) => void;

export type MindMapState = {
  tree: Tree;
  selected: string | null;
  selectedIds: string[];
  selectionAnchor: string | null;
  editing: EditingState | null;
  history: Entry[];
  future: Entry[];
  select: (id: string | null, mode?: SelectionMode) => void;
  deleteSelected: () => void;
  edit: (id: string | null, initialText?: string) => void;
  execute: (command: Command) => void;
  addChild: (parentId?: string) => string | null;
  addImageChild: (parentId: string, image: ImageDescriptor) => string | null;
  addSibling: (id?: string) => string | null;
  undo: () => void;
  redo: () => void;
  hydrate: (tree: Tree) => void;
};

export type MindMapStore = StoreApi<MindMapState>;
export type ConfigurableMindMapStore = MindMapStore & {
  setChangeHandler: (handler?: MindMapChangeHandler) => void;
};

function diff(from: Tree, to: Tree): Patch {
  const nodes: Patch["nodes"] = Object.create(null);
  for (const id of new Set([...Object.keys(from.nodes), ...Object.keys(to.nodes)]))
    if (JSON.stringify(from.nodes[id]) !== JSON.stringify(to.nodes[id]))
      nodes[id] = to.nodes[id] ?? null;
  return { rootId: to.rootId, nodes };
}

function patch(tree: Tree, value: Patch): Tree {
  const nodes = { ...tree.nodes };
  for (const [id, node] of Object.entries(value.nodes)) {
    if (node) nodes[id] = node;
    else delete nodes[id];
  }
  return { rootId: value.rootId, nodes };
}

function singleSelection(selected: string | null) {
  return {
    selected,
    selectedIds: selected ? [selected] : [],
    selectionAnchor: selected,
  };
}

function reconcileSelection(tree: Tree, state: MindMapState) {
  const ids = new Set(visible(tree).map((node) => node.id));
  const selectedIds = state.selectedIds.filter((id) => ids.has(id));
  const selected = state.selected && ids.has(state.selected)
    ? state.selected
    : (selectedIds.at(-1) ?? (state.selected ? tree.rootId : null));
  if (selected && !selectedIds.includes(selected)) selectedIds.push(selected);
  return {
    selected,
    selectedIds,
    selectionAnchor:
      state.selectionAnchor && selectedIds.includes(state.selectionAnchor)
        ? state.selectionAnchor
        : selected,
  };
}

function selectionAfterDelete(before: Tree, after: Tree, id: string | null): string {
  if (id && after.nodes[id]) return id;
  const node = id ? before.nodes[id] : undefined;
  if (!node?.parentId) return after.rootId;
  const siblings = before.nodes[node.parentId].children;
  const index = siblings.indexOf(node.id);
  const sibling = [
    ...siblings.slice(0, index).reverse(),
    ...siblings.slice(index + 1),
  ].find((candidate) => after.nodes[candidate]);
  if (sibling) return sibling;
  let parent: string | null = node.parentId;
  while (parent && !after.nodes[parent]) parent = before.nodes[parent].parentId;
  return parent ?? after.rootId;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ??
    `topic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createMindMapStore(
  initialTree: Tree = sampleTree(),
  onChange?: MindMapChangeHandler,
): ConfigurableMindMapStore {
  let notify = onChange;
  const store = createStore<MindMapState>((set, get) => ({
    tree: initialTree,
    ...singleSelection(initialTree.rootId),
    editing: null,
    history: [],
    future: [],
    select: (id, mode = "single") =>
      set((state) => {
        if (id === null) return singleSelection(null);
        if (!visible(state.tree).some((node) => node.id === id)) return state;
        if (mode === "range" && state.selectionAnchor) {
          const anchor = state.tree.nodes[state.selectionAnchor];
          const target = state.tree.nodes[id];
          if (anchor?.parentId && anchor.parentId === target.parentId) {
            const siblings = state.tree.nodes[anchor.parentId].children;
            const start = siblings.indexOf(anchor.id);
            const end = siblings.indexOf(id);
            return {
              selected: id,
              selectedIds: siblings.slice(Math.min(start, end), Math.max(start, end) + 1),
            };
          }
        }
        if (mode === "toggle") {
          const selectedIds = state.selectedIds.includes(id)
            ? state.selectedIds.filter((selected) => selected !== id)
            : [...state.selectedIds, id];
          const selected = selectedIds.includes(id)
            ? id
            : state.selected && selectedIds.includes(state.selected)
              ? state.selected
              : (selectedIds.at(-1) ?? null);
          return { selected, selectedIds, selectionAnchor: selected };
        }
        return singleSelection(id);
      }),
    deleteSelected: () => get().execute({ type: "deleteMany", ids: get().selectedIds }),
    edit: (id, initialText) =>
      set((state) =>
        id === null || visible(state.tree).some((node) => node.id === id && node.kind === "text")
          ? {
              ...(id === null ? {} : singleSelection(id)),
              editing: id === null ? null : { id, initialText },
            }
          : state,
      ),
    hydrate: (tree) =>
      set({
        tree,
        ...singleSelection(tree.rootId),
        editing: null,
        history: [],
        future: [],
      }),
    execute: (command) => {
      let changed: Tree | null = null;
      set((state) => {
        const tree = applyCommand(state.tree, command);
        if (tree === state.tree) return state;
        changed = tree;
        const selection = command.type === "add" || command.type === "addImage"
          ? singleSelection(command.id)
          : command.type === "import"
            ? singleSelection(tree.rootId)
            : command.type === "delete" || command.type === "deleteMany"
              ? singleSelection(selectionAfterDelete(state.tree, tree, state.selected))
              : reconcileSelection(tree, state);
        return {
          tree,
          ...selection,
          editing: null,
          history: [
            ...state.history.slice(-99),
            { command, forward: diff(state.tree, tree), backward: diff(tree, state.tree) },
          ],
          future: [],
        };
      });
      if (changed)
        notify?.(changed, {
          command,
          source: command.type === "import" ? "import" : "user",
        });
    },
    addChild: (parentId) => {
      const state = get();
      const parent = parentId ?? state.selected;
      if (!parent || !state.tree.nodes[parent]) return null;
      const id = createId();
      state.execute({ type: "add", parentId: parent, id });
      return id;
    },
    addImageChild: (parentId, image) => {
      const state = get();
      if (!state.tree.nodes[parentId]) return null;
      const id = createId();
      state.execute({ type: "addImage", parentId, id, ...image });
      return get().tree.nodes[id] ? id : null;
    },
    addSibling: (id) => {
      const state = get();
      const node = state.tree.nodes[id ?? state.selected ?? ""];
      if (!node) return null;
      const parent = node.parentId ? state.tree.nodes[node.parentId] : node;
      const nextId = createId();
      state.execute({
        type: "add",
        parentId: parent.id,
        id: nextId,
        index: node.parentId ? parent.children.indexOf(node.id) + 1 : undefined,
      });
      return nextId;
    },
    undo: () => {
      const change: { value: { tree: Tree; command: Command } | null } = { value: null };
      set((state) => {
        const entry = state.history.at(-1);
        if (!entry) return state;
        const tree = patch(state.tree, entry.backward);
        change.value = { tree, command: entry.command };
        return {
          tree,
          ...reconcileSelection(tree, state),
          editing: null,
          history: state.history.slice(0, -1),
          future: [...state.future, entry],
        };
      });
      if (change.value)
        notify?.(change.value.tree, { command: change.value.command, source: "undo" });
    },
    redo: () => {
      const change: { value: { tree: Tree; command: Command } | null } = { value: null };
      set((state) => {
        const entry = state.future.at(-1);
        if (!entry) return state;
        const tree = patch(state.tree, entry.forward);
        change.value = { tree, command: entry.command };
        return {
          tree,
          ...reconcileSelection(tree, state),
          editing: null,
          history: [...state.history, entry],
          future: state.future.slice(0, -1),
        };
      });
      if (change.value)
        notify?.(change.value.tree, { command: change.value.command, source: "redo" });
    },
  })) as ConfigurableMindMapStore;

  store.setChangeHandler = (handler) => {
    notify = handler;
  };
  return store;
}
