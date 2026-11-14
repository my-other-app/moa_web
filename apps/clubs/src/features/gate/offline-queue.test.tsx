import "fake-indexeddb/auto";
import * as React from "react";
import { IDBFactory } from "fake-indexeddb";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import type { QueuedScan } from "./lib/queue";

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
const { RETRY_FIRST_MS, RETRY_MAX_MS, askedAgainAt, isDue, scanQueue } = await import("./lib/queue");
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
  it("saves a ticket code on the phone as unverified, for the volunteer to check, never as an admission", async () => {
    await openConsole();
    goOffline();
    expect(await screen.findByText("No signal")).toBeInTheDocument();

    await scanCode("MOA-7K3QF-X9PWM");
    // The outcome card, not the "No signal" banner, which is a status too.
    const card = (await screen.findByText("Unverified")).closest<HTMLElement>('[role="status"]')!;
    // In the caution tone, never the admit tone of a welcome the server gave.
    expect(card).toHaveAttribute("data-tone", "caution");
    expect(within(card).getByText("NOT CHECKED · SAVED ON THIS PHONE · WILL SYNC")).toBeInTheDocument();
    expect(within(card).getByText(/Check their name or ID before letting them in/)).toBeInTheDocument();
    expect(within(card).queryByText("Welcome in")).toBeNull();
    expect(within(card).queryByText(/welcome in|let them in\./i)).toBeNull();

    // Saved in IndexedDB with everything the replay needs, for this event.
    const [saved, ...rest] = await scanQueue.all(EVENT);
    expect(rest).toHaveLength(0);
    expect(saved).toMatchObject({ code: "MOA-7K3QF-X9PWM", door: "Gate A", eventId: EVENT });
    expect(saved!.client_ref).toMatch(/^\w{8,}$/);
    expect(await screen.findByText("1 waiting")).toBeInTheDocument();
  });

  it("counts every scan waiting, each with its own reference", async () => {
    await openConsole();
    goOffline();
    await scanCode("MOA-7K3QF-X9PWM");
    await screen.findByText("1 waiting");
    await scanCode("MOA-3F2A9C-K7QXD");
    expect(await screen.findByText("2 waiting")).toBeInTheDocument();
    const refs = (await scanQueue.all(EVENT)).map((s) => s.client_ref);
    expect(new Set(refs).size).toBe(2);
  });

  it("refuses what cannot be a ticket, and saves nothing", async () => {
    await openConsole();
    goOffline();
    await screen.findByText("No signal");
    for (const junk of ["hello", "https://evil.example/MOA-7K3QF-X9PWM", "MOA-7K3QF-X9PW0", "MOA-7K3QF"]) {
      await scanCode(junk);
      const card = (await screen.findByText("Not recognised")).closest<HTMLElement>('[role="status"]')!;
      expect(card).toHaveAttribute("data-tone", "refuse");
      expect(within(card).getByText("That isn't a ticket code.")).toBeInTheDocument();
      fireEvent.click(within(card).getByRole("button", { name: "Dismiss" }));
    }
    expect(await scanQueue.count(EVENT)).toBe(0);
    expect(screen.getByText("0 waiting")).toBeInTheDocument();
  });

  it("refuses an admission number: it never lets anyone in, and whose it is needs the signal", async () => {
    await openConsole();
    goOffline();
    await screen.findByText("No signal");
    await scanCode("MOA-0042-E123");
    const card = (await screen.findByText("Admission number")).closest<HTMLElement>('[role="status"]')!;
    expect(card).toHaveAttribute("data-tone", "refuse");
    expect(await scanQueue.count(EVENT)).toBe(0);
  });

  it("refuses a ticket already waiting on this phone, in any case, and does not save it again", async () => {
    await openConsole();
    goOffline();
    await scanCode("MOA-7K3QF-X9PWM");
    await screen.findByText("1 waiting");
    await scanCode("moa-7k3qf-x9pwm");
    const card = (await screen.findByText("Already scanned")).closest<HTMLElement>('[role="status"]')!;
    expect(card).toHaveAttribute("data-tone", "refuse");
    expect(within(card).getByText(/^Already scanned on this phone at \d\d:\d\d\.$/)).toBeInTheDocument();
    expect(within(card).getByText(/don't let them in on it/)).toBeInTheDocument();
    expect(await scanQueue.count(EVENT)).toBe(1);
    expect(screen.getByText("1 waiting")).toBeInTheDocument();
  });

  it("still saves a registration id, which the server accepts as a ticket", async () => {
    await openConsole();
    goOffline();
    await scanCode("0b9f6f3e-2c1a-4f7e-9d52-6a1b2c3d4e5f");
    expect(await screen.findByText("Unverified")).toBeInTheDocument();
    expect(await scanQueue.count(EVENT)).toBe(1);
  });

  it("never saves a scan the server answered: a refusal is said, not queued", async () => {
    const said = vi.spyOn(toast, "error");
    net.scan = () => json(403, { message: "This door key was revoked" });
    await openConsole();
    await scanCode("MOA-7K3QF-X9PWM");
    await waitFor(() => expect(said).toHaveBeenCalledWith("This door key was revoked"));
    expect(await scanQueue.count(EVENT)).toBe(0);
    expect(screen.queryByText("No signal")).toBeNull();
  });
});

