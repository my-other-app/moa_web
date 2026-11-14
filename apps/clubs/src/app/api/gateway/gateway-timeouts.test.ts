import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { UPSTREAM_TIMEOUT, UPSTREAM_TIMEOUT_MS, createGatewayHandlers, upstreamTimeout } from "@moa/auth/gateway";

/**
 * The API has a fixed time to start answering a call through the gateway:
 * a minute for most, three for the slow ones (a big review decision, an
 * import, an export, a bundle, a PDF), none for an event stream or a
 * streamed upload. Once the answer has started, its body is not timed. A
 * call the browser gave up on is cancelled upstream too.
 */
let server: http.Server;
let apiUrl = "";
/** Each upstream request, and whether the gateway hung up on it before it was answered. */
const seen: Array<{ url: string; dropped: boolean }> = [];

/** How long the fake API waits before answering, by path. */
const DELAY: Record<string, number> = {
  "/api/v1/clubs/stuck": 10_000,
  "/api/v1/clubs/slow": 150,
  "/api/v1/events/registration/7/requests/approve": 150,
  "/api/v1/clubs/whatsapp/stream": 300,
  "/api/v1/clubs/whatsapp/conversations/8/media": 150,
  "/api/v1/events/7/idcards/batch.pdf": 10_000,
};

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    for await (const _ of req) void _;
    const entry = { url: req.url!, dropped: false };
    seen.push(entry);
    res.on("close", () => {
      if (!res.writableFinished) entry.dropped = true;
    });
    const path = req.url!.split("?")[0]!;
    if (path === "/api/v1/clubs/trickle") {
      // Starts answering at once, then takes longer than the limit to finish.
      res.writeHead(200, { "content-type": "text/csv" });
      res.write("name\r\n");
      setTimeout(() => res.end("Ananya\r\n"), 150);
      return;
    }
    const timer = setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    }, DELAY[path] ?? 0);
    res.on("close", () => clearTimeout(timer));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  seen.length = 0;
});

const HOST = "club-dashboard.myotherapp.in";
const SHORT = { standard: 50, long: 250 };
const calls: Array<{ method: string; path: string; status: number }> = [];
const gateway = () => createGatewayHandlers({ apiUrl, timeouts: SHORT, onUpstreamResponse: ({ method, path, status }) => calls.push({ method, path, status }) });
const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
const own = { origin: `https://${HOST}`, "sec-fetch-site": "same-origin" };
const call = (method: string, path: string, init: { headers?: Record<string, string>; body?: BodyInit; signal?: AbortSignal } = {}) =>
  gateway()[method as "POST"](
    new Request(`https://${HOST}/api/gateway/${path}`, {
      method,
      headers: { host: HOST, ...own, ...init.headers },
      body: init.body,
      signal: init.signal,
      ...(init.body instanceof ReadableStream ? { duplex: "half" } : {}),
    } as RequestInit),
    ctx(path),
  );
const settle = () => new Promise((r) => setTimeout(r, 30));

