import type { ScanBody } from "../schemas";
import { normalCode } from "./ticket-code";

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
  /** How often the server has asked for this scan again (see `askedAgain`); absent before the first. */
  attempts?: number;
  /** Not sent again before this time (ISO): the wait grows with each ask. */
  retryAt?: string;
}

/** The waits between asks for the same scan again: 15 s, doubling, at most 5 minutes. */
export const RETRY_FIRST_MS = 15_000;
export const RETRY_MAX_MS = 5 * 60_000;

/** The scan with one more ask counted, and not sent again before its next wait is over. */
export function askedAgainAt(scan: QueuedScan, now: number): QueuedScan {
  const attempts = (scan.attempts ?? 0) + 1;
  const wait = Math.min(RETRY_FIRST_MS * 2 ** (attempts - 1), RETRY_MAX_MS);
  return { ...scan, attempts, retryAt: new Date(now + wait).toISOString() };
}

/** Whether a saved scan may be sent now: never asked for again, or its wait is over. */
export const isDue = (scan: QueuedScan, now: number) => !scan.retryAt || Date.parse(scan.retryAt) <= now;

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
  /** The scan of this code already waiting on this phone for this event, if any (the first saved). */
  async find(eventId: number, code: string): Promise<QueuedScan | null> {
    const want = normalCode(code);
    return (await scanQueue.all(eventId)).find((s) => normalCode(s.code) === want) ?? null;
  },
  async count(eventId: number) {
    return tx<number>("readonly", (s) => s.index("eventId").count(eventId));
  },
  /** Saves these scans again as they now are (their asks counted), in one go. */
  async update(scans: QueuedScan[]) {
    if (!scans.length) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      const store = t.objectStore(STORE);
      scans.forEach((s) => store.put(s));
      t.oncomplete = () => {
        db.close();
        resolve();
      };
      t.onerror = () => reject(t.error);
    });
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