describe("back online", () => {
  it("sends what waited through the batch route, with the door key, and empties the queue", async () => {
    await openConsole();
    goOffline();
    await scanCode("MOA-7K3QF-X9PWM");
    await screen.findByText("1 waiting");
    const [saved] = await scanQueue.all(EVENT);

    goOnline();
    await waitFor(() => expect(batches()).toHaveLength(1));
    const [batch] = batches();
    expect(batch!.key).toBe(KEY);
    // Exactly the scan as taken: its code, door, time and reference; not the phone's bookkeeping.
    expect(batch!.body).toEqual({ scans: [{ code: "MOA-7K3QF-X9PWM", door: "Gate A", scanned_at: saved!.scanned_at, client_ref: saved!.client_ref }] });

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
    expect(await screen.findByText("1 saved scan still to send. Syncing…")).toBeInTheDocument();
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

describe("what the server said about the saved scans", () => {
  /** A refusal as the server words it, with the guest when it knows whose the ticket is. */
  const refused = (outcome: string, extra: Record<string, unknown> = {}) => ({
    ...admitted("x"), outcome, attendee: null, capture: { ask: false, required: false, reason: "NOT_ADMITTED" }, ...extra,
  });
  const guest = (name: string, ticket: string) => ({ id: `r-${name}`, name, ticket_id: ticket, role: "attendee", has_contact: true, is_paid: true });
  const answers: Record<string, unknown> = {
    a: admitted("Ananya Iyer"),
    b: refused("ALREADY_CHECKED_IN", { attendee: guest("Bala Krishnan", "MOA-BALA0-00002"), checked_in_by: { name: "Vani Rao", door: "Gate B" }, checked_in_at: "2026-10-16T13:00:00Z" }),
    c: refused("WRONG_EVENT", { other_event: { name: "Demo Day", starts_at: null } }),
    d: refused("REVOKED", { attendee: guest("Dev Menon", "MOA-DEVM0-00004"), revoked_at: "2026-10-12T09:00:00Z" }),
    e: refused("UNPAID", { attendee: guest("Esha Paul", "MOA-ESHA0-00005") }),
    f: refused("INVALID"),
    // This very scan was admitted on an earlier try that lost its answer: in, not a problem.
    g: { ...admitted("Gita Rao"), replayed: true },
  };
  const saveAll = async () => {
    const codes: Record<string, string> = { a: "MOA-1", b: "MOA-2", c: "MOA-OTHER-EVENT", d: "MOA-4", e: "MOA-5", f: "MOA-TYPO0-00000", g: "MOA-7" };
    for (const [i, ref] of Object.keys(codes).entries()) await scanQueue.add(queued(ref, codes[ref]!, `2026-10-16T13:0${i}:00Z`));
  };
  const report = () => screen.findByRole("region", { name: "Saved scans that need a look" });
  const item = (list: HTMLElement, text: string) => within(list).getByText(text).closest("li")!;

  beforeEach(() => {
    net.batch = (body) => json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: answers[s.client_ref] })) });
  });

  it("lists every saved scan the server did not admit, by name or ticket, with why; the admitted are only counted", async () => {
    await saveAll();
    await openConsole();
    const region = await report();
    expect(within(region).getByText("5 saved scans need a look")).toBeInTheDocument();
    expect(within(region).getByText(/Checked in: 2 of 7 synced\./)).toBeInTheDocument();
    const list = within(region).getByRole("list", { name: "Not admitted" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);

    const bala = item(list, "Bala Krishnan");
    expect(within(bala).getByText("Already used")).toBeInTheDocument();
    expect(within(bala).getByText("MOA-BALA0-00002")).toBeInTheDocument();
    expect(within(bala).getByText("This ticket was already checked in by Vani Rao at Gate B. Check it was the same person.")).toBeInTheDocument();
    expect(within(bala).getByText(/^Scanned Gate A · \d\d:\d\d$/)).toBeInTheDocument();

    // No guest known: the code as it was scanned.
    const other = item(list, "MOA-OTHER-EVENT");
    expect(within(other).getByText("Wrong event")).toBeInTheDocument();
    expect(within(other).getByText("The ticket is for Demo Day, not this one.")).toBeInTheDocument();
    expect(within(item(list, "Dev Menon")).getByText(/^The ticket was revoked on 12 Oct: cancelled or refunded\.$/)).toBeInTheDocument();
    expect(within(item(list, "Esha Paul")).getByText("Not paid")).toBeInTheDocument();
    expect(within(item(list, "MOA-TYPO0-00000")).getByText("No ticket matches this code.")).toBeInTheDocument();

    // The admitted are not named.
    expect(within(region).queryByText("Ananya Iyer")).toBeNull();
    expect(within(region).queryByText("Gita Rao")).toBeNull();
    await waitFor(async () => expect(await scanQueue.count(EVENT)).toBe(0));
  });

  it("stays until the volunteer has read it", async () => {
    await saveAll();
    await openConsole();
    const region = await report();
    // Still there after the console checks the queue again.
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.getByRole("region", { name: "Saved scans that need a look" })).toBe(region);
    fireEvent.click(within(region).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("region", { name: "Saved scans that need a look" })).toBeNull();
  });

  it("says quietly how many synced when the server admitted every one", async () => {
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    await scanQueue.add(queued("g", "MOA-7", "2026-10-16T13:02:00Z"));
    await openConsole();
    expect(await screen.findByText("2 saved scans synced, all checked in.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Saved scans that need a look" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByText(/saved scans synced/)).toBeNull();
  });

  it("names a scan taken offline in this session once the signal is back", async () => {
    net.batch = (body) => json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: answers.b })) });
    await openConsole();
    goOffline();
    await scanCode("MOA-3F2A9C-K7QXD");
    await screen.findByText("1 waiting");
    goOnline();
    const region = await report();
    expect(within(region).getByText("1 saved scan needs a look")).toBeInTheDocument();
    expect(within(region).getByText("Bala Krishnan")).toBeInTheDocument();
    expect(within(region).getByText(/Checked in: 0 of 1 synced\./)).toBeInTheDocument();
  });

  it("counts across the batches of a long replay", async () => {
    for (let i = 0; i < 201; i++) {
      const at = new Date(Date.UTC(2026, 9, 16, 13, 0, i)).toISOString();
      await scanQueue.add(queued(`ref${String(i).padStart(3, "0")}`, `MOA-${i}`, at));
    }
    net.batch = (body) =>
      json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: s.client_ref === "ref200" ? answers.f : admitted("Someone") })) });
    await openConsole();
    const region = await report();
    await waitFor(() => expect(within(region).getByText(/Checked in: 200 of 201 synced\./)).toBeInTheDocument());
    expect(within(region).getByText("MOA-200")).toBeInTheDocument();
  });
});

