import type { ScanBody } from "../schemas";

/**
 * Offline scan queue in IndexedDB. Each scan carries a client reference, so
 * replaying a batch is harmless; the server admits a guest once whatever
 * order the phones come back online in.
 */
const DB = "moa-gate";
const STORE = "scans";

export interface QueuedScan extends ScanBody {
  eventId: number;
  queuedAt: string;
}

export const supportsQueue = () => typeof indexedDB !== "undefined";

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "client_ref" });
      store.createIndex("eventId", "eventId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const tx = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
};

export const scanQueue = {
  async add(scan: QueuedScan) {
    await tx("readwrite", (s) => s.put(scan));
  },
  async all(eventId: number): Promise<QueuedScan[]> {
    const rows = await tx<QueuedScan[]>("readonly", (s) => s.index("eventId").getAll(eventId));
    return rows.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  },
  async count(eventId: number) {
    return tx<number>("readonly", (s) => s.index("eventId").count(eventId));
  },
  async remove(refs: string[]) {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      const store = t.objectStore(STORE);
      refs.forEach((r) => store.delete(r));
      t.oncomplete = () => {
        db.close();
        resolve();
      };
      t.onerror = () => reject(t.error);
    });
  },
};
