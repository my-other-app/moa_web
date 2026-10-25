import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@moa/ui";

/**
 * Two things the door does besides admitting: asking a guest for a mobile
 * number when the event wants one, and handing over what they bought in the
 * store. Both go through the gate's own client, so the requests here are the
 * real ones the phone sends — the gateway address, the body, and the door
 * key in its header rather than in the link.
 */
type Sent = { method: string; url: string; body: unknown; key: string | null };
const sent: Sent[] = [];
const KEY = "k-front";

const ctx = (event: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  event: {
    id: 37, name: "Hack Night 04", code: "HN04", org_name: "Edge AI Club", door_open: true, door_mode: "auto", close_after_minutes: 60,
    spot_registration_checks_in: true, capture_contact_at_gate: true, require_contact_at_gate: false, has_fee: true,
    starts_at: "2026-10-16T13:00:00Z", ticket_example: "MOA-XXXXX-XXXXX", auto_print_badges: false, reprint_policy: "anyone", ...event,
  },
  permissions: { check_in: true, walkup: true, merch: true, full: false },
  counters: { registered: 40, checked_in: 12 },
  walkup_roles: ["attendee"],
  doors: [{ id: "d1", name: "Gate A", kind: "door" }],
  expected_door_id: "d1",
  guest_fields: [],
  me: { name: "Vani Rao", kind: "user" },
  has_merch: false,
  has_store: false,
  ...extra,
});

const ANANYA = { id: "r1", name: "Ananya Iyer", ticket_id: "MOA-1", role: "attendee", has_contact: false, is_paid: true };
const scanned = (capture: { ask: boolean; required: boolean; reason: string }) => ({
  outcome: "CHECKED_IN", attendee: ANANYA, checked_in_at: null, checked_in_by: null, other_event: null, revoked_at: null, capture, replayed: false,
  badge: { auto: false, may_print: false, printed_at: null, policy: "anyone" },
});
const ORDER = { id: "o1", guest: "Ananya Iyer", status: "PAID", total: 499, summary: "1 × Club tee (M)", lines: [{ item_name: "Club tee", variant_label: "M", qty: 1, is_free: false }], handed_over_at: null as string | null };