describe("which calls get how long", () => {
  const get = (path: string, headers: Record<string, string> = {}) => new Request(`https://${HOST}/api/gateway${path}`, { headers });
  const limit = (path: string, headers?: Record<string, string>) => upstreamTimeout(get(path, headers), path.split("?")[0]!);

  it("gives an ordinary call a minute", () => {
    expect(UPSTREAM_TIMEOUT_MS).toEqual({ standard: 60_000, long: 180_000 });
    for (const path of ["/api/v1/clubs/overview", "/api/v1/auth/me", "/api/v1/events/42/attendees", "/api/v1/events/42/gate/scan-batch", "/api/v1/clubs/ai/write"]) {
      expect(limit(path)).toBe(60_000);
    }
  });

  it("gives review decisions, imports, exports, bundles and PDFs three minutes", () => {
    for (const path of [
      // Approvals and bulk confirm: up to 500 at a time.
      "/api/v1/events/registration/7/requests/approve",
      "/api/v1/events/registration/7/requests/decline",
      "/api/v1/events/registration/7/requests/reopen",
      "/api/v1/clubs/7/approve",
      "/api/v1/events/registration/7/bulk-import",
      // Exports and statements, CSV or Excel.
      "/api/v1/events/registration/7/export",
      "/api/v1/events/registration/7/requests/export?format=xlsx",
      "/api/v1/events/7/ticketing/waitlist/export",
      "/api/v1/clubs/followers/export.csv?segment=all",
      "/api/v1/clubs/finance/statement.csv",
      "/api/v1/user/admin/export",
      "/api/v1/clubs/members?format=xlsx",
      // Bundles and PDFs.
      "/api/v1/events/7/sends/tickets/bundle.zip",
      "/api/v1/events/7/idcards/batch.pdf?scope=all",
      "/api/v1/events/7/idcards/31.pdf",
      "/api/v1/events/7/programme.pdf",
    ]) {
      expect(limit(path), path).toBe(180_000);
    }
  });

  it("gives an event stream no limit", () => {
    for (const path of ["/api/v1/clubs/whatsapp/stream", "/api/v1/clubs/mailbox/stream", "/api/v1/events/7/live/stream"]) {
      expect(limit(path)).toBeNull();
    }
    // Whatever its path, a request asking for an event stream.
    expect(limit("/api/v1/clubs/overview", { accept: "text/event-stream" })).toBeNull();
  });

  it("is not fooled by a word inside another", () => {
    expect(limit("/api/v1/clubs/exporters")).toBe(60_000);
    expect(limit("/api/v1/clubs/bulkhead")).toBe(60_000);
    expect(limit("/api/v1/clubs/streams")).toBe(60_000);
  });
});

describe("the upstream timeout", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("answers 504 with a worded message when the API does not start answering in time, and hangs up on it", async () => {
    const started = Date.now();
    const res = await call("GET", "api/v1/clubs/stuck");
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(res.status).toBe(504);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { message: string; error_code: string };
    expect(body.error_code).toBe(UPSTREAM_TIMEOUT);
    expect(body.message).toMatch(/took too long/);
    await settle();
    expect(seen).toEqual([{ url: "/api/v1/clubs/stuck", dropped: true }]);
    // Reported as the upstream failing, so it is seen.
    expect(calls).toEqual([{ method: "GET", path: "/api/v1/clubs/stuck", status: 504 }]);
  });

  it("times a change out the same way", async () => {
    const res = await call("POST", "api/v1/clubs/stuck", { body: "{}" });
    expect(res.status).toBe(504);
  });

  it("waits longer for a slow kind of call", async () => {
    // 150 ms: past the standard limit, inside the long one.
    expect((await call("GET", "api/v1/clubs/slow")).status).toBe(504);
    const res = await call("POST", "api/v1/events/registration/7/requests/approve", { body: JSON.stringify({ all_pending: true }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("never times out an event stream", async () => {
    // 300 ms: past both limits.
    const res = await call("GET", "api/v1/clubs/whatsapp/stream", { headers: { accept: "text/event-stream" } });
    expect(res.status).toBe(200);
  });

  it("never times out a streamed upload", async () => {
    const bytes = new TextEncoder().encode("--b\r\n\r\nfile\r\n--b--\r\n");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const res = await call("POST", "api/v1/clubs/whatsapp/conversations/8/media", {
      headers: { "content-type": "multipart/form-data; boundary=b", "content-length": String(bytes.byteLength) },
      body,
    });
    expect(res.status).toBe(200);
  });

  it("does not cut off an answer that has started, however long its body takes", async () => {
    const res = await call("GET", "api/v1/clubs/trickle");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("name\r\nAnanya\r\n");
  });
});

describe("a call the browser gave up on", () => {
  it("is cancelled upstream, and answered quietly rather than as a fault", async () => {
    const browser = new AbortController();
    // A long call the fake API holds for 10 s.
    const pending = call("GET", "api/v1/events/7/idcards/batch.pdf?scope=all", { signal: browser.signal });
    await settle();
    browser.abort();
    const res = await pending;
    expect(res.status).toBe(499);
    await settle();
    expect(seen).toEqual([{ url: "/api/v1/events/7/idcards/batch.pdf?scope=all", dropped: true }]);
  });

  it("is never sent at all if it was already gone", async () => {
    const browser = new AbortController();
    browser.abort();
    const res = await call("GET", "api/v1/clubs/overview", { signal: browser.signal });
    expect(res.status).toBe(499);
    await settle();
    expect(seen).toEqual([]);
  });
});
