import "fake-indexeddb/auto";
import * as React from "react";
import { IDBFactory } from "fake-indexeddb";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { toast } from "@moa/ui";

/**
 * The door keeps scanning without signal. A scan the phone could not send is
 * saved in IndexedDB on the phone (a real IndexedDB here, fake-indexeddb, not
 * a stub of the queue), shown as saved rather than admitted, and replayed
 * through the batch route when the signal is back. Every scan carries its own
 * client reference, which is what lets the server admit a guest once however
 * often a batch arrives.
 */
type Sent = { method: string; url: string; body: unknown; key: string | null };
const sent: Sent[] = [];
const KEY = "k-front";
const EVENT = 37;

const ctx = () => ({
  event: {
    id: EVENT, name: "Hack Night 04", code: "HN04", org_name: "Edge AI Club", door_open: true, door_mode: "auto", close_after_minutes: 60,
    spot_registration_checks_in: true, capture_contact_at_gate: false, require_contact_at_gate: false, has_fee: false,
    starts_at: "2026-10-16T13:00:00Z", ticket_example: "MOA-XXXXX-XXXXX", auto_print_badges: false, reprint_policy: "anyone",
  },
  permissions: { check_in: true, walkup: false, merch: false, full: false },
  counters: { registered: 40, checked_in: 12 },
  walkup_roles: ["attendee"],
  doors: [{ id: "d1", name: "Gate A", kind: "door" }],
  expected_door_id: "d1",
  guest_fields: [],
  me: { name: "Vani Rao", kind: "user" },
  has_merch: false,
  has_store: false,
});

const admitted = (name: string) => ({
  outcome: "CHECKED_IN", attendee: { id: `r-${name}`, name, ticket_id: "MOA-1", role: "attendee", has_contact: true, is_paid: true },
  checked_in_at: null, checked_in_by: null, other_event: null, revoked_at: null,
  capture: { ask: false, required: false, reason: "DISABLED" }, replayed: false,
  badge: { auto: false, may_print: false, printed_at: null, policy: "anyone" },
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** What the network does: `signal` false drops every request as a phone without signal would. */
const net = {
  signal: true,
  scan: (): Response => json(200, admitted("Ananya Iyer")),
  batch: (body: { scans: { client_ref: string }[] }): Response =>
    json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: admitted("Ananya Iyer") })) }),
};

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  sent.push({ method, url, body, key: new Headers(init?.headers).get("X-Gate-Key") });
  if (!net.signal) throw new TypeError("Failed to fetch");
  const path = url.split("?")[0]!;
  if (path.endsWith(`/events/${EVENT}/gate/context`)) return json(200, ctx());
  if (path.endsWith(`/events/${EVENT}/gate/scan`)) return net.scan();
  if (path.endsWith(`/events/${EVENT}/gate/scan-batch`)) return net.batch(body);
  return json(404, { message: `unstubbed ${method} ${path}` });
});
vi.stubGlobal("fetch", fetchStub);

// Node's own localStorage shadows jsdom's and has no backing file here; the console reads through a plain one.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

// navigator.onLine is what the queue reads before it replays; the browser flips it with the online/offline events.
let onLine = true;
Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => onLine });
const goOffline = () => {
  onLine = false;
  net.signal = false;
  act(() => void window.dispatchEvent(new Event("offline")));
};
const goOnline = () => {
  onLine = true;
  net.signal = true;
  act(() => void window.dispatchEvent(new Event("online")));
};
afterAll(() => vi.unstubAllGlobals());

const { render } = await import("@/test/render");
const { GateConsole } = await import("./components/gate-console");
const { KEY_STORAGE } = await import("./api");
const { scanQueue } = await import("./lib/queue");
const { useOfflineQueue } = await import("./queries");

beforeEach(() => {
  // A fresh, empty IndexedDB for every test: nothing queued leaks between them.
  vi.stubGlobal("indexedDB", new IDBFactory());
  sent.length = 0;
  store.clear();
  store.set(KEY_STORAGE(EVENT), KEY);
  onLine = true;
  net.signal = true;
  // React Query hears the online/offline events in one manager for the whole file.
  onlineManager.setOnline(true);
  net.scan = () => json(200, admitted("Ananya Iyer"));
  net.batch = (body) => json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: admitted("Ananya Iyer") })) });
  vi.restoreAllMocks();
});