const state = {
  context: ctx() as Record<string, unknown>,
  scan: scanned({ ask: true, required: false, reason: "NO_CONTACT" }) as unknown,
  capture: (): { status: number; body: unknown } => ({ status: 200, body: { phone: "+91 98470 12345", shared_with: [] } }),
  orders: [ORDER] as (typeof ORDER)[],
  handover: (): { status: number; body: unknown } => ({ status: 200, body: { ...ORDER, handed_over_at: "2026-10-16T14:00:00Z" } }),
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/*
 * The gate's client is made once per key and keeps the fetch it was made
 * with, so one stub serves the whole file and each test sets the answers.
 */
const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const key = new Headers(init?.headers).get("X-Gate-Key");
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  sent.push({ method, url, body, key });
  const path = url.split("?")[0]!;
  if (path.endsWith("/events/37/gate/context")) return json(200, state.context);
  if (path.endsWith("/events/37/gate/scan")) return json(200, state.scan);
  if (path.endsWith("/events/37/gate/capture/r1")) {
    const r = state.capture();
    return json(r.status, r.body);
  }
  if (path.endsWith("/events/37/gate/search")) return json(200, [ANANYA]);
  if (path.endsWith("/events/37/gate/merch/r1")) return json(200, { attendee: { id: "r1", name: "Ananya Iyer", ticket_id: "MOA-1", role: "attendee", role_label: "Attendee" }, items: [] });
  if (path.endsWith("/events/37/gate/store/r1")) return json(200, state.orders);
  if (path.endsWith("/events/37/gate/store/o1/handover")) {
    const r = state.handover();
    if (r.status === 200) state.orders = [r.body as typeof ORDER];
    return json(r.status, r.body);
  }
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
afterAll(() => vi.unstubAllGlobals());

const { render } = await import("@/test/render");
const { GateConsole } = await import("./components/gate-console");
const { KEY_STORAGE } = await import("./api");

beforeEach(() => {
  sent.length = 0;
  store.clear();
  // A phone opened from a gate link keeps the key; every call must carry it.
  store.set(KEY_STORAGE(37), KEY);
  state.context = ctx();
  state.scan = scanned({ ask: true, required: false, reason: "NO_CONTACT" });
  state.capture = () => ({ status: 200, body: { phone: "+91 98470 12345", shared_with: [] } });
  state.orders = [ORDER];
  state.handover = () => ({ status: 200, body: { ...ORDER, handed_over_at: "2026-10-16T14:00:00Z" } });
  vi.restoreAllMocks();
});

const posts = (suffix: string) => sent.filter((s) => s.method === "POST" && s.url.split("?")[0]!.endsWith(suffix));

async function admitAnanya() {
  render(<GateConsole eventId={37} />);
  fireEvent.change(await screen.findByLabelText("Or type the ticket code (MOA-XXXXX-XXXXX)"), { target: { value: "MOA-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Check in" }));
  return screen.findByRole("status");
}

describe("collecting a guest's number at the door", () => {
  it("asks after the admission, without blocking it, when the event wants a number", async () => {
    const card = await admitAnanya();
    expect(within(card).getByText("They’re already in — ask if you can")).toBeInTheDocument();
    expect(within(card).getByLabelText("Mobile number")).toBeInTheDocument();
    expect(within(card).getByText(/Skipping is one tap and is never recorded/)).toBeInTheDocument();
    // The admission was already sent and recorded; the sheet sends nothing yet.
    expect(posts("/gate/scan")).toHaveLength(1);
    expect(posts("/gate/capture/r1")).toHaveLength(0);
  });

  it("says the number is required when the event makes it so", async () => {
    state.scan = scanned({ ask: true, required: true, reason: "REQUIRED" });
    const card = await admitAnanya();
    expect(within(card).getByText("A number is required at this door")).toBeInTheDocument();
    // Required or not, Skip is always there.
    expect(within(card).getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  it("does not ask when the event does not want a number", async () => {
    state.scan = scanned({ ask: false, required: false, reason: "DISABLED" });
    const card = await admitAnanya();
    expect(within(card).queryByLabelText("Mobile number")).not.toBeInTheDocument();
  });

  it("saves the number against the guest, with the door key, and says they are reachable", async () => {
    const card = await admitAnanya();
    fireEvent.change(within(card).getByLabelText("Mobile number"), { target: { value: " +91 98470 12345 " } });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved — Ananya Iyer is reachable tonight.")).toBeInTheDocument();
    expect(screen.getByText("+91 98470 12345 · ON THEIR RECORD")).toBeInTheDocument();
    expect(posts("/gate/capture/r1")).toEqual([
      { method: "POST", url: "/api/gateway/api/v1/events/37/gate/capture/r1", body: { phone: "+91 98470 12345" }, key: KEY },
    ]);
    // The key never travels in a link.
    expect(sent.every((s) => !s.url.includes(KEY))).toBe(true);
  });

  it("says who else gave the same number, and saves it anyway", async () => {
    state.capture = () => ({ status: 200, body: { phone: "+91 98470 12345", shared_with: ["Rahul Nair"] } });
    const card = await admitAnanya();
    fireEvent.change(within(card).getByLabelText("Mobile number"), { target: { value: "+91 98470 12345" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Rahul Nair already gave this number. A couple sharing one phone is normal — saved anyway.")).toBeInTheDocument();
  });

  it("catches a number too short to be one before sending it", async () => {
    const card = await admitAnanya();
    fireEvent.change(within(card).getByLabelText("Mobile number"), { target: { value: "98-4" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));
    expect(within(card).getByText(/That number looks too short/)).toBeInTheDocument();
    expect(within(card).getByLabelText("Mobile number")).toHaveAttribute("aria-invalid", "true");
    expect(posts("/gate/capture/r1")).toHaveLength(0);
  });

  it("keeps the sheet and says why when the server will not take the number", async () => {
    const error = vi.spyOn(toast, "error");
    state.capture = () => ({ status: 422, body: { message: "Enter an Indian mobile number" } });
    const card = await admitAnanya();
    fireEvent.change(within(card).getByLabelText("Mobile number"), { target: { value: "+1 415 555 0100" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Enter an Indian mobile number"));
    expect(within(card).getByLabelText("Mobile number")).toHaveValue("+1 415 555 0100");
  });

  it("skips in one tap and records nothing", async () => {
    const card = await admitAnanya();
    fireEvent.click(within(card).getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(screen.queryByLabelText("Mobile number")).not.toBeInTheDocument());
    expect(screen.getByText("Ready for the next guest")).toBeInTheDocument();
    expect(posts("/gate/capture/r1")).toHaveLength(0);
  });
});

describe("handing over a store order at the desk", () => {
  async function findAnanya() {
    render(<GateConsole eventId={37} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Merch" }));
    fireEvent.change(screen.getByLabelText("Find the person"), { target: { value: "Ana" } });
    fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
  }

  it("shows what the guest bought and hands it over, then marks it handed over", async () => {
    state.context = ctx({}, { has_merch: true, has_store: true });
    await findAnanya();
    expect(await screen.findByText("Bought with the ticket")).toBeInTheDocument();
    expect(screen.getByText("1 × Club tee (M)")).toBeInTheDocument();
    expect(screen.getByText("Paid · still to hand over")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hand over" }));
    expect(await screen.findByText("Handed over")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hand over" })).not.toBeInTheDocument();
    expect(posts("/gate/store/o1/handover")).toEqual([
      { method: "POST", url: "/api/gateway/api/v1/events/37/gate/store/o1/handover", body: {}, key: KEY },
    ]);
  });

  it("offers no handover for an order already handed over", async () => {
    state.context = ctx({}, { has_merch: true, has_store: true });
    state.orders = [{ ...ORDER, handed_over_at: "2026-10-16T13:30:00Z" }];
    await findAnanya();
    expect(await screen.findByText("Handed over")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hand over" })).not.toBeInTheDocument();
  });

  it("says why when the handover is refused, and leaves the order to hand over", async () => {
    const error = vi.spyOn(toast, "error");
    state.context = ctx({}, { has_merch: true, has_store: true });
    state.handover = () => ({ status: 409, body: { message: "This order was refunded" } });
    await findAnanya();
    fireEvent.click(await screen.findByRole("button", { name: "Hand over" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("This order was refunded"));
    expect(screen.getByText("Paid · still to hand over")).toBeInTheDocument();
  });

  it("works at an event that only sells, with nothing handed out free", async () => {
    // The console shows the Merch tab for a store alone; the panel must not then say nothing is set up.
    state.context = ctx({}, { has_merch: false, has_store: true });
    await findAnanya();
    expect(await screen.findByText("1 × Club tee (M)")).toBeInTheDocument();
    expect(screen.queryByText("No merchandise set up")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hand over" }));
    expect(await screen.findByText("Handed over")).toBeInTheDocument();
  });

  it("does not ask for store orders at an event without a store", async () => {
    state.context = ctx({}, { has_merch: true, has_store: false });
    await findAnanya();
    await screen.findByText("Nothing is set up for this event.");
    expect(sent.some((s) => s.url.includes("/gate/store/"))).toBe(false);
  });
});
