type BaseMindNode = {
  id: string;
  parentId: string | null;
  children: string[];
  collapsed: boolean;
};

export type TextMindNode = BaseMindNode & { kind: "text"; text: string; image?: never };
export type ImageMindNode = BaseMindNode & {
  kind: "image";
  text?: never;
  image: { assetId: string; width: number; aspectRatio: number };
};
export type MindNode = TextMindNode | ImageMindNode;
export type Tree = { rootId: string; nodes: Record<string, MindNode> };
export type MindMapNode = MindNode;
export type MindMapTree = Tree;
export type ImageDescriptor = ImageMindNode["image"];
export type Command =
  | { type: "add"; parentId: string; index?: number; id: string }
  | { type: "addImage"; parentId: string; index?: number; id: string; assetId: string; width: number; aspectRatio: number }
  | { type: "delete"; id: string }
  | { type: "deleteMany"; ids: string[] }
  | { type: "text"; id: string; text: string }
  | { type: "resizeImage"; id: string; width: number }
  | { type: "collapse"; id: string }
  | { type: "move"; id: string; parentId: string; index: number }
  | { type: "import"; tree: Tree };
export type MindMapCommand = Command;
export type MindMapDocument = { version: 2; tree: MindMapTree };

const validImage = (image: unknown): image is ImageDescriptor => {
  if (!image || typeof image !== "object") return false;
  const value = image as Partial<ImageDescriptor>;
  return typeof value.assetId === "string" && value.assetId.trim().length > 0 &&
    typeof value.width === "number" && Number.isFinite(value.width) &&
    value.width >= 80 && value.width <= 1200 &&
    typeof value.aspectRatio === "number" &&
    Number.isFinite(value.aspectRatio) && value.aspectRatio > 0;
};

export function serializeDocument(tree: Tree): MindMapDocument {
  return { version: 2, tree: structuredClone(tree) };
}
export function visible(tree: Tree): MindNode[] {
  const result: MindNode[] = [], queue = [tree.rootId];
  while (queue.length) {
    const n = tree.nodes[queue.pop()!];
    result.push(n);
    if (!n.collapsed) queue.push(...n.children.toReversed());
  }
  return result;
}
export function descendants(tree: Tree, id: string): string[] {
  const result: string[] = [], queue = [...tree.nodes[id].children];
  while (queue.length) {
    const child = queue.pop()!;
    result.push(child);
    queue.push(...tree.nodes[child].children);
  }
  return result;
}
export function applyCommand(tree: Tree, command: Command): Tree {
  if (command.type === "import") return structuredClone(command.tree);
  const next = structuredClone(tree), nodes = next.nodes;
  if (command.type === "deleteMany") {
    const selected = new Set(command.ids.filter((id) => id !== tree.rootId && tree.nodes[id]));
    const roots = [...selected].filter((id) => {
      let parent = tree.nodes[id].parentId;
      while (parent) {
        if (selected.has(parent)) return false;
        parent = tree.nodes[parent].parentId;
      }
      return true;
    });
    if (!roots.length) return tree;
    for (const id of roots) {
      const parent = nodes[nodes[id].parentId!];
      parent.children = parent.children.filter((child) => child !== id);
      for (const removed of [id, ...descendants(tree, id)]) delete nodes[removed];
    }
  } else if (command.type === "add" || command.type === "addImage") {
    const parent = nodes[command.parentId];
    if (!parent || nodes[command.id]) return tree;
    if (command.type === "addImage" && !validImage({ assetId: command.assetId, width: command.width, aspectRatio: command.aspectRatio })) return tree;
    nodes[command.id] = command.type === "add"
      ? { kind: "text", id: command.id, parentId: parent.id, children: [], text: "新主题", collapsed: false }
      : { kind: "image", id: command.id, parentId: parent.id, children: [], image: { assetId: command.assetId, width: command.width, aspectRatio: command.aspectRatio }, collapsed: false };
    parent.children.splice(command.index ?? parent.children.length, 0, command.id);
    parent.collapsed = false;
  } else {
    const n = nodes[command.id];
    if (!n) return tree;
    if (command.type === "text") {
      if (n.kind !== "text") return tree;
      const text = command.text.trim() || "新主题";
      if (text === n.text) return tree;
      n.text = text;
    }
    if (command.type === "resizeImage") {
      if (n.kind !== "image" || !Number.isFinite(command.width) ||
        command.width < 80 || command.width > 1200 || command.width === n.image.width)
        return tree;
      n.image.width = command.width;
    }
    if (command.type === "collapse") {
      if (!n.children.length) return tree;
      n.collapsed = !n.collapsed;
    }
    if (command.type === "delete") {
      if (!n.parentId) return tree;
      nodes[n.parentId].children = nodes[n.parentId].children.filter((id) => id !== n.id);
      for (const id of [n.id, ...descendants(tree, n.id)]) delete nodes[id];
    }
    if (command.type === "move") {
      if (!n.parentId || !nodes[command.parentId] || command.parentId === n.id ||
        descendants(tree, n.id).includes(command.parentId)) return tree;
      const oldParent = nodes[n.parentId], oldIndex = oldParent.children.indexOf(n.id);
      let index = command.index;
      if (oldParent.id === command.parentId && oldIndex < index) index--;
      oldParent.children.splice(oldIndex, 1);
      const parent = nodes[command.parentId];
      parent.children.splice(Math.max(0, Math.min(index, parent.children.length)), 0, n.id);
      n.parentId = parent.id;
      parent.collapsed = false;
      if (JSON.stringify(next) === JSON.stringify(tree)) return tree;
    }
  }
  return next;
}

