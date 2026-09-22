export interface MindMapAssetStore {
  save(blob: Blob): Promise<string>;
  load(assetId: string): Promise<Blob | null>;
}

const DATABASE = "kanx-mindmap-assets";
const STORE = "assets";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbMindMapAssetStore implements MindMapAssetStore {
  async save(blob: Blob) {
    const id = globalThis.crypto?.randomUUID?.() ??
      `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const database = await openDatabase();
    try {
      await requestResult(database.transaction(STORE, "readwrite").objectStore(STORE).put(blob, id));
      return id;
    } finally {
      database.close();
    }
  }

  async load(assetId: string) {
    const database = await openDatabase();
    try {
      const value = await requestResult(database.transaction(STORE, "readonly").objectStore(STORE).get(assetId));
      return value instanceof Blob ? value : null;
    } finally {
      database.close();
    }
  }
}

export const defaultMindMapAssetStore = new IndexedDbMindMapAssetStore();
