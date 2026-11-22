import { ApiError } from "@moa/api";

import type { Claimed, ClaimResponse } from "./schemas";

/** What the station is doing, for the screen. */
export type StationState =
  | { kind: "connecting" }
  | { kind: "idle"; queued: number }
  | { kind: "printing"; name: string; queued: number; test: boolean }
  | { kind: "offline"; message: string }
  | { kind: "unpaired" };

export interface StationResult {
  id: string;
  at: number;
  name: string;
  ok: boolean;
  test: boolean;
  error: string | null;
}

/** One thing to print: a claimed card, or the sample card. */
export interface StationJob {
  id: string;
  name: string;
  /** The card's URL; for the test card, the sample endpoint. */
  url: string;
  method: "GET" | "POST";
  test: boolean;
}

export interface StationLoopDeps {
  claim: () => Promise<ClaimResponse>;
  /** Prints one job and resolves once the print call has returned; rejects with the reason it could not. */
  print: (job: StationJob) => Promise<void>;
  done: (id: string, ok: boolean, error: string | null) => Promise<void>;
  cardUrl: (claimed: Claimed) => string;
  testUrl: string;
  onState: (state: StationState) => void;
  onResult: (result: StationResult) => void;
  /** Milliseconds: between claims when idle, after an error, after a card, between tries to confirm. */
  delays?: Partial<{ idle: number; error: number; afterJob: number; confirm: number }>;
  confirmTries?: number;
}

export const DEFAULT_DELAYS = { idle: 2000, error: 5000, afterJob: 2500, confirm: 1500 };

/** Words for staff, never a stack trace. */
export function problemWords(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "The card could not be printed.";
}

const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401;

/**
 * The print station's loop, free of React so it can be tested with a clock.
 *
 * One step at a time and never two calls in flight: claim, then (if there is a card) print it, then
 * confirm; only then the next claim is scheduled. A claim every 2 s while idle, 5 s after an error.
 * A card that cannot be fetched or printed is reported as failed (`done ok:false`); a card that
 * printed is reported after the print call returns. The sample card goes through the same one-at-a-time
 * path, so it never prints over a real card.
 */
export function createStationLoop(deps: StationLoopDeps) {
  const delay = { ...DEFAULT_DELAYS, ...deps.delays };
  const tries = deps.confirmTries ?? 3;
  let running = false;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let testWanted = false;
  let queued = 0;

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = running ? setTimeout(() => void tick(), ms) : null;
  };
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  /** Prints the job and tells the server how it went. Returns false when the server could not be told. */
  async function process(job: StationJob): Promise<boolean> {
    deps.onState({ kind: "printing", name: job.name, queued, test: job.test });
    let error: string | null = null;
    try {
      await deps.print(job);
    } catch (e) {
      error = problemWords(e);
    }
    const ok = error === null;
    deps.onResult({ id: job.id, at: Date.now(), name: job.name, ok, test: job.test, error });
    if (job.test) return true;
    for (let i = 0; i < tries; i++) {
      try {
        await deps.done(job.id, ok, error);
        return true;
      } catch (e) {
        if (isUnauthorized(e)) throw e;
        if (i < tries - 1) await sleep(delay.confirm);
      }
    }
    return false;
  }

  async function tick() {
    timer = null;
    if (!running || busy) return;
    busy = true;
    let next = delay.idle;
    try {
      if (testWanted) {
        testWanted = false;
        await process({ id: `test-${Date.now()}`, name: "Test card", url: deps.testUrl, method: "POST", test: true });
        deps.onState({ kind: "idle", queued });
        next = delay.afterJob;
      } else {
        const r = await deps.claim();
        queued = r.queued;
        if (r.request) {
          const c = r.request;
          const confirmed = await process({ id: c.id, name: c.name || "a guest", url: deps.cardUrl(c), method: "GET", test: false });
          deps.onState({ kind: "idle", queued: Math.max(0, queued - 1) });
          next = confirmed ? delay.afterJob : delay.error;
        } else {
          deps.onState({ kind: "idle", queued: 0 });
        }
      }
    } catch (e) {
      if (isUnauthorized(e)) {
        running = false;
        deps.onState({ kind: "unpaired" });
        busy = false;
        return;
      }
      deps.onState({ kind: "offline", message: problemWords(e) });
      next = delay.error;
    } finally {
      busy = false;
    }
    schedule(next);
  }

  return {
    start() {
      if (running) return;
      running = true;
      deps.onState({ kind: "connecting" });
      schedule(0);
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    /** Asks for the sample card; false when a card is printing right now (try again in a moment). */
    printTest(): boolean {
      if (busy || !running) return false;
      testWanted = true;
      schedule(0);
      return true;
    },
    get busy() {
      return busy;
    },
  };
}
export type StationLoop = ReturnType<typeof createStationLoop>;
