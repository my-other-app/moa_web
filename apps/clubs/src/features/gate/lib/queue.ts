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
  /**
   * "station": a visit saved at a station, never an admission. Absent on a
   * scan at an entrance (and on every scan saved before stations existed).
   * Kept on the phone only; the server reads the purpose from the door.
   */
  purpose?: "station";
}

/**
 * Whether `saved` is the same scan again, for what is about to be saved:
 * at an entrance, the same ticket anywhere at an entrance (a ticket lets one
 * person in, whichever door); at a station, the same ticket at that station
 * (one visit per station counts). A visit never blocks an admission, nor an
 * admission a visit.
 */
export function sameScan(saved: QueuedScan, code: string, at: { door?: string | null; purpose?: "station" }): boolean {
  if (normalCode(saved.code) !== normalCode(code)) return false;
  if (at.purpose === "station") return saved.purpose === "station" && (saved.door ?? null) === (at.door ?? null);
  return saved.purpose !== "station";
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
  /**
   * The scan of this code already waiting on this phone for this event, if
   * any (the first saved): at an entrance any entrance's, at a station that
   * station's (`sameScan`).
   */
  async find(eventId: number, code: string, at: { door?: string | null; purpose?: "station" } = {}): Promise<QueuedScan | null> {
    return (await scanQueue.all(eventId)).find((s) => sameScan(s, code, at)) ?? null;
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
