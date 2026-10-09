"use client";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  applyNodeChanges,
  Background,
  ReactFlow,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import {
  Plus,
  GitBranch,
  Trash2,
  Undo2,
  Redo2,
  FoldVertical,
  UnfoldVertical,
  Minus,
  Maximize,
  RotateCcw,
  Scan,
  PanelTop,
  CircleHelp,
  Palette,
  Check,
  X,
} from "lucide-react";
import {
  MindMapProvider,
  useMindMap,
  useMindMapEnvironment,
  useMindMapStoreApi,
  type MindMapProviderProps,
} from "./provider";
import {
  descendants,
  parseDocument,
  serializeDocument,
  visible,
  type Tree,
} from "../../lib/mindmap/model";
import {
  layoutEngine,
  LayoutRequestGuard,
  type Size,
} from "../../lib/mindmap/layout";
import {
  palettes as defaultPalettes,
  type MapPalette,
} from "../../lib/mindmap/palettes";
import { nodeTypes, edgeTypes, type TopicNode } from "./renderers";
import {
  resolveMessages,
  type MindMapLocale,
  type MindMapMessages,
} from "./messages";

function branchColor(
  tree: Tree,
  id: string,
  colors = defaultPalettes[0].branches,
) {
  let n = tree.nodes[id];
  while (n.parentId && n.parentId !== tree.rootId) n = tree.nodes[n.parentId];
  return colors[
    Math.max(0, tree.nodes[tree.rootId].children.indexOf(n.id)) % colors.length
  ];
}
type Drop = {
  target: string;
  parentId: string;
  index: number;
  zone: "before" | "after" | "child";
};