const batches = () => sent.filter((s) => s.method === "POST" && s.url.split("?")[0]!.endsWith("/gate/scan-batch"));
const queued = (ref: string, code: string, at: string, eventId = EVENT) => ({ code, door: "Gate A", scanned_at: at, client_ref: ref, eventId, queuedAt: at });

async function openConsole() {
  render(<GateConsole eventId={EVENT} />);
  return screen.findByLabelText("Or type the ticket code (MOA-XXXXX-XXXXX)");
}
async function scanCode(code: string) {
  fireEvent.change(screen.getByLabelText("Or type the ticket code (MOA-XXXXX-XXXXX)"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Check in" }));
}

describe("the queue on the phone", () => {
  it("keeps each event's scans apart, oldest first, and counts them", async () => {
    await scanQueue.add(queued("b", "MOA-2", "2026-10-16T13:05:00Z"));
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    await scanQueue.add(queued("z", "MOA-9", "2026-10-16T13:02:00Z", 99));
    expect((await scanQueue.all(EVENT)).map((s) => s.client_ref)).toEqual(["a", "b"]);
    expect(await scanQueue.count(EVENT)).toBe(2);
    expect(await scanQueue.count(99)).toBe(1);
  });

  it("holds a scan once however often it is saved, by its client reference", async () => {
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    expect(await scanQueue.count(EVENT)).toBe(1);
  });

  it("forgets only the scans the server answered", async () => {
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    await scanQueue.add(queued("b", "MOA-2", "2026-10-16T13:02:00Z"));
    await scanQueue.remove(["a"]);
    expect((await scanQueue.all(EVENT)).map((s) => s.client_ref)).toEqual(["b"]);
  });
});

describe("scanning without signal", () => {
  it("saves the scan on the phone and says so, never as a server admission", async () => {
    await openConsole();
    goOffline();
    expect(await screen.findByText("No signal")).toBeInTheDocument();

    await scanCode("MOA-1");
    // The outcome card, not the "No signal" banner, which is a status too.
    const card = (await screen.findByText("Queued")).closest<HTMLElement>('[role="status"]')!;
    // In the info tone, never the admit tone of a welcome the server gave.
    expect(card).toHaveAttribute("data-tone", "info");
    expect(within(card).getByText("SAVED ON THIS PHONE · WILL SYNC")).toBeInTheDocument();
    expect(within(card).queryByText("Welcome in")).toBeNull();

    // Saved in IndexedDB with everything the replay needs, for this event.
    const [saved, ...rest] = await scanQueue.all(EVENT);
    expect(rest).toHaveLength(0);
    expect(saved).toMatchObject({ code: "MOA-1", door: "Gate A", eventId: EVENT });
    expect(saved!.client_ref).toMatch(/^\w{8,}$/);
    expect(await screen.findByText("1 waiting")).toBeInTheDocument();
  });

  it("counts every scan waiting, each with its own reference", async () => {
    await openConsole();
    goOffline();
    await scanCode("MOA-1");
    await screen.findByText("1 waiting");
    await scanCode("MOA-2");
    expect(await screen.findByText("2 waiting")).toBeInTheDocument();
    const refs = (await scanQueue.all(EVENT)).map((s) => s.client_ref);
    expect(new Set(refs).size).toBe(2);
  });

  it("never saves a scan the server answered: a refusal is said, not queued", async () => {
    const said = vi.spyOn(toast, "error");
    net.scan = () => json(403, { message: "This door key was revoked" });
    await openConsole();
    await scanCode("MOA-1");
    await waitFor(() => expect(said).toHaveBeenCalledWith("This door key was revoked"));
    expect(await scanQueue.count(EVENT)).toBe(0);
    expect(screen.queryByText("No signal")).toBeNull();
  });
});

describe("back online", () => {
  it("sends what waited through the batch route, with the door key, and empties the queue", async () => {
    await openConsole();
    goOffline();
    await scanCode("MOA-1");
    await screen.findByText("1 waiting");
    const [saved] = await scanQueue.all(EVENT);

    goOnline();
    await waitFor(() => expect(batches()).toHaveLength(1));
    const [batch] = batches();
    expect(batch!.key).toBe(KEY);
    // Exactly the scan as taken: its code, door, time and reference; not the phone's bookkeeping.
    expect(batch!.body).toEqual({ scans: [{ code: "MOA-1", door: "Gate A", scanned_at: saved!.scanned_at, client_ref: saved!.client_ref }] });

    await waitFor(async () => expect(await scanQueue.count(EVENT)).toBe(0));
    await waitFor(() => expect(screen.queryByText("No signal")).toBeNull());
    expect(screen.queryByText(/Syncing/)).toBeNull();
  });

  it("sends scans saved before the console was opened as soon as it opens with signal", async () => {
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    await scanQueue.add(queued("b", "MOA-2", "2026-10-16T13:02:00Z"));
    await openConsole();
    await waitFor(() => expect(batches()).toHaveLength(1));
    expect((batches()[0]!.body as { scans: { client_ref: string }[] }).scans.map((s) => s.client_ref)).toEqual(["a", "b"]);
    await waitFor(async () => expect(await scanQueue.count(EVENT)).toBe(0));
  });

  it("keeps everything for the next try when the replay fails, and says it is syncing", async () => {
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    net.batch = () => json(503, { message: "Upstream unavailable" });
    await openConsole();
    await waitFor(() => expect(batches()).toHaveLength(1));
    expect(await screen.findByText("Syncing 1 saved scan…")).toBeInTheDocument();
    expect(await scanQueue.count(EVENT)).toBe(1);
  });

  it("forgets only what the server answered for, so nothing unanswered is lost", async () => {
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    await scanQueue.add(queued("b", "MOA-2", "2026-10-16T13:02:00Z"));
    net.batch = () => json(200, { results: [{ client_ref: "a", response: admitted("Ananya Iyer") }] });
    await openConsole();
    await waitFor(() => expect(batches()).toHaveLength(1));
    await waitFor(async () => expect((await scanQueue.all(EVENT)).map((s) => s.client_ref)).toEqual(["b"]));
  });

  it("replays in the order scanned, at most 200 to a request", async () => {
    for (let i = 0; i < 201; i++) {
      const at = new Date(Date.UTC(2026, 9, 16, 13, 0, i)).toISOString();
      await scanQueue.add(queued(`ref${String(i).padStart(3, "0")}`, `MOA-${i}`, at));
    }
    await openConsole();
    await waitFor(() => expect(batches()).toHaveLength(2));
    const [first, second] = batches().map((b) => (b.body as { scans: { client_ref: string }[] }).scans.map((s) => s.client_ref));
    expect(first).toHaveLength(200);
    expect(first![0]).toBe("ref000");
    expect(first![199]).toBe("ref199");
    expect(second).toEqual(["ref200"]);
    await waitFor(async () => expect(await scanQueue.count(EVENT)).toBe(0));
  });

  it("replays only this event's scans", async () => {
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    await scanQueue.add(queued("z", "MOA-9", "2026-10-16T13:02:00Z", 99));
    await openConsole();
    await waitFor(() => expect(batches()).toHaveLength(1));
    expect((batches()[0]!.body as { scans: { client_ref: string }[] }).scans.map((s) => s.client_ref)).toEqual(["a"]);
    expect(await scanQueue.count(99)).toBe(1);
  });
});

describe("one replay at a time", () => {
  const fresh = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
  };

  it("sends a batch once when two replays start together (the online event and the timer)", async () => {
    onLine = false;
    net.signal = false;
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    const { result } = renderHook(() => useOfflineQueue(KEY, EVENT), { wrapper: fresh() });
    await waitFor(() => expect(result.current.queued).toBe(1));

    onLine = true;
    net.signal = true;
    await act(async () => {
      await Promise.all([result.current.drain(), result.current.drain()]);
    });
    expect(batches()).toHaveLength(1);
    await waitFor(() => expect(result.current.queued).toBe(0));
  });

  it("does not try while the phone says it is offline", async () => {
    onLine = false;
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    const { result } = renderHook(() => useOfflineQueue(KEY, EVENT), { wrapper: fresh() });
    await waitFor(() => expect(result.current.queued).toBe(1));
    await act(() => result.current.drain());
    expect(batches()).toHaveLength(0);
    expect(result.current.online).toBe(false);
  });
});