describe("a scan the server asks for again", () => {
  /** How the server says it could not record a scan just now: INVALID, with `retry`. */
  const askAgain = { ...admitted("x"), outcome: "INVALID", attendee: null, capture: { ask: false, required: false, reason: "NOT_ADMITTED" }, retry: true };
  const notFound = { ...askAgain, retry: false };
  const fresh = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
  };
  const refs = async () => (await scanQueue.all(EVENT)).map((s) => s.client_ref);
  const sentRefs = () => batches().map((b) => (b.body as { scans: { client_ref: string }[] }).scans.map((s) => s.client_ref));

  it("keeps it on the phone, does not report it, and says it is still to send", async () => {
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    await scanQueue.add(queued("b", "MOA-2", "2026-10-16T13:02:00Z"));
    net.batch = (body) => json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: s.client_ref === "b" ? askAgain : admitted("Ananya Iyer") })) });
    const before = Date.now();
    await openConsole();
    // Only the admitted one is reported; the one asked for again is not "not found".
    expect(await screen.findByText("1 saved scan synced, all checked in.")).toBeInTheDocument();
    expect(screen.queryByText("No ticket matches this code.")).toBeNull();
    await waitFor(async () => expect(await refs()).toEqual(["b"]));
    const [kept] = await scanQueue.all(EVENT);
    expect(kept!.attempts).toBe(1);
    expect(Date.parse(kept!.retryAt!) - before).toBeGreaterThanOrEqual(RETRY_FIRST_MS);
    expect(await screen.findByText("1 saved scan still to send. The server couldn’t record it yet; this phone tries again by itself, so keep this page open.")).toBeInTheDocument();
  });

  it("sends it again only once its wait is over, and forgets it on a final answer", async () => {
    await scanQueue.add(queued("b", "MOA-2", "2026-10-16T13:02:00Z"));
    net.batch = (body) => json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: askAgain })) });
    const { result } = renderHook(() => useOfflineQueue(KEY, EVENT), { wrapper: fresh() });
    await waitFor(() => expect(batches()).toHaveLength(1));
    await waitFor(() => expect(result.current.retrying).toBe(1));
    expect(result.current.queued).toBe(1);

    // Too soon: nothing is sent.
    await act(() => result.current.drain());
    expect(batches()).toHaveLength(1);

    // The wait is over: sent again, and asked for again, it waits twice as long.
    const [first] = await scanQueue.all(EVENT);
    await scanQueue.update([{ ...first!, retryAt: new Date(Date.now() - 1).toISOString() }]);
    const before = Date.now();
    await act(() => result.current.drain());
    expect(batches()).toHaveLength(2);
    const [second] = await scanQueue.all(EVENT);
    expect(second!.attempts).toBe(2);
    expect(Date.parse(second!.retryAt!) - before).toBeGreaterThanOrEqual(2 * RETRY_FIRST_MS);

    // Now the server records it: gone from the phone, and reported.
    const drained = vi.fn();
    const { result: again } = renderHook(() => useOfflineQueue(KEY, EVENT, drained), { wrapper: fresh() });
    await scanQueue.update([{ ...second!, retryAt: new Date(Date.now() - 1).toISOString() }]);
    net.batch = (body) => json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: admitted("Bala Krishnan") })) });
    await act(() => again.current.drain());
    await waitFor(() => expect(again.current.queued).toBe(0));
    expect(drained).toHaveBeenCalledWith([expect.objectContaining({ client_ref: "b", response: expect.objectContaining({ outcome: "CHECKED_IN" }) })]);
    expect(sentRefs().flat().every((r) => r === "b")).toBe(true);
  });

  it("still forgets a real refusal at once", async () => {
    await scanQueue.add(queued("f", "MOA-TYPO0-00000", "2026-10-16T13:01:00Z"));
    net.batch = (body) => json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: notFound })) });
    await openConsole();
    const region = await screen.findByRole("region", { name: "Saved scans that need a look" });
    expect(within(region).getByText("No ticket matches this code.")).toBeInTheDocument();
    await waitFor(async () => expect(await scanQueue.count(EVENT)).toBe(0));
  });

  it("reads the ask beside the answer too", async () => {
    await scanQueue.add(queued("b", "MOA-2", "2026-10-16T13:02:00Z"));
    net.batch = (body) => json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: notFound, retry: true })) });
    const { result } = renderHook(() => useOfflineQueue(KEY, EVENT), { wrapper: fresh() });
    await waitFor(() => expect(result.current.retrying).toBe(1));
    expect(await refs()).toEqual(["b"]);
  });

  it("with an API from before (no retry field), treats every answer it can read as final, as before", async () => {
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    await scanQueue.add(queued("b", "MOA-2", "2026-10-16T13:02:00Z"));
    // Today's answer to a scan that failed on the server's side: INVALID, no retry.
    const { retry: _, ...before } = askAgain;
    void _;
    net.batch = (body) => json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: s.client_ref === "b" ? { ...before, error: "boom" } : admitted("Ananya Iyer") })) });
    await openConsole();
    await screen.findByRole("region", { name: "Saved scans that need a look" });
    await waitFor(async () => expect(await scanQueue.count(EVENT)).toBe(0));
  });

  it("keeps a scan whose answer it cannot read, or that has no answer, and ignores answers for scans it did not send", async () => {
    await scanQueue.add(queued("a", "MOA-1", "2026-10-16T13:01:00Z"));
    await scanQueue.add(queued("b", "MOA-2", "2026-10-16T13:02:00Z"));
    await scanQueue.add(queued("c", "MOA-3", "2026-10-16T13:03:00Z"));
    // Asked for again earlier and still waiting: not in this batch.
    await scanQueue.add({ ...queued("q", "MOA-9", "2026-10-16T13:04:00Z"), attempts: 1, retryAt: new Date(Date.now() + 60_000).toISOString() });
    net.batch = () =>
      json(200, {
        results: [
          { client_ref: "a", response: admitted("Ananya Iyer") },
          // An outcome this console does not know: not an answer it can act on.
          { client_ref: "b", response: { ...notFound, outcome: "ERROR" } },
          // No answer for c at all; and one for q, which was not sent.
          { client_ref: "q", response: admitted("Someone") },
        ],
      });
    const { result } = renderHook(() => useOfflineQueue(KEY, EVENT), { wrapper: fresh() });
    await waitFor(() => expect(batches()).toHaveLength(1));
    expect(sentRefs()).toEqual([["a", "b", "c"]]);
    await waitFor(async () => expect(await refs()).toEqual(["b", "c", "q"]));
    // b and c were not asked for again: they go with the next tick, no wait.
    const all = await scanQueue.all(EVENT);
    expect(all.filter((s) => s.retryAt).map((s) => s.client_ref)).toEqual(["q"]);
    await waitFor(() => expect(result.current.queued).toBe(3));
    expect(result.current.retrying).toBe(1);
  });

  it("says how many of those still to send the server asked for again", async () => {
    await scanQueue.add({ ...queued("a", "MOA-1", "2026-10-16T13:01:00Z"), attempts: 2, retryAt: new Date(Date.now() + 60_000).toISOString() });
    await scanQueue.add(queued("b", "MOA-2", "2026-10-16T13:02:00Z"));
    net.batch = () => json(503, { message: "Upstream unavailable" });
    await openConsole();
    expect(await screen.findByText("2 saved scans still to send. The server couldn’t record 1 of them yet; this phone tries again by itself, so keep this page open.")).toBeInTheDocument();
  });

  it("waits 15 s after the first ask, twice as long after each next one, at most 5 minutes", () => {
    const now = Date.UTC(2026, 10, 28, 9, 0, 0);
    let scan: QueuedScan = queued("a", "MOA-1", "2026-11-28T09:00:00Z");
    expect(isDue(scan, now)).toBe(true);
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      scan = askedAgainAt(scan, now);
      waits.push(Date.parse(scan.retryAt!) - now);
    }
    expect(waits).toEqual([15_000, 30_000, 60_000, 120_000, 240_000, RETRY_MAX_MS, RETRY_MAX_MS]);
    expect(scan.attempts).toBe(7);
    expect(isDue(scan, now)).toBe(false);
    expect(isDue(scan, now + RETRY_MAX_MS)).toBe(true);
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
