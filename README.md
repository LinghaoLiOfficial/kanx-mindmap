# kanx-mindmap

可组合的 React 单向树思维导图编辑器，基于 React Flow、ELK 和 Zustand。支持 React 18/19，可用于 Vite、Next.js 等客户端 React 项目。

本仓库同时发布为 npm 包；推送符合语义化版本的 Git tag（例如 `v0.1.0`）后，GitHub Actions 会自动完成检查、构建和 npm 发布。

## 安装

```bash
pnpm add @linghaoliofficial/kanx-mindmap
```

```tsx
import { MindMapEditor } from "@linghaoliofficial/kanx-mindmap";
import "@linghaoliofficial/kanx-mindmap/styles.css";

export default function App() {
  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <MindMapEditor />
    </div>
  );
}
```

组件填充宿主容器，因此父元素必须具有明确宽高。Next.js App Router 中请从 Client Component 使用编辑器；样式可在根 layout 中导入。

## 数据模式

默认是内存中的非受控组件，不访问 localStorage：

```tsx
<MindMapEditor
  defaultValue={initialTree}
  onChange={(tree, detail) => {
    console.log(detail.source, detail.command, tree);
  }}
/>
```

受控模式要求同时提供 `value` 和 `onChange`：

```tsx
const [tree, setTree] = useState(initialTree);

<MindMapEditor value={tree} onChange={setTree} />;
```

只有显式配置后才会从 localStorage 加载并防抖保存：

```tsx
<MindMapEditor
  defaultValue={initialTree}
  persistence={{
    documentKey: "project-a.mindmap",
    paletteKey: "project-a.palette",
    debounceMs: 300,
  }}
/>
```

## 组合与二次开发

使用 `MindMapProvider`、`MindMapCanvas` 和 `useMindMap` 可以替换完整编辑器的外围 UI。每个 Provider 都有独立的状态、历史和 React Flow 实例，同页多实例不会共享选择或快捷键。

```tsx
import {
  MindMapCanvas,
  MindMapProvider,
  useMindMap,
} from "@linghaoliofficial/kanx-mindmap";

function Toolbar() {
  const map = useMindMap();
  return (
    <nav>
      <button onClick={() => map.addChild()}>Add child</button>
      <button disabled={!map.canUndo} onClick={map.undo}>Undo</button>
      <button onClick={map.fitView}>Fit</button>
    </nav>
  );
}

export function CustomEditor() {
  return (
    <MindMapProvider>
      <Toolbar />
      <div style={{ height: 600 }}>
        <MindMapCanvas locale="en" />
      </div>
    </MindMapProvider>
  );
}
```

`MindMapEditor` 支持 `title`、`showHeader`、`showFooter`、`showPalette`、`className`、`style`、自定义 `palettes`、受控或非受控 palette，以及 `locale="zh-CN" | "en"`。通过 `messages` 可局部覆盖任意内置文案。

包还导出 `MindMapTree`、`MindMapNode`、`MindMapCommand`、`MindMapPalette`、`parseDocument`、`serializeDocument`、`importMindMapJson`、`exportMindMapJson`、`applyCommand`、`visible`、`descendants` 和布局引擎接口。旧名称 `Tree`、`MindNode`、`Command` 与 `MapPalette` 保留为类型别名。顶部工具栏不包含 JSON 导入/导出按钮；宿主可以直接调用 `importMindMapJson`、`exportMindMapJson`，或结合 `useMindMap().execute({ type: "import", tree })` 自行提供入口。

## JSON 文档

```json
{
  "version": 2,
  "tree": {
    "rootId": "root",
    "nodes": {
      "root": {
        "id": "root",
        "parentId": null,
        "children": [],
        "kind": "text",
        "text": "中心主题",
        "collapsed": false
      }
    }
  }
}
```

文本节点使用 `kind: "text"`，图片节点使用 `kind: "image"`，例如：

```json
{
  "id": "picture",
  "parentId": "root",
  "children": [],
  "kind": "image",
  "image": { "assetId": "uuid", "width": 200, "aspectRatio": 1.5 },
  "collapsed": false
}
```

`parseDocument` 同时接受 v1 文本文档并迁移为 v2；它会校验版本、唯一根、父子引用、重复引用、循环和节点可达性，并移除未知字段。JSON 只保存图片资源引用和显示元数据，不包含图片二进制。粘贴图片需要资源库仍可访问对应 `assetId`；跨浏览器导入时若资源不存在，会显示无文案占位。

选中主题后按 `Ctrl/Cmd + V` 可将剪贴板中的第一张图片创建为新的子主题。图片主题可以继续添加子主题、移动、折叠、删除和撤销；单选图片时可拖动右下角手柄按比例调整宽度（80–1200px）。默认图片资源使用所有编辑器实例共享的 IndexedDB，也可以注入资源适配器：

```tsx
<MindMapEditor assetStore={{
  async save(blob) { return await upload(blob); },
  async load(assetId) { return await download(assetId); },
}} />
```

## 本仓库开发

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm pack
```

## 发布到公共 npm

发布前请在 npm 中为仓库配置 Trusted Publishing（GitHub Actions，workflow 文件为 `.github/workflows/publish.yml`）。包 `@linghaoliofficial/kanx-mindmap` 发布到 `https://registry.npmjs.org`；旧 GitHub Packages 版本会保留，但不再接收新版本。之后更新 `package.json` 版本并推送 tag：

```bash
pnpm version patch
git push origin main --follow-tags
```

工作流会在 tag 推送后运行类型检查、Lint、单元测试和库构建，全部通过后自动执行 `npm publish`。预发布版本（例如 `0.1.0-rc.1`）会发布到 `next` 标签，正式版本会发布到 `latest` 标签。

示例应用运行在 [http://localhost:3001](http://localhost:3001)，并显式使用 `kanx-mindmap.*` localStorage key 保持刷新恢复行为。

## 当前边界

单根、向右展开、单张本地导图。没有账号后端、协作、双向布局、自由坐标、富文本、图片/PDF 导出或 XMind 文件兼容。布局在主线程执行，当前规模验证覆盖 500 节点。