export function parseDocument(value: unknown): Tree {
  const fail = (): never => { throw new Error("文件格式无效：需要完整、无循环的单根导图（version 1 或 2）。"); };
  if (!value || typeof value !== "object") return fail();
  const doc = value as { version?: unknown; tree?: unknown };
  if (doc.version !== 1 && doc.version !== 2) return fail();
  if (!doc.tree || typeof doc.tree !== "object") return fail();
  const input = doc.tree as { rootId?: unknown; nodes?: unknown };
  if (typeof input.rootId !== "string" || !input.nodes || typeof input.nodes !== "object" || Array.isArray(input.nodes)) return fail();
  const rootId = input.rootId;
  const source = input.nodes as Record<string, Record<string, unknown>>;
  if (!Object.hasOwn(source, rootId)) return fail();
  const nodes: Record<string, MindNode> = Object.create(null);
  for (const [id, n] of Object.entries(source)) {
    if (!n || n.id !== id || typeof n.collapsed !== "boolean" || !Array.isArray(n.children) ||
      n.children.some((child) => typeof child !== "string") || new Set(n.children).size !== n.children.length) return fail();
    const parentId = n.parentId;
    if (id === rootId ? parentId !== null : typeof parentId !== "string" || !Object.hasOwn(source, parentId)) return fail();
    const base = { id, parentId: parentId as string | null, children: [...n.children] as string[], collapsed: n.collapsed };
    if (doc.version === 1) {
      if (typeof n.text !== "string") return fail();
      nodes[id] = { ...base, kind: "text", text: n.text };
    } else if (n.kind === "text") {
      if (typeof n.text !== "string" || Object.hasOwn(n, "image")) return fail();
      nodes[id] = { ...base, kind: "text", text: n.text };
    } else if (n.kind === "image") {
      if (Object.hasOwn(n, "text") || !validImage(n.image)) return fail();
      const image = n.image as ImageDescriptor;
      nodes[id] = {
        ...base,
        kind: "image",
        image: { assetId: image.assetId, width: image.width, aspectRatio: image.aspectRatio },
      };
    } else return fail();
  }
  for (const [id, n] of Object.entries(nodes))
    for (const child of n.children)
      if (!Object.hasOwn(nodes, child) || nodes[child].parentId !== id) return fail();
  const seen = new Set<string>(), queue = [rootId];
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) return fail();
    seen.add(id);
    queue.push(...nodes[id].children);
  }
  if (seen.size !== Object.keys(nodes).length) return fail();
  return { rootId, nodes };
}

export function sampleTree(): Tree {
  const tree: Tree = { rootId: "root", nodes: {} };
  const add = (id: string, text: string, parentId: string | null) => {
    tree.nodes[id] = { kind: "text", id, text, parentId, children: [], collapsed: false };
    if (parentId) tree.nodes[parentId].children.push(id);
  };
  add("root", "让好想法，生长", null);
  add("discover", "发现灵感", "root");
  add("observe", "保持好奇，观察日常", "discover");
  add("collect", "收集那些闪光的念头", "discover");
  add("organize", "梳理思路", "root");
  add("connect", "建立想法之间的联系", "organize");
  add("focus", "找到真正重要的事情", "organize");
  add("act", "付诸行动", "root");
  add("step", "拆解成一个小步骤", "act");
  add("review", "尝试、复盘、再出发", "act");
  add("tips", "从这里开始", "root");
  add("tip1", "双击主题，写下你的想法", "tips");
  add("tip2", "按 Tab 延伸一个新分支", "tips");
  return tree;
}
