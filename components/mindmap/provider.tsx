"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useStore } from "zustand";
import {
  defaultMindMapAssetStore,
  type MindMapAssetStore,
} from "../../lib/mindmap/assets";
import { parseDocument, sampleTree, serializeDocument, type Tree } from "../../lib/mindmap/model";
import {
  createMindMapStore,
  type ConfigurableMindMapStore,
  type MindMapChangeHandler,
  type MindMapState,
} from "../../lib/mindmap/store";

export type MindMapPersistence = {
  documentKey: string;
  paletteKey?: string;
  debounceMs?: number;
};

type SharedProviderProps = {
  children: ReactNode;
  onError?: (error: Error) => void;
  assetStore?: MindMapAssetStore;
};

export type ControlledMindMapProps = SharedProviderProps & {
  value: Tree;
  onChange: MindMapChangeHandler;
  defaultValue?: never;
  persistence?: never;
};

export type UncontrolledMindMapProps = SharedProviderProps & {
  value?: never;
  defaultValue?: Tree;
  onChange?: MindMapChangeHandler;
  persistence?: MindMapPersistence;
};

export type MindMapProviderProps =
  | ControlledMindMapProps
  | UncontrolledMindMapProps;

export type MindMapViewportActions = {
  fitView: () => Promise<void>;
  zoomIn: () => Promise<void>;
  zoomOut: () => Promise<void>;
  resetZoom: () => Promise<void>;
  requestLayout: () => void;
};

type RegisteredViewportActions = MindMapViewportActions | null;

type MindMapContextValue = {
  store: ConfigurableMindMapStore;
  assetStore: MindMapAssetStore;
  hydrated: boolean;
  persistence?: MindMapPersistence;
  storageError: "read" | "write" | null;
  clearStorageError: () => void;
  viewport: MindMapViewportActions;
  registerViewport: (actions: RegisteredViewportActions) => void;
};

const MindMapContext = createContext<MindMapContextValue | null>(null);

function sameTree(left: Tree, right: Tree) {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

export function MindMapProvider(props: MindMapProviderProps) {
  const { children, onChange, onError } = props;
  const controlled = props.value !== undefined;
  const persistence = controlled ? undefined : props.persistence;
  const [hydrated, setHydrated] = useState(!persistence);
  const [storageError, setStorageError] = useState<"read" | "write" | null>(null);
  const [store] = useState(() =>
    createMindMapStore(props.value ?? props.defaultValue ?? sampleTree()),
  );
  const assetStore = props.assetStore ?? defaultMindMapAssetStore;

  const registeredViewport = useRef<RegisteredViewportActions>(null);
  const viewport = useMemo<MindMapViewportActions>(
    () => ({
      fitView: () => registeredViewport.current?.fitView() ?? Promise.resolve(),
      zoomIn: () => registeredViewport.current?.zoomIn() ?? Promise.resolve(),
      zoomOut: () => registeredViewport.current?.zoomOut() ?? Promise.resolve(),
      resetZoom: () => registeredViewport.current?.resetZoom() ?? Promise.resolve(),
      requestLayout: () => registeredViewport.current?.requestLayout(),
    }),
    [],
  );

  useEffect(() => {
    store.setChangeHandler(onChange);
    return () => store.setChangeHandler(undefined);
  }, [onChange, store]);

  useEffect(() => {
    if (!controlled || sameTree(store.getState().tree, props.value)) return;
    store.getState().hydrate(props.value);
  }, [controlled, props.value, store]);

  useEffect(() => {
    if (!persistence) return;
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(persistence.documentKey);
        if (raw) store.getState().hydrate(parseDocument(JSON.parse(raw)));
      } catch (cause) {
        setStorageError("read");
        onError?.(
          cause instanceof Error
            ? cause
            : new Error("Unable to read the persisted mind map."),
        );
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [onError, persistence, store]);

  useEffect(() => {
    if (!persistence || !hydrated) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      if (timer) clearTimeout(timer);
      try {
        localStorage.setItem(
          persistence.documentKey,
          JSON.stringify(serializeDocument(store.getState().tree)),
        );
      } catch (cause) {
        setStorageError("write");
        onError?.(
          cause instanceof Error
            ? cause
            : new Error("Unable to persist the mind map."),
        );
      }
    };
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.tree === previous.tree) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, persistence.debounceMs ?? 300);
    });
    timer = setTimeout(save, persistence.debounceMs ?? 300);
    window.addEventListener("pagehide", save);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      window.removeEventListener("pagehide", save);
    };
  }, [hydrated, onError, persistence, store]);

  const context = useMemo<MindMapContextValue>(
    () => ({
      store,
      assetStore,
      hydrated,
      persistence,
      storageError,
      clearStorageError: () => setStorageError(null),
      viewport,
      registerViewport: (actions) => {
        registeredViewport.current = actions;
      },
    }),
    [assetStore, hydrated, persistence, storageError, store, viewport],
  );

  return (
    <MindMapContext.Provider value={context}>
      <ReactFlowProvider>{children}</ReactFlowProvider>
    </MindMapContext.Provider>
  );
}

function useMindMapContext() {
  const context = useContext(MindMapContext);
  if (!context)
    throw new Error("Mind map components must be rendered inside MindMapProvider.");
  return context;
}

export function useMindMapStoreApi() {
  return useMindMapContext().store;
}

export function useMindMapEnvironment() {
  return useMindMapContext();
}

export type MindMapHookValue = MindMapState &
  MindMapViewportActions & { canUndo: boolean; canRedo: boolean };

export function useMindMap(): MindMapHookValue;
export function useMindMap<T>(selector: (state: MindMapState) => T): T;
export function useMindMap<T>(selector?: (state: MindMapState) => T) {
  const { store, viewport } = useMindMapContext();
  const state = useStore(
    store,
    (selector ?? ((value: MindMapState) => value)) as (
      state: MindMapState,
    ) => T | MindMapState,
  );
  if (selector) return state;
  const mapState = state as MindMapState;
  return {
    ...mapState,
    ...viewport,
    canUndo: mapState.history.length > 0,
    canRedo: mapState.future.length > 0,
  };
}