async function imageAspectRatio(blob: Blob): Promise<number> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    try {
      if (!bitmap.width || !bitmap.height) throw new Error("Invalid image dimensions");
      return bitmap.width / bitmap.height;
    } finally {
      bitmap.close();
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Invalid image dimensions");
    return image.naturalWidth / image.naturalHeight;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type MindMapCanvasProps = {
  title?: ReactNode;
  showHeader?: boolean;
  showFooter?: boolean;
  showPalette?: boolean;
  locale?: MindMapLocale;
  messages?: Partial<MindMapMessages>;
  palettes?: MapPalette[];
  paletteId?: string;
  defaultPaletteId?: string;
  onPaletteChange?: (paletteId: string) => void;
  className?: string;
  style?: CSSProperties;
};

/** Parse a JSON mind map document for use with an editor instance. */
export function importMindMapJson(json: string): Tree {
  return parseDocument(JSON.parse(json));
}

/** Serialize a mind map tree as a formatted JSON document. */
export function exportMindMapJson(tree: Tree): string {
  return JSON.stringify(serializeDocument(tree), null, 2);
}

export function MindMapCanvas({
  title,
  showHeader = false,
  showFooter = false,
  showPalette = false,
  locale = "zh-CN",
  messages: messageOverrides,
  palettes = defaultPalettes,
  paletteId: controlledPaletteId,
  defaultPaletteId,
  onPaletteChange,
  className,
  style,
}: MindMapCanvasProps) {
  const store = useMindMapStoreApi();
  const environment = useMindMapEnvironment();
  const messages = resolveMessages(locale, messageOverrides);
  const root = useRef<HTMLElement>(null);
  const palettePanelId = useId();
  const tree = useMindMap((s) => s.tree),
    selected = useMindMap((s) => s.selected),
    selectedIds = useMindMap((s) => s.selectedIds),
    editing = useMindMap((s) => s.editing);
  const canUndo = useMindMap((s) => s.history.length > 0),
    canRedo = useMindMap((s) => s.future.length > 0);
  const [nodes, setNodes] = useState<TopicNode[]>([]),
    [ready, setReady] = useState(false);
  const [error, setError] = useState(""),
    [help, setHelp] = useState(false),
    [layoutTick, setLayoutTick] = useState(0);
  const [internalPaletteId, setInternalPaletteId] = useState(
    defaultPaletteId ?? palettes[0]?.id,
  );
  const paletteId = controlledPaletteId ?? internalPaletteId;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteButton = useRef<HTMLButtonElement>(null);
  const palette =
    palettes.find((item) => item.id === paletteId) ??
    palettes[0] ??
    defaultPalettes[0];
  const closePalette = () => {
    setPaletteOpen(false);
    paletteButton.current?.focus();
  };
  const choosePalette = (id: string) => {
    if (controlledPaletteId === undefined) setInternalPaletteId(id);
    onPaletteChange?.(id);
    if (environment.persistence?.paletteKey)
      try {
        localStorage.setItem(environment.persistence.paletteKey, id);
      } catch {
        setError(messages.paletteStorageError);
      }
  };
  const [pointerHeld, setPointerHeld] = useState(false);
  const pointerStartedOnTopic = useRef(false);
  useEffect(() => {
    const release = () => setPointerHeld(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, []);
  const [dragging, setDragging] = useState(false),
    [drop, setDrop] = useState<Drop | null>(null);
  const dropRef = useRef<Drop | null>(null),
    measuring = useRef<HTMLDivElement>(null),
    guard = useRef(new LayoutRequestGuard()),
    firstLayout = useRef(true),
    pendingReveal = useRef<string | null>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const { fitView, getViewport, zoomIn, zoomOut, setViewport } = useReactFlow();
  const viewport = useViewport();
  useEffect(() => {
    environment.registerViewport({
      fitView: async () => {
        await fitView({ padding: 0.2, duration: 200, maxZoom: 1 });
      },
      zoomIn: async () => {
        await zoomIn({ duration: 180 });
      },
      zoomOut: async () => {
        await zoomOut({ duration: 180 });
      },
      resetZoom: async () => {
        await setViewport({ ...getViewport(), zoom: 1 }, { duration: 180 });
      },
      requestLayout: () => setLayoutTick((tick) => tick + 1),
    });
    return () => environment.registerViewport(null);
  }, [environment, fitView, getViewport, setViewport, zoomIn, zoomOut]);
  const list = visible(tree),
    current = selected ? tree.nodes[selected] : undefined;
  // Remove deleted/hidden topics immediately, without waiting for ELK to relayout.
  const visibleIds = new Set(list.map((node) => node.id));
  const visibleNodes = nodes.filter((node) => visibleIds.has(node.id));
  const revealPendingTopic = useCallback(
    (id: string, layoutVersion: number) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (
            pendingReveal.current !== id ||
            !guard.current.isCurrent(layoutVersion)
          )
            return;
          pendingReveal.current = null;
          const topic = Array.from(
              root.current?.querySelectorAll<HTMLElement>("[data-topic-id]") ?? [],
            ).find((element) => element.dataset.topicId === id),
            canvas = root.current?.querySelector<HTMLElement>(".canvas-area");
          if (!topic || !canvas) return;
          const topicRect = topic.getBoundingClientRect(),
            canvasRect = canvas.getBoundingClientRect(),
            margin = 32,
            safeWidth = canvasRect.width - margin * 2,
            safeHeight = canvasRect.height - margin * 2;
          let dx = 0,
            dy = 0;
          if (topicRect.width > safeWidth)
            dx =
              canvasRect.left +
              canvasRect.width / 2 -
              (topicRect.left + topicRect.width / 2);
          else if (topicRect.left < canvasRect.left + margin)
            dx = canvasRect.left + margin - topicRect.left;
          else if (topicRect.right > canvasRect.right - margin)
            dx = canvasRect.right - margin - topicRect.right;
          if (topicRect.height > safeHeight)
            dy =
              canvasRect.top +
              canvasRect.height / 2 -
              (topicRect.top + topicRect.height / 2);
          else if (topicRect.top < canvasRect.top + margin)
            dy = canvasRect.top + margin - topicRect.top;
          else if (topicRect.bottom > canvasRect.bottom - margin)
            dy = canvasRect.bottom - margin - topicRect.bottom;
          if (!dx && !dy) return;
          const currentViewport = getViewport();
          void setViewport(
            {
              x: currentViewport.x + dx,
              y: currentViewport.y + dy,
              zoom: currentViewport.zoom,
            },
            { duration: 180 },
          );
        }),
      );
    },
    [getViewport, setViewport],
  );
  useEffect(() => {
    const paletteKey = environment.persistence?.paletteKey;
    if (!paletteKey || controlledPaletteId !== undefined) return;
    const timer = setTimeout(() => {
      try {
        const savedPalette = localStorage.getItem(paletteKey);
        if (palettes.some((item) => item.id === savedPalette))
          setInternalPaletteId(savedPalette!);
      } catch {
        setError(messages.paletteStorageError);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [controlledPaletteId, environment.persistence?.paletteKey, messages.paletteStorageError, palettes]);
  useEffect(() => {
    if (!environment.hydrated) return;
    const requestGuard = guard.current;
    const version = requestGuard.next(),
      sizes: Record<string, Size> = Object.create(null);
    measuring.current
      ?.querySelectorAll<HTMLElement>("[data-measure-id]")
      .forEach((el) => {
        const rect = el.getBoundingClientRect();
        sizes[el.dataset.measureId!] = {
          width: rect.width,
          height: rect.height,
        };
      });
    layoutEngine
      .layout(tree, sizes)
      .then((positions) => {
        if (!requestGuard.isCurrent(version)) return;
        setNodes(
          visible(tree).map((n) => ({
            id: n.id,
            type: "topic",
            position: positions[n.id],
            draggable: n.id !== tree.rootId,
            data: {
              topic: n,
              root: n.id === tree.rootId,
              color: branchColor(tree, n.id),
              labels: {
                topicText: messages.topicText,
                imageTopic: messages.imageTopic,
                expand: messages.expand,
                collapse: messages.collapse,
              },
            },
            style: sizes[n.id],
          })),
        );
        setReady(true);
        if (firstLayout.current) {
          firstLayout.current = false;
          requestAnimationFrame(() =>
            requestAnimationFrame(
              () => void fitView({ padding: 0.2, maxZoom: 1 }),
            ),
          );
        } else if (pendingReveal.current)
          revealPendingTopic(pendingReveal.current, version);
      })
      .catch(() => {
        if (requestGuard.isCurrent(version))
          setError(messages.layoutError);
      });
    return () => {
      requestGuard.next();
    };
  }, [
    tree,
    environment.hydrated,
    layoutTick,
    fitView,
    messages.collapse,
    messages.expand,
    messages.layoutError,
    messages.imageTopic,
    messages.topicText,
    revealPendingTopic,
  ]);
  const add = useCallback((sibling = false) => {
    const s = store.getState(),
      n = s.selected ? s.tree.nodes[s.selected] : undefined;
    if (!n) return;
    const id = sibling ? s.addSibling(n.id) : s.addChild(n.id);
    if (id) pendingReveal.current = id;
  }, [store]);
  useEffect(() => {
    const element = root.current;
    const onPaste = (event: ClipboardEvent) => {
      const state = store.getState();
      if (!state.selected || state.editing || dragging) return;
      const item = Array.from(event.clipboardData?.items ?? []).find(
        (candidate) =>
          candidate.kind === "file" && candidate.type.startsWith("image/"),
      );
      const blob = item?.getAsFile();
      if (!blob) return;
      event.preventDefault();
      const parentId = state.selected;
      void (async () => {
        try {
          const aspectRatio = await imageAspectRatio(blob);
          const assetId = await environment.assetStore.save(blob);
          const id = store.getState().addImageChild(parentId, {
            assetId,
            width: 200,
            aspectRatio,
          });
          if (id) pendingReveal.current = id;
        } catch {
          // Clipboard and storage failures are intentionally non-disruptive.
        }
      })();
    };
    element?.addEventListener("paste", onPaste, true);
    return () => element?.removeEventListener("paste", onPaste, true);
  }, [dragging, environment.assetStore, store]);
  const remove = () => store.getState().deleteSelected();
  const startEdit = useCallback(() => {
    const s = store.getState();
    s.edit(s.selected);
  }, [store]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = store.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!e.isComposing && document.activeElement instanceof HTMLTextAreaElement)
          document.activeElement.blur();
        return;
      }
      if (
        e.isComposing ||
        s.editing ||
        (e.target instanceof HTMLElement &&
          e.target.closest(
            'input,select,[contenteditable], [role="dialog"], .palette-panel',
          )) ||
        (e.target instanceof HTMLTextAreaElement && !e.target.closest(".topic"))
      )
        return;
      if (dragging) {
        if (e.key === "Escape") {
          dropRef.current = null;
          setDrop(null);
        }
        return;
      }
      const n = s.selected ? s.tree.nodes[s.selected] : undefined;
      const undoKey = e.key.toLowerCase() === "z" || e.code === "KeyZ";
      const redoKey = e.key.toLowerCase() === "y" || e.code === "KeyY";
      if (mod && (undoKey || redoKey)) {
        e.preventDefault();
        if (e.shiftKey || redoKey) s.redo();
        else s.undo();
        return;
      }
      if (mod || e.altKey || !n) return;
      // The selected topic keeps its textarea focused even before editing starts.
      // Let that control receive printable keys so the browser can start an IME
      // composition before we create a draft. The non-text canvas shortcuts below
      // still apply (F2, Tab, Enter, navigation, and deletion).
      const topicInput =
        e.target instanceof HTMLTextAreaElement && e.target.closest(".topic");
      if (
        e.key.length === 1 &&
        !topicInput &&
        !(e.target instanceof HTMLElement && e.target.closest("button,a"))
      ) {
        e.preventDefault();
        s.edit(n.id, e.key);
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("button,a") &&
        ["Tab", "Enter", " "].includes(e.key)
      )
        return;
      if (
        [
          "Tab",
          "Enter",
          "Delete",
          "Backspace",
          "F2",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
        ].includes(e.key)
      )
        e.preventDefault();
      if (e.key === "Tab") add();
      if (e.key === "Enter") add(true);
      if (e.key === "Delete" || e.key === "Backspace")
        s.deleteSelected();
      if (e.key === "F2") startEdit();
      if (e.key === "ArrowLeft" && n.parentId) s.select(n.parentId);
      if (e.key === "ArrowRight" && n.children.length) {
        if (n.collapsed) s.execute({ type: "collapse", id: n.id });
        s.select(n.children[Math.floor(n.children.length / 2)]);
      }
      if (["ArrowUp", "ArrowDown"].includes(e.key) && n.parentId) {
        const siblings = s.tree.nodes[n.parentId].children,
          id =
            siblings[siblings.indexOf(n.id) + (e.key === "ArrowUp" ? -1 : 1)];
        if (id) s.select(id);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [add, startEdit, dragging, store]);
  useLayoutEffect(() => {
    if (
      !editing &&
      ready &&
      (document.activeElement === document.body ||
        document.activeElement?.closest(".topic"))
    ) {
      const topic = Array.from(
        root.current?.querySelectorAll<HTMLElement>("[data-topic-id]") ?? [],
      ).find((el) => el.dataset.topicId === selected);
      topic?.querySelector("textarea")?.focus({ preventScroll: true });
    }
    // A newly selected topic mounts only after the asynchronous layout resolves.
    // Retry focus transfer when the rendered nodes arrive, not just on selection.
  }, [selected, editing, ready, nodes]);
  const selectTopic = (event: React.MouseEvent, node: TopicNode) => {
    store.getState().select(
      node.id,
      event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "single",
    );
    const state = store.getState();
    if (!state.editing) {
      const activeTopic = Array.from(
        root.current?.querySelectorAll<HTMLElement>("[data-topic-id]") ?? [],
      ).find((el) => el.dataset.topicId === state.selected);
      activeTopic?.querySelector("textarea")?.focus({ preventScroll: true });
      if (
        !activeTopic &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement.closest(".topic")
      ) document.activeElement.blur();
    }
  };

  const candidate = (x: number, y: number, id: string): Drop | null => {
    if (!Object.hasOwn(tree.nodes, id)) return null;
    const excluded = new Set([id, ...descendants(tree, id)]);
    for (const el of root.current?.querySelectorAll<HTMLElement>(
      ".react-flow__node [data-topic-id]",
    ) ?? []) {
      const target = el.dataset.topicId!;
      if (excluded.has(target) || !Object.hasOwn(tree.nodes, target)) continue;
      const r = el.getBoundingClientRect();
      if (
        x < r.left - 12 ||
        x > r.right + 12 ||
        y < r.top - 12 ||
        y > r.bottom + 12
      )
        continue;
      const n = tree.nodes[target],
        ratio = (y - r.top) / r.height;
      const zone =
        n.parentId && ratio < 0.25
          ? "before"
          : n.parentId && ratio > 0.75
            ? "after"
            : "child";
      return {
        target,
        zone,
        parentId: zone === "child" ? target : n.parentId!,
        index:
          zone === "child"
            ? n.children.length
            : tree.nodes[n.parentId!].children.indexOf(target) +
              (zone === "after" ? 1 : 0),
      };
    }
    return null;
  };
  const edges = list.flatMap((n) =>
    n.collapsed
      ? []
      : n.children.map((id) => ({
          id: JSON.stringify([n.id, id]),
          source: n.id,
          target: id,
          type: "mind",
          data: { color: branchColor(tree, id, palette.branches) },
        })),
  );
  const displayedError =
    error ||
    (environment.storageError === "read"
      ? messages.storageReadError
      : environment.storageError === "write"
        ? messages.storageWriteError
        : "");
  return (
    <main
      ref={root}
      tabIndex={-1}
      className={`mindmap-root editor-shell${className ? ` ${className}` : ""}`}
      style={
        {
          ...style,
          "--map-root": palette.root,
          "--map-canvas": palette.canvas,
        } as CSSProperties
      }
    >
      {showHeader && <header className="app-header">
        <div className="document-heading">
          <GitBranch size={17} />
          {title ?? messages.defaultTitle}
        </div>
        <div className="header-actions">
        {showPalette && <button
          ref={paletteButton}
          className="palette-toggle"
          aria-expanded={paletteOpen}
          aria-controls={palettePanelId}
          onClick={() => setPaletteOpen((open) => !open)}
        >
          <Palette size={16} />
          {messages.palette}
        </button>}
        </div>
      </header>}
      <section
        onPointerDownCapture={(e) => {
          pointerStartedOnTopic.current = !!(e.target as HTMLElement).closest(".react-flow__node");
          if (e.button === 0) {
            setPointerHeld(true);
            if (!pointerStartedOnTopic.current) root.current?.focus({ preventScroll: true });
          }
        }}
        onContextMenuCapture={(e) => e.preventDefault()}
        className={`canvas-area ${pointerHeld ? "is-pointer-held" : ""} ${dragging ? "is-dragging" : ""} ${ready ? "is-ready" : ""}`}
        aria-label={messages.canvasLabel}
      >
        {(!ready || !environment.hydrated) && <div className="loading">{messages.loading}</div>}
        <ReactFlow
          nodes={visibleNodes.map((n) => ({
            ...n,
            data: {
              ...n.data,
              labels: {
                topicText: messages.topicText,
                imageTopic: messages.imageTopic,
                expand: messages.expand,
                collapse: messages.collapse,
              },
              color:
                n.id === tree.rootId
                  ? palette.root
                  : tree.nodes[n.id]
                    ? branchColor(tree, n.id, palette.branches)
                    : n.data.color,
            },
            selected: selectedIds.includes(n.id),
            draggable: !editing && selectedIds.length <= 1 && n.id !== tree.rootId,
            className: drop?.target === n.id ? `drop-${drop.zone}` : "",
          }))}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onPaneClick={() => {
            if (!pointerStartedOnTopic.current) store.getState().select(null);
          }}
          onNodeClick={selectTopic}
          onNodeContextMenu={(event, node) => {
            // macOS sends contextmenu instead of click for Control + left click.
            if (event.ctrlKey) selectTopic(event, node);
          }}
          onNodesChange={(changes) =>
            setNodes((ns) => applyNodeChanges(changes.filter((change) => change.type !== "select"), ns))
          }
          onMoveStart={(event) => {
            if (event) pendingReveal.current = null;
          }}
          onNodeDragStart={() => {
            setDragging(true);
            dropRef.current = null;
          }}
          onNodeDrag={(e, n) => {
            const mouse = e as MouseEvent;
            const d = candidate(mouse.clientX, mouse.clientY, n.id);
            dropRef.current = d;
            setDrop(d);
          }}
          onNodeDragStop={(_, n) => {
            const d = dropRef.current;
            if (d)
              store.getState().execute({
                type: "move",
                id: n.id,
                parentId: d.parentId,
                index: d.index,
              });
            setDragging(false);
            setDrop(null);
            dropRef.current = null;
            setLayoutTick((t) => t + 1);
          }}
          disableKeyboardA11y
          nodesConnectable={false}
          selectNodesOnDrag={false}
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
          selectionKeyCode={null}
          zoomOnDoubleClick={false}
          minZoom={0.02}
          maxZoom={2}
          panOnScroll
          zoomOnScroll={false}
          zoomOnPinch
          preventScrolling
        >
          <Background color={palette.dots} gap={22} size={1} />
        </ReactFlow>
        {dragging && (
          <div className="drag-message">
            {drop
              ? drop.zone === "child"
                ? messages.dragChild
                : messages.dragSibling
              : messages.dragHint}
          </div>
        )}
      </section>
      {(showFooter || (showPalette && paletteOpen)) && <div
        className={`popup-layer ${paletteOpen ? "has-palette" : ""} ${help ? "has-help" : ""}`}
      >
        <aside className="help-panel" aria-label="快捷键说明" hidden={!help}>
          <div>
            <strong>{messages.shortcuts}</strong>
            <button
              className="help-close"
              aria-label={messages.closeHelp}
              onClick={() => setHelp(false)}
            >
              ×
            </button>
          </div>
          {messages.helpRows.map(([shortcut, description]) => (
            <p key={shortcut}>{shortcut} <span>{description}</span></p>
          ))}
        </aside>
        <aside
          id={palettePanelId}
          className={`palette-panel ${paletteOpen ? "is-open" : ""}`}
          aria-label={messages.palettePanel}
          aria-hidden={!paletteOpen}
          hidden={!paletteOpen}
          inert={!paletteOpen}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closePalette();
            }
          }}
        >
          <div className="palette-heading">
              <div><h2>{messages.palettePanel}</h2></div>
            <button className="palette-close" aria-label={messages.closePalette} onClick={closePalette}>
              <X size={17} />
            </button>
          </div>
          <div
            className="palette-options"
            role="group"
            aria-label={locale === "zh-CN" ? "配色方案" : "Color palettes"}
          >
            {palettes.map((item) => (
              <button
                key={item.id}
                className={`palette-option ${item.id === palette.id ? "is-active" : ""}`}
                aria-pressed={item.id === palette.id}
                aria-label={item.name}
                onClick={() => choosePalette(item.id)}
              >
                <span className="palette-option-title"><strong>{item.name}</strong>{item.id === palette.id && <Check size={15} />}</span>
                <span className="palette-description">{item.description}</span>
                <span className="palette-swatches" aria-hidden="true">
                  {[item.root, ...item.branches].map((color) => <span key={color} style={{ background: color }} />)}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>}
      {showFooter && <footer className="statusbar">
        <div className="map-info">
          <PanelTop size={15} />
          <span>{messages.topics(Object.keys(tree.nodes).length)}</span>
        </div>
        <div className="zoom-controls">
          <div
            className="toolbar-actions"
            role="toolbar"
              aria-label={messages.canvasLabel}
          >
            <button
              className="tooltip-button"
              aria-label={messages.addChild}
              data-tooltip={messages.addChild}
              disabled={!current}
              onClick={() => add()}
            >
              <Plus size={16} />
            </button>
            <button
              className="tooltip-button"
              aria-label={messages.addSibling}
              data-tooltip={messages.addSibling}
              disabled={!current}
              onClick={() => add(true)}
            >
              <GitBranch size={16} />
            </button>
            <span className="status-divider" aria-hidden="true" />
            <button
              className="tooltip-button"
              aria-label={current?.collapsed ? messages.expand : messages.collapse}
              data-tooltip={current?.collapsed ? messages.expand : messages.collapse}
              disabled={selectedIds.length > 1 || !current?.children.length}
              onClick={() =>
                selected &&
                store.getState().execute({ type: "collapse", id: selected })
              }
            >
              {current?.collapsed ? (
                <UnfoldVertical size={16} />
              ) : (
                <FoldVertical size={16} />
              )}
            </button>
            <button
              className="tooltip-button"
              aria-label={messages.remove}
              data-tooltip={messages.remove}
              disabled={!selectedIds.some((id) => id !== tree.rootId)}
              onClick={remove}
            >
              <Trash2 size={16} />
            </button>
            <span className="status-divider" aria-hidden="true" />
            <button
              className="tooltip-button"
              aria-label={messages.undo}
              data-tooltip={messages.undo}
              disabled={!canUndo}
              onClick={() => store.getState().undo()}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="tooltip-button"
              aria-label={messages.redo}
              data-tooltip={messages.redo}
              disabled={!canRedo}
              onClick={() => store.getState().redo()}
            >
              <Redo2 size={16} />
            </button>
            <button
              className="tooltip-button"
              aria-label={messages.autoLayout}
              data-tooltip={messages.autoLayout}
              onClick={() => {
                pendingReveal.current = null;
                setLayoutTick((tick) => tick + 1);
              }}
            >
              <Scan size={16} />
            </button>
          </div>
          <span className="status-divider" />
          <button
            className="tooltip-button"
            aria-label={messages.zoomOut}
            data-tooltip={messages.zoomOut}
            onClick={() => {
              pendingReveal.current = null;
              void zoomOut({ duration: 180 });
            }}
          >
            <Minus size={16} />
          </button>
          <button
            className="tooltip-button"
            aria-label={messages.resetZoom}
            data-tooltip={messages.resetZoom}
            onClick={() => {
              pendingReveal.current = null;
              void setViewport({ ...viewport, zoom: 1 }, { duration: 180 });
            }}
          >
            <RotateCcw size={15} />
          </button>
          <button
            className="tooltip-button"
            aria-label={messages.zoomIn}
            data-tooltip={messages.zoomIn}
            onClick={() => {
              pendingReveal.current = null;
              void zoomIn({ duration: 180 });
            }}
          >
            <Plus size={16} />
          </button>
          <span className="status-divider" />
          <button
            className="tooltip-button"
            aria-label={messages.fitView}
            data-tooltip={messages.fitView}
            onClick={() => {
              pendingReveal.current = null;
              void fitView({ padding: 0.2, duration: 200, maxZoom: 1 });
            }}
          >
            <Maximize size={17} />
          </button>
          <span className="status-divider" aria-hidden="true" />
          <button
            className="tooltip-button"
            aria-label={messages.shortcuts}
            data-tooltip={messages.shortcuts}
            onClick={() => setHelp(!help)}
          >
            <CircleHelp size={17} />
          </button>
        </div>
      </footer>}
      {displayedError && (
        <div role="alert" className="error-toast">
          {displayedError}
          <button
            aria-label={messages.closeToast}
            onClick={() => {
              setError("");
              environment.clearStorageError();
            }}
          >
            ×
          </button>
        </div>
      )}
      <input
        ref={fileInput}
        data-testid="import-file"
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            store.getState().execute({
              type: "import",
              tree: importMindMapJson(await file.text()),
            });
            firstLayout.current = true;
            setError("");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Import failed");
          }
          event.target.value = "";
        }}
      />
      <div ref={measuring} className="measurement" aria-hidden="true">
        {list.map((n) => (
          <div
            key={n.id}
            data-measure-id={n.id}
            className={`topic ${n.id === tree.rootId ? "topic-root" : ""} ${n.kind === "image" ? "topic-image" : ""}`}
            style={n.kind === "image" ? { width: n.image.width, height: n.image.width / n.image.aspectRatio } : undefined}
          >
            {n.kind === "text" ? (
              <div className="topic-content"><span>{n.text}</span></div>
            ) : <div className="image-topic" />}
          </div>
        ))}
      </div>
    </main>
  );
}

export type MindMapEditorProps = Omit<MindMapProviderProps, "children"> &
  MindMapCanvasProps;

export function MindMapEditor({
  value,
  defaultValue,
  onChange,
  persistence,
  onError,
  assetStore,
  ...canvasProps
}: MindMapEditorProps) {
  const providerProps = value !== undefined
    ? { value, onChange: onChange!, onError, assetStore }
    : { defaultValue, onChange, persistence, onError, assetStore };
  return (
    <MindMapProvider {...providerProps}>
      <MindMapCanvas
        showHeader
        showFooter
        showPalette
        {...canvasProps}
      />
    </MindMapProvider>
  );
}

export default MindMapEditor;
