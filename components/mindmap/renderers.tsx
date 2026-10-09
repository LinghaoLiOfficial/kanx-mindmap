"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BaseEdge,
  getBezierPath,
  Handle,
  NodeResizeControl,
  Position,
  useReactFlow,
  useUpdateNodeInternals,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useMindMap, useMindMapEnvironment, useMindMapStoreApi } from "./provider";
import type { MindNode } from "../../lib/mindmap/model";
import { getMindMapEdgeRoute } from "../../lib/mindmap/edge-routing";

type TopicData = {
  topic: MindNode;
  color: string;
  root: boolean;
  labels: { topicText: string; imageTopic: string; expand: string; collapse: string };
};
export type TopicNode = Node<TopicData>;

function TopicInput({ id, text, label }: { id: string; text: string; label: string }) {
  const store = useMindMapStoreApi();
  const editing = useMindMap((s) => s.editing);
  const selected = useMindMap((s) => s.selected === id);
  const active = editing?.id === id;
  const input = useRef<HTMLTextAreaElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const { setNodes: updateNodes } = useReactFlow();
  const applySize = (width: number, height: number) => {
    updateNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              style: { ...node.style, width, height },
            }
          : node,
      ),
    );
  };
  const growth = useRef<{ base: number; width: number; max: number } | null>(
    null,
  );
  const resizeDraft = () => {
    const el = input.current!;
    const topic = el.closest<HTMLElement>(".topic")!;
    const mirror = el.parentElement!.querySelector<HTMLElement>("span")!;
    if (!growth.current) {
      const width = topic.offsetWidth;
      growth.current = {
        base: width,
        width,
        max: parseFloat(getComputedStyle(topic).maxWidth),
      };
    }
    const sizing = growth.current;
    mirror.textContent =
      el.value + (el.value.endsWith("\n") || !el.value ? "\u200b" : "");
    const css = getComputedStyle(topic);
    const padding =
      parseFloat(css.paddingLeft) + parseFloat(css.paddingRight) + 2;
    // Measure the longest explicit line in CSS pixels, independent of canvas zoom.
    mirror.style.whiteSpace = "pre";
    const required = mirror.scrollWidth + padding;
    mirror.style.whiteSpace = "";
    const middle = (sizing.base + sizing.max) / 2;
    if (required > sizing.width)
      sizing.width = required <= middle ? middle : sizing.max;
    topic.style.width = `${sizing.width}px`;
    const height = topic.offsetHeight;
    applySize(sizing.width, height);
    el.scrollTop = 0;
    el.scrollLeft = 0;
    updateNodeInternals(id);
  };
  const done = useRef(false),
    composing = useRef(false);
  useLayoutEffect(() => {
    // React Flow may mount this input after Canvas has already synchronized focus.
    if (
      selected &&
      !editing &&
      (document.activeElement === document.body ||
        document.activeElement?.closest(".topic"))
    )
      input.current?.focus({ preventScroll: true });
  }, [selected, editing]);
  useLayoutEffect(() => {
    const el = input.current!;
    done.current = false;
    if (composing.current) return;
    if (active) {
      el.value = editing.initialText ?? text;
      el.focus({ preventScroll: true });
      if (editing.initialText === undefined) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
      resizeDraft();
    } else {
      el.value = "";
      if (growth.current) {
        const topic = el.closest<HTMLElement>(".topic")!;
        topic.style.width = "";
        el.parentElement!.querySelector("span")!.textContent = text;
        growth.current = null;
        applySize(topic.offsetWidth, topic.offsetHeight);
        updateNodeInternals(id);
      }
    }
    // Sizing is refreshed for this edit session, not on every layout render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, editing, text]);
  const finish = (cancel = false) => {
    if (!active || done.current) return;
    done.current = true;
    if (!cancel)
      store.getState().execute({ type: "text", id, text: input.current!.value });
    store.getState().edit(null);
  };
  return (
    <textarea
      ref={input}
      aria-label={label}
      aria-hidden={!active}
      tabIndex={-1}
      className="nodrag nopan"
      onFocus={(e) => {
        if (!active) e.currentTarget.select();
      }}
      onChange={(e) => {
        if (!active) {
          const state = store.getState();
          state.edit(state.selected, e.currentTarget.value);
        }
        resizeDraft();
      }}
      onCompositionStart={() => {
        composing.current = true;
        if (!active) {
          const state = store.getState();
          state.edit(state.selected, "");
        }
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onBlur={() => finish()}
      onKeyDown={(e) => {
        if (!active) {
          if (
            e.nativeEvent.isComposing ||
            (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey)
          )
            e.stopPropagation();
          return;
        }
        e.stopPropagation();
        if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229)
          return;
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          finish();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          finish(true);
        }
      }}
    />
  );
}
const Topic = memo(function Topic({ id, data }: NodeProps<TopicNode>) {
  const store = useMindMapStoreApi();
  // Text must update with the edit commit, without waiting for ELK positions.
  const topic = useMindMap((s) => s.tree.nodes[id]) ?? data.topic;
  const text = topic.kind === "text" ? topic.text : "";
  const selected = useMindMap((s) => s.selectedIds.includes(id)),
    multiple = useMindMap((s) => s.selectedIds.length > 1),
    editingState = useMindMap((s) => s.editing),
    editing = editingState?.id === id;
  return (
    <div
      className={`topic nopan ${data.root ? "topic-root" : ""} ${topic.kind === "image" ? "topic-image" : ""} ${selected ? "is-selected" : ""} ${editing ? "is-editing" : ""}`}
      style={{ "--branch": data.color } as React.CSSProperties}
      data-topic-id={id}
      aria-label={topic.kind === "image" ? data.labels.imageTopic : undefined}
      onDoubleClick={(e) => {
        e.stopPropagation();
        store.getState().select(id);
        // Supplying the current text selects the end of the draft instead of
        // selecting everything. This is intentionally distinct from F2, whose
        // no-initial-text path preserves its replace-all behavior.
        if (topic.kind === "text") store.getState().edit(id, text);
      }}
    >
      <Handle type="target" position={Position.Left} />
      {topic.kind === "text" ? (
        <div className="topic-content">
          <span>{text}</span>
          <TopicInput id={id} text={text} label={data.labels.topicText} />
        </div>
      ) : (
        <ImageTopic id={id} assetId={topic.image.assetId} aspectRatio={topic.image.aspectRatio} visible={selected && !multiple} />
      )}
      <Handle type="source" position={Position.Right} />
      {data.topic.children.length > 0 && (
        <button
          className="fold-toggle nodrag nopan"
          disabled={multiple}
          aria-label={`${data.topic.collapsed ? data.labels.expand : data.labels.collapse} ${text || data.labels.imageTopic}`}
          onClick={(e) => {
            e.stopPropagation();
            store.getState().execute({ type: "collapse", id });
          }}
        >
          {data.topic.collapsed ? data.topic.children.length : "−"}
        </button>
      )}
    </div>
  );
});

function ImageTopic({ id, assetId, aspectRatio, visible }: {
  id: string;
  assetId: string;
  aspectRatio: number;
  visible: boolean;
}) {
  const { assetStore } = useMindMapEnvironment();
  const store = useMindMapStoreApi();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void assetStore.load(assetId).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, assetStore]);
  return (
    <div className="image-topic">
      {url ? <img src={url} alt="" draggable={false} /> : <span className="image-placeholder" />}
      {visible && (
        <NodeResizeControl
          className="image-resize-handle nodrag nopan"
          position="bottom-right"
          minWidth={80}
          maxWidth={1200}
          minHeight={80 / aspectRatio}
          maxHeight={1200 / aspectRatio}
          keepAspectRatio
          onResizeEnd={(_, params) =>
            store.getState().execute({ type: "resizeImage", id, width: Math.round(params.width) })
          }
        />
      )}
    </div>
  );
}
function MindEdge(props: EdgeProps) {
  const route = getMindMapEdgeRoute(props);
  const path = route?.path ?? getBezierPath({ ...props, curvature: 0.42 })[0];
  return (
    <BaseEdge
      path={path}
      style={{ stroke: props.data?.color as string, strokeWidth: 2 }}
    />
  );
}

// Keep renderer identities independent of editor state and editor Fast Refresh.
export const nodeTypes = { topic: Topic };
export const edgeTypes = { mind: MindEdge };
