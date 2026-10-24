"use client";

import * as React from "react";

import { STREAM_URL } from "./api";

/**
 * The inbox, live: one server-sent-event stream per open inbox
 * (GET /clubs/whatsapp/stream, through the gateway). A `changed` frame names
 * the conversation that changed -- never what it says -- and the inbox reads
 * it again; each `ready` (the first, and every one after a reconnect) has it
 * read everything once, for what changed while it was away. While the
 * stream is up nothing is polled.
 *
 * When it drops, the browser reconnects on its own (readyState CONNECTING)
 * and the inbox polls meanwhile. When the browser gives up instead -- an
 * answer that isn't a stream (401, 404 while the server streams nothing, the
 * 502 for a minute after each deploy) leaves it CLOSED for good -- the hook
 * opens a new one itself after 5 s, 15 s, then every 60 s, polling all the
 * while, until a `ready` puts it back to live.
 */
export type StreamMode = "connecting" | "live" | "polling";

export interface StreamChange {
  conversationId: number | null;
  /** message, status, read, conversation (the server's kinds); resync after a `ready`. */
  kind: string;
}

/** Everything again: after a `ready`, when frames may have been missed. */
export const RESYNC: StreamChange = { conversationId: null, kind: "resync" };

/** How long the hook waits before opening a stream the browser gave up on: 5 s, 15 s, then a minute each time. */
export const REOPEN_AFTER = [5_000, 15_000, 60_000] as const;

/** EventSource.CLOSED, which jsdom has no EventSource to read from. */
const CLOSED = 2;

type Source = Pick<EventSource, "addEventListener" | "close" | "readyState">;

export function useInboxStream({
  enabled,
  onChange,
  onReady,
  url = STREAM_URL,
  create,
}: {
  enabled: boolean;
  onChange: (change: StreamChange) => void;
  /** Each `ready`: the inbox reads everything once. */
  onReady?: () => void;
  url?: string;
  /** Tests stand in for EventSource. */
  create?: (url: string) => Source;
}): StreamMode {
  const [mode, setMode] = React.useState<StreamMode>("connecting");
  const changed = React.useRef(onChange);
  const ready = React.useRef(onReady);
  React.useEffect(() => {
    changed.current = onChange;
    ready.current = onReady;
  }, [onChange, onReady]);
  const make = React.useMemo(
    () => create ?? (typeof EventSource === "undefined" ? null : (u: string) => new EventSource(u, { withCredentials: true })),
    [create],
  );
  const usable = enabled && make !== null;

  React.useEffect(() => {
    if (!usable || !make) return;
    let source: Source | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let stopped = false;

    const reopenLater = () => {
      if (stopped || timer) return;
      const wait = REOPEN_AFTER[Math.min(attempts, REOPEN_AFTER.length - 1)]!;
      attempts += 1;
      timer = setTimeout(() => {
        timer = null;
        open();
      }, wait);
    };

    const open = () => {
      if (stopped) return;
      let next: Source;
      try {
        next = make(url);
      } catch {
        // Told on the next tick: an effect sets state from a callback, never in its body.
        void Promise.resolve().then(() => {
          if (!stopped) setMode("polling");
        });
        reopenLater();
        return;
      }
      source = next;
      next.addEventListener("ready", () => {
        attempts = 0;
        setMode("live");
        ready.current?.();
      });
      next.addEventListener("changed", (event) => {
        let data: { conversation_id?: unknown; kind?: unknown } = {};
        try {
          data = JSON.parse((event as MessageEvent).data ?? "{}") as typeof data;
        } catch {
          data = {};
        }
        changed.current({
          conversationId: typeof data.conversation_id === "number" ? data.conversation_id : null,
          kind: typeof data.kind === "string" ? data.kind : "message",
        });
      });
      next.addEventListener("error", () => {
        setMode("polling");
        // CONNECTING: the browser is already trying again. CLOSED: it gave up, so this does.
        if (next.readyState === CLOSED && source === next) {
          next.close();
          source = null;
          reopenLater();
        }
      });
    };

    open();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      source?.close();
      setMode("connecting");
    };
  }, [usable, make, url]);

  return usable ? mode : "polling";
}

/** How often the inbox polls in each mode: nothing while live. */
export function pollEvery(mode: StreamMode, what: "list" | "thread"): number | false {
  if (mode === "live") return false;
  return what === "list" ? 15_000 : 5_000;
}

/** At most one refresh in this long, however many frames arrive. */
export const COALESCE_MS = 1_500;

/**
 * Hands on what arrives at most once every `every` ms: the first at once,
 * the rest together at the end of the wait. A burst of frames (a broadcast's
 * statuses coming back) is one refresh, not hundreds.
 */
export function useCoalesced<T>(flush: (batch: T[]) => void, every: number = COALESCE_MS): (item: T) => void {
  const pending = React.useRef<T[]>([]);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = React.useRef(Number.NEGATIVE_INFINITY);
  const flushing = React.useRef(flush);
  React.useEffect(() => {
    flushing.current = flush;
  }, [flush]);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current = [];
    },
    [],
  );
  return React.useCallback(
    (item: T) => {
      pending.current.push(item);
      if (timer.current) return;
      const run = () => {
        timer.current = null;
        last.current = Date.now();
        const batch = pending.current;
        pending.current = [];
        if (batch.length) flushing.current(batch);
      };
      const wait = last.current + every - Date.now();
      if (wait <= 0) run();
      else timer.current = setTimeout(run, wait);
    },
    [every],
  );
}

/** What a batch of changes asks the inbox to read again. */
export interface RefreshPlan {
  /** The conversation list (and the overview's counts). */
  list: boolean;
  /** Every conversation's messages ("all"), or these. */
  threads: "all" | number[];
}

/**
 * A status coming back (delivered, read) changes only the ticks: the list is
 * read again for one only when that conversation is on screen. Anything
 * else -- a message, a read, a conversation closed, a resync -- reads it.
 */
export function planRefresh(batch: StreamChange[], onScreen: ReadonlySet<number>): RefreshPlan {
  let list = false;
  let all = false;
  const threads = new Set<number>();
  for (const c of batch) {
    if (c.conversationId === null) {
      list = true;
      all = true;
      continue;
    }
    threads.add(c.conversationId);
    if (c.kind !== "status" || onScreen.has(c.conversationId)) list = true;
  }
  return { list, threads: all ? "all" : [...threads] };
}
