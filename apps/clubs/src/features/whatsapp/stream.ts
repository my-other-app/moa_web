"use client";

import * as React from "react";

import { STREAM_URL } from "./api";

/**
 * The inbox, live: one server-sent-event stream per open inbox
 * (GET /clubs/whatsapp/stream, through the gateway). A `changed` frame names
 * the conversation that changed -- never what it says -- and the inbox reads
 * it again. While the stream is up nothing is polled; when it is off on the
 * server (404), cannot be opened, or drops, the inbox polls instead, and
 * goes back to live when the browser's own reconnect brings `ready` again.
 */
export type StreamMode = "connecting" | "live" | "polling";

export interface StreamChange {
  conversationId: number | null;
  kind: string;
}

type Source = Pick<EventSource, "addEventListener" | "close" | "readyState">;

export function useInboxStream({
  enabled,
  onChange,
  url = STREAM_URL,
  create,
}: {
  enabled: boolean;
  onChange: (change: StreamChange) => void;
  url?: string;
  /** Tests stand in for EventSource. */
  create?: (url: string) => Source;
}): StreamMode {
  const [mode, setMode] = React.useState<StreamMode>("connecting");
  const changed = React.useRef(onChange);
  React.useEffect(() => {
    changed.current = onChange;
  }, [onChange]);
  const make = React.useMemo(
    () => create ?? (typeof EventSource === "undefined" ? null : (u: string) => new EventSource(u, { withCredentials: true })),
    [create],
  );
  const usable = enabled && make !== null;

  React.useEffect(() => {
    if (!usable || !make) return;
    let source: Source | null = null;
    try {
      source = make(url);
    } catch {
      // Told on the next tick: an effect sets state from a callback, never in its body.
      void Promise.resolve().then(() => setMode("polling"));
      return;
    }
    source.addEventListener("ready", () => setMode("live"));
    source.addEventListener("changed", (event) => {
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
    // A drop (the browser reconnects on its own) or a refusal (404 while the
    // server streams nothing; the browser gives up): poll meanwhile.
    source.addEventListener("error", () => setMode("polling"));
    return () => {
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
