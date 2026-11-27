import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";

/**
 * Stations and swag desks on the door console (quests contract §7). The
 * console says it knows them (X-Gate-Features: quests) on every call; at a
 * station a scan records a visit (never an admission, never the counter),
 * offline too; at a swag desk a scan shows the guest's rewards to hand over.
 * An entrance next to them behaves exactly as before. The API is the real
 * gate client over a stubbed fetch; the offline queue is a real IndexedDB
 * (fake-indexeddb).
 */
type Sent = { method: string; url: string; body: unknown; features: string | null; key: string | null };
const sent: Sent[] = [];
const EVENT = 37;

const ATTENDEE = { id: "r1", name: "Asha Kumar", ticket_id: "", role: "attendee", email: null, phone: null, has_contact: false, is_paid: true, checked_in_at: null, badge_printed_at: null, admission_no: null, missing_answers: [] };
const base = {
  checked_in_at: null, checked_in_by: null, other_event: null, revoked_at: null,
  capture: { ask: false, required: false, reason: "NOT_ADMITTED" }, replayed: false,
  badge: { auto: false, may_print: false, printed_at: null, policy: "anyone" }, hint: null,
};
const visit = (result: string, extra: Record<string, unknown> = {}) => ({
  ...base,
  outcome: "STATION_VISIT",
  attendee: ATTENDEE,
  station: { door_id: "st1", name: "Google Cloud booth", result, reason: null, visited_at: "2026-11-28T05:12:00Z", task: { id: "t1", title: "Visit the Google Cloud booth", points: 10 }, mode: "points", ...extra },
});
const reward = (over: Record<string, unknown> = {}) => ({
  claim_id: "c1", reward_id: "rw1", milestone: "Tier 1", item_id: "i1", name: "DevFest T-shirt", photo_url: null,
  status: "reserved", needs_size: false, variant_label: "M", choices: [{ label: "S", free: 4 }, { label: "M", free: 9 }], collected_at: null, collected_by: null, door: null, ...over,
});
const desk = (rewards: unknown[], mode = "points") => ({ ...base, outcome: "SWAG_DESK", attendee: ATTENDEE, swag: { door_id: "sd1", name: "Swag desk", enabled: true, mode, points: 40, tasks_done: 5, rewards } });
const admitted = { ...base, outcome: "CHECKED_IN", attendee: { ...ATTENDEE, ticket_id: "MOA-1" }, capture: { ask: false, required: false, reason: "DISABLED" } };

type Ctx = Record<string, unknown>;
const context = (over: Ctx = {}): Ctx => ({
  event: {
    id: EVENT, name: "DevFest 2026", code: "DF26", org_name: "GDG Kochi", door_open: true, door_mode: "auto", close_after_minutes: 60,
    spot_registration_checks_in: true, capture_contact_at_gate: false, require_contact_at_gate: false, has_fee: false,
    starts_at: "2026-11-28T03:30:00Z", ticket_example: "MOA-XXXXX-XXXXX", auto_print_badges: false, reprint_policy: "anyone",
  },
  permissions: { check_in: true, walkup: true, merch: true, full: false },
  counters: { registered: 900, checked_in: 412 },
  walkup_roles: ["attendee"],
  doors: [
    { id: "d1", name: "Gate A", kind: "door", purpose: null },
    { id: "st1", name: "Google Cloud booth", kind: "door", purpose: "station" },
    { id: "sd1", name: "Swag desk", kind: "door", purpose: "swag_desk" },
  ],
  expected_door_id: "d1",
  guest_fields: [],
  me: { name: "Vani Rao", kind: "user" },
  has_merch: false,
  has_store: false,
  quests: { enabled: true, door_purpose: null, door_name: "Gate A", can_hand_over: true },
  ...over,
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const net = {
  signal: true,
  ctx: context(),
  scan: (_body: { door?: string }): Response => json(200, admitted),
  handover: (_body: unknown): Response => json(200, { result: "HANDED_OVER", claim: reward({ status: "collected", collected_at: "2026-11-28T06:02:00Z", door: "Swag desk", collected_by: "Vani Rao" }), remaining: 54 }),
  search: (): Response => json(200, [{ id: "r1", name: "Asha Kumar", ticket_id: "", role: "attendee", has_contact: false, is_paid: true, checked_in_at: "2026-11-28T04:00:00Z" }]),
  // The server's shape: the swag block is its own object, as the scan's answer carries it.
  guest: (): Response => json(200, { attendee: { id: "r1", name: "Asha Kumar" }, swag: { door_id: null, name: null, enabled: true, mode: "points", points: 40, tasks_done: 5, rewards: [reward()] }, stations: [{ door_id: "st1", name: "Google Cloud booth", visited_at: "2026-11-28T05:12:00Z" }] }),
  batch: (body: { scans: { client_ref: string }[] }): Response => json(200, { results: body.scans.map((s) => ({ client_ref: s.client_ref, response: visit("VISITED") })) }),
};

const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  const headers = new Headers(init?.headers);
  sent.push({ method, url, body, features: headers.get("X-Gate-Features"), key: headers.get("X-Gate-Key") });
  if (!net.signal) throw new TypeError("Failed to fetch");
  const path = url.split("?")[0]!;
  if (path.endsWith(`/events/${EVENT}/gate/context`)) return json(200, net.ctx);
  if (path.endsWith(`/events/${EVENT}/gate/scan`)) return net.scan(body);
  if (path.endsWith(`/events/${EVENT}/gate/scan-batch`)) return net.batch(body);
  if (path.endsWith(`/events/${EVENT}/gate/search`)) return net.search();
  if (path.endsWith(`/events/${EVENT}/gate/quests/r1`)) return net.guest();
  if (/\/gate\/quests\/claims\/[^/]+\/handover$/.test(path)) return net.handover(body);
  if (/\/gate\/check-in\/r1$/.test(path)) return net.scan(body);
  return json(404, { message: `unstubbed ${method} ${path}` });
});
vi.stubGlobal("fetch", fetchStub);

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

let onLine = true;
Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => onLine });
const goOffline = () => {
  onLine = false;
  net.signal = false;
  act(() => void window.dispatchEvent(new Event("offline")));
};
afterAll(() => vi.unstubAllGlobals());

const { render } = await import("@/test/render");
const { GateConsole } = await import("./components/gate-console");
const { DOOR_STORAGE } = await import("./api");
const { scanQueue, sameScan } = await import("./lib/queue");
const { withReplayed } = await import("./lib/replay");
const { stationCard, swagDeskCard, outcomeCard } = await import("./lib/outcome-copy");
const { scanResultSchema, gateContextSchema, purposeOf } = await import("./schemas");
const { ReplayReport } = await import("./components/replay-report");

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  sent.length = 0;
  store.clear();
  onLine = true;
  net.signal = true;
  onlineManager.setOnline(true);
  net.ctx = context();
  net.scan = () => json(200, admitted);
});

const field = () => screen.findByLabelText("Or type the ticket code (MOA-XXXXX-XXXXX)");
async function openAt(door: string) {
  store.set(DOOR_STORAGE(EVENT), door);
  render(<GateConsole eventId={EVENT} />);
  return field();
}
async function scan(code: string, button: string) {
  fireEvent.change(await field(), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: button }));
}
const card = async (tag: string) => (await screen.findByText(tag)).closest<HTMLElement>('[role="status"]')!;

describe("what the console says it knows", () => {
  it("asks for stations and swag desks on every gate call, with or without a door link", async () => {
    await openAt("Gate A");
    await scan("MOA-7K3QF-X9PWM", "Check in");
    await screen.findByText("Welcome in");
    const gate = sent.filter((s) => s.url.includes("/gate/"));
    expect(gate.length).toBeGreaterThanOrEqual(2);
    expect(gate.every((s) => s.features === "quests")).toBe(true);
  });

  it("reads a context from a server without quests: every door an entrance, no quest block", () => {
    const old = { ...context(), doors: [{ id: "d1", name: "Gate A", kind: "door" }] } as Record<string, unknown>;
    delete old.quests;
    const parsed = gateContextSchema.parse(old);
    expect(parsed.doors[0]!.purpose ?? null).toBeNull();
    expect(parsed.quests ?? null).toBeNull();
    expect(purposeOf(parsed, "Gate A")).toBeNull();
  });

  it("takes the door's purpose from the picked door, and a door link's from the server", () => {
    const ctx = gateContextSchema.parse(context());
    expect(purposeOf(ctx, "Gate A")).toBeNull();
    expect(purposeOf(ctx, "Google Cloud booth")).toBe("station");
    expect(purposeOf(ctx, "Swag desk")).toBe("swag_desk");
    expect(purposeOf(ctx, "Loading bay")).toBeNull();
    const link = gateContextSchema.parse(context({ me: { name: "Google Cloud booth", kind: "door" }, quests: { enabled: true, door_purpose: "station", door_name: "Google Cloud booth", can_hand_over: false } }));
    expect(purposeOf(link, "Google Cloud booth")).toBe("station");
  });
});

describe("an entrance beside the quest doors", () => {
  it("keeps today's tabs, words and admission", async () => {
    await openAt("Gate A");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Check-in", "Find", "Walk-up"]);
    expect(screen.queryByText(/^Station ·/)).toBeNull();
    await scan("MOA-7K3QF-X9PWM", "Check in");
    const c = await card("Welcome in");
    expect(c).toHaveAttribute("data-tone", "admit");
    expect(sent.find((s) => s.url.endsWith("/gate/scan"))!.body).toMatchObject({ door: "Gate A" });
  });

  it("marks the quest doors in the door picker", async () => {
    await openAt("Gate A");
    fireEvent.click(screen.getByRole("button", { name: "Door: Gate A. Change door" }));
    const picker = await screen.findByRole("radiogroup", { name: "Doors" });
    expect(within(picker).getByRole("radio", { name: /Google Cloud booth/ })).toHaveTextContent("Station");
    // The desk is named "Swag desk" and tagged so.
    expect(within(picker).getAllByText("Swag desk")).toHaveLength(2);
    expect(within(picker).getByRole("radio", { name: /Gate A/ })).not.toHaveTextContent(/Station|Swag desk/);
  });
});

describe("at a station", () => {
  it("records a visit, says so in the admit tone, and leaves the check-in count alone", async () => {
    net.scan = () => json(200, visit("VISITED"));
    await openAt("Google Cloud booth");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Scan", "Find"]);
    expect(screen.getByText("Station · Google Cloud booth")).toBeInTheDocument();
    expect(screen.queryByText(/Door shut/)).toBeNull();
    await scan("MOA-7K3QF-X9PWM", "Record visit");
    const c = await card("Visit recorded");
    expect(c).toHaveAttribute("data-tone", "admit");
    expect(within(c).getByText("Asha Kumar — visit recorded ✓")).toBeInTheDocument();
    expect(within(c).getByText("GOOGLE CLOUD BOOTH · +10 POINTS")).toBeInTheDocument();
    // Name only: no ticket, no contact on the card.
    expect(within(c).queryByText(/MOA-/)).toBeNull();
    expect(sent.find((s) => s.url.endsWith("/gate/scan"))!.body).toMatchObject({ door: "Google Cloud booth" });
    // Nobody came in: the counter never moved.
    expect(screen.getByText("412")).toBeInTheDocument();
  });

  it("says a second visit is already recorded", async () => {
    net.scan = () => json(200, visit("ALREADY_VISITED"));
    await openAt("Google Cloud booth");
    await scan("MOA-7K3QF-X9PWM", "Record visit");
    const c = await card("Already visited");
    expect(c).toHaveAttribute("data-tone", "caution");
    expect(within(c).getByText("Asha Kumar already visited Google Cloud booth.")).toBeInTheDocument();
    expect(within(c).getByText(/One visit per guest counts here/)).toBeInTheDocument();
  });

  it("hides walk-ups and says when quests are off", async () => {
    net.ctx = context({ quests: { enabled: false, door_purpose: null, door_name: null, can_hand_over: true } });
    await openAt("Google Cloud booth");
    expect(screen.queryByRole("tab", { name: /Walk-up/ })).toBeNull();
    expect(screen.getByText(/Quests are off right now: visits are recorded/)).toBeInTheDocument();
  });

  it("saves a visit without signal, refuses the same ticket there again, and never blocks the entrance", async () => {
    await openAt("Google Cloud booth");
    goOffline();
    await scan("MOA-7K3QF-X9PWM", "Record visit");
    const saved = await card("Saved");
    expect(within(saved).getByText("No signal — the visit is saved on this phone.")).toBeInTheDocument();
    const [q] = await scanQueue.all(EVENT);
    expect(q).toMatchObject({ code: "MOA-7K3QF-X9PWM", door: "Google Cloud booth", purpose: "station" });

    await scan("moa-7k3qf-x9pwm", "Record visit");
    const again = await card("Already scanned");
    expect(within(again).getByText(/One visit per guest counts at a station/)).toBeInTheDocument();
    expect(await scanQueue.count(EVENT)).toBe(1);

    // The same ticket at an entrance is an admission, not this visit again.
    const all = await scanQueue.all(EVENT);
    expect(sameScan(all[0]!, "MOA-7K3QF-X9PWM", { door: "Gate A" })).toBe(false);
    expect(sameScan(all[0]!, "MOA-7K3QF-X9PWM", { door: "Google Cloud booth", purpose: "station" })).toBe(true);
    expect(sameScan({ ...all[0]!, purpose: undefined, door: "Gate A" }, "MOA-7K3QF-X9PWM", { door: "Gate B" })).toBe(true);
  });
});

describe("the replay of saved visits", () => {
  const replayed = (outcome: Record<string, unknown>, ref = "a") => ({ client_ref: ref, response: scanResultSchema.parse(outcome) });

  it("counts visits apart, never as a refusal", () => {
    const r = withReplayed(null, [replayed(visit("VISITED"), "a"), replayed(visit("ALREADY_VISITED"), "b")]);
    expect(r).toEqual({ synced: 2, admitted: 0, visits: 2, problems: [] });
    const mixed = withReplayed(r, [replayed(admitted, "c")]);
    expect(mixed).toMatchObject({ synced: 3, admitted: 1, visits: 2, problems: [] });
  });

  it("keeps an entrance's report exactly as it was", () => {
    expect(withReplayed(null, [replayed(admitted)])).toEqual({ synced: 1, admitted: 1, problems: [] });
  });

  it("says what synced", () => {
    const { rerender } = render(<ReplayReport report={{ synced: 2, admitted: 0, visits: 2, problems: [] }} onDismiss={() => {}} />);
    expect(screen.getByText("2 saved scans synced: 2 station visits recorded.")).toBeInTheDocument();
    rerender(<ReplayReport report={{ synced: 3, admitted: 3, problems: [] }} onDismiss={() => {}} />);
    expect(screen.getByText("3 saved scans synced, all checked in.")).toBeInTheDocument();
  });
});

describe("at a swag desk", () => {
  it("shows the rewards held for the guest and records a handover at this desk", async () => {
    net.scan = () => json(200, desk([reward()]));
    let body: unknown = null;
    net.handover = (b) => {
      body = b;
      return json(200, { result: "HANDED_OVER", claim: reward({ status: "collected", collected_at: "2026-11-28T06:02:00Z", door: "Swag desk", collected_by: "Vani Rao" }), remaining: 54 });
    };
    await openAt("Swag desk");
    expect(screen.getByText(/shows the quest rewards the guest unlocked, to hand over/)).toBeInTheDocument();
    await scan("MOA-7K3QF-X9PWM", "Look up");
    const c = await card("Rewards to collect");
    expect(within(c).getByText("Asha Kumar — 1 reward to hand over.")).toBeInTheDocument();
    expect(within(c).getByText("Held for them · size M")).toBeInTheDocument();
    fireEvent.click(within(c).getByRole("button", { name: "Handed over" }));
    await waitFor(() => expect(body).toEqual({ variant_label: null, door: "Swag desk" }));
    expect(await within(c).findByText("Collected")).toBeInTheDocument();
    expect(within(c).getByText(/Collected · \d\d:\d\d · at Swag desk · by Vani Rao/)).toBeInTheDocument();
    // The verdict follows: everything they unlocked is handed over.
    expect(within(c).getByText("Handed over")).toBeInTheDocument();
    expect(within(c).getByText("Asha Kumar has everything they unlocked.")).toBeInTheDocument();
    expect(c).toHaveAttribute("data-tone", "admit");
    expect(screen.getByText("412")).toBeInTheDocument();
  });

  it("asks for the size first when none is chosen, and sends the one tapped", async () => {
    net.scan = () => json(200, desk([reward({ needs_size: true, variant_label: null })]));
    let body: unknown = null;
    net.handover = (b) => ((body = b), json(200, { result: "HANDED_OVER", claim: reward({ status: "collected", variant_label: "S" }), remaining: 3 }));
    await openAt("Swag desk");
    await scan("MOA-7K3QF-X9PWM", "Look up");
    const c = await card("Rewards to collect");
    expect(within(c).getByText("Held for them · no size picked yet")).toBeInTheDocument();
    fireEvent.click(within(c).getByRole("button", { name: "Pick size" }));
    const sizes = within(c).getByRole("group", { name: "Sizes of DevFest T-shirt" });
    fireEvent.click(within(sizes).getByRole("button", { name: /^S/ }));
    await waitFor(() => expect(body).toEqual({ variant_label: "S", door: "Swag desk" }));
  });

  it("says already collected, with when and where", async () => {
    net.scan = () => json(200, desk([reward({ status: "collected", collected_at: "2026-11-28T06:02:00Z", door: "Swag desk", collected_by: "Swag desk" })]));
    await openAt("Swag desk");
    await scan("MOA-7K3QF-X9PWM", "Look up");
    const c = await card("Already collected");
    expect(c).toHaveAttribute("data-tone", "caution");
    expect(within(c).queryByRole("button", { name: "Handed over" })).toBeNull();
  });

  it("offers no handover without the right to hand over", async () => {
    net.ctx = context({ quests: { enabled: true, door_purpose: null, door_name: null, can_hand_over: false } });
    net.scan = () => json(200, desk([reward()]));
    await openAt("Swag desk");
    await scan("MOA-7K3QF-X9PWM", "Look up");
    const c = await card("Rewards to collect");
    expect(within(c).queryByRole("button", { name: "Handed over" })).toBeNull();
    expect(within(c).getByText(/Handing rewards over is for staff with the merch switch on/)).toBeInTheDocument();
  });

  it("saves nothing without signal: a handover needs the server", async () => {
    await openAt("Swag desk");
    goOffline();
    await scan("MOA-7K3QF-X9PWM", "Look up");
    const c = (await screen.findByText("No signal — their rewards can't be looked up.")).closest<HTMLElement>('[role="status"]')!;
    expect(within(c).getByText("NOTHING HANDED OVER · NOT SAVED")).toBeInTheDocument();
    expect(screen.getByText(/Rewards can’t be looked up and nothing can be handed over/)).toBeInTheDocument();
    expect(await scanQueue.count(EVENT)).toBe(0);
  });

  it("finds a guest by name and opens their rewards and the stations they visited", async () => {
    await openAt("Swag desk");
    fireEvent.click(screen.getByRole("tab", { name: /Find/ }));
    fireEvent.change(screen.getByLabelText("Name, email, ticket or admission no."), { target: { value: "Asha" } });
    fireEvent.click(await screen.findByRole("button", { name: "Rewards" }));
    const panel = await screen.findByRole("region", { name: "Their rewards" });
    expect(await within(panel).findByText("DevFest T-shirt")).toBeInTheDocument();
    // Their standing comes from the swag block, not the top level.
    expect(within(panel).getByText(/5 tasks done/)).toBeInTheDocument();
    expect(within(panel).getByText("Visited Google Cloud booth")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Handed over" })).toBeInTheDocument();
  });
});

describe("the words", () => {
  it("say why a visit earns nothing", () => {
    const off = stationCard(scanResultSchema.parse(visit("NOT_COUNTED", { reason: "QUESTS_OFF", task: null })), "Booth");
    expect(off.tone).toBe("accent");
    expect(off.note).toMatch(/Quests are off/);
    expect(stationCard(scanResultSchema.parse(visit("NOT_COUNTED", { reason: "NO_TASK", task: null })), "Booth").note).toMatch(/No quest task names this station/);
    expect(stationCard(scanResultSchema.parse(visit("NOT_COUNTED", { reason: "OUTSIDE_WINDOW", task: null })), "Booth").note).toMatch(/Outside the quest's hours/);
  });

  it("read an unknown station answer as recorded, never as a welcome", () => {
    const odd = scanResultSchema.parse(visit("SOMETHING_NEW"));
    expect(odd.station!.result).toBe("NOT_COUNTED");
    expect(stationCard(odd, "Booth").tone).toBe("accent");
  });

  it("say nothing is unlocked, or that it is sold out or waiting", () => {
    expect(swagDeskCard(scanResultSchema.parse(desk([]))).tag).toBe("Nothing unlocked");
    expect(swagDeskCard(scanResultSchema.parse(desk([reward({ status: "waitlisted", waitlist_position: 3 })]))).tag).toBe("Nothing to hand over");
    // A released claim is not listed at the desk at all.
    expect(scanResultSchema.parse(desk([reward({ status: "released" })])).swag!.rewards).toHaveLength(0);
  });

  it("tell a console from before that a quest door admits nobody", () => {
    const old = outcomeCard(scanResultSchema.parse({ ...base, outcome: "INVALID", attendee: null, hint: "QUEST_STATION" }), "Booth");
    expect(old).toMatchObject({ tone: "refuse", tag: "Station", title: "This door is a station, not an entrance." });
  });
});

describe("tidy-ups after the screenshots", () => {
  it("show a station's points only when the quest scores by points", () => {
    expect(stationCard(scanResultSchema.parse(visit("VISITED")), "Booth").sub).toBe("GOOGLE CLOUD BOOTH · +10 POINTS");
    const ticks = stationCard(scanResultSchema.parse(visit("VISITED", { mode: "checkmarks" })), "Booth");
    expect(ticks.sub).toBe("GOOGLE CLOUD BOOTH");
    expect(ticks.note).toBe("Ticks “Visit the Google Cloud booth” on their quest.");
    // A server that doesn't say how the quest scores: no points either.
    expect(stationCard(scanResultSchema.parse(visit("VISITED", { mode: undefined })), "Booth").sub).toBe("GOOGLE CLOUD BOOTH");
  });

  it("show a guest's points at the swag desk only in points mode", () => {
    expect(swagDeskCard(scanResultSchema.parse(desk([reward()]))).sub).toBe("5 TASKS DONE · 40 POINTS");
    expect(swagDeskCard(scanResultSchema.parse(desk([reward()], "checkmarks"))).sub).toBe("5 TASKS DONE");
  });

  it("say where a reward was collected, and by whom only when a person did it", async () => {
    net.scan = () =>
      json(
        200,
        desk([
          // From a door link: nobody signed in (the server names no one).
          reward({ claim_id: "c1", name: "Sticker pack", status: "collected", collected_at: "2026-11-28T06:02:00Z", door: "Swag desk", collected_by: null }),
          // An older answer that named the desk as the person: still no "by Swag desk".
          reward({ claim_id: "c2", name: "DevFest T-shirt", status: "collected", collected_at: "2026-11-28T06:03:00Z", door: "Swag desk", collected_by: "Swag desk" }),
          reward({ claim_id: "c3", name: "Cloud hoodie", status: "collected", collected_at: "2026-11-28T06:04:00Z", door: "Swag desk", collected_by: "Vani Rao" }),
        ]),
      );
    await openAt("Swag desk");
    await scan("MOA-7K3QF-X9PWM", "Look up");
    const c = await card("Already collected");
    const lines = within(c).getAllByText(/^Collected · /).map((n) => n.textContent);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Collected · \d\d:\d\d · at Swag desk$/);
    expect(lines[1]).toMatch(/^Collected · \d\d:\d\d · at Swag desk$/);
    expect(lines[2]).toMatch(/^Collected · \d\d:\d\d · at Swag desk · by Vani Rao$/);
    expect(within(c).queryByText(/by Swag desk/)).toBeNull();
  });

  it("show points for a guest found by name only in points mode", async () => {
    const before = net.guest;
    const found = (mode: string) => () => json(200, { attendee: { id: "r1", name: "Asha Kumar" }, swag: { door_id: null, name: null, enabled: true, mode, points: 40, tasks_done: 5, rewards: [reward()] }, stations: [] });
    try {
      for (const [mode, line] of [["checkmarks", "5 tasks done"], ["points", "5 tasks done · 40 points"]] as const) {
        net.guest = found(mode);
        store.set(DOOR_STORAGE(EVENT), "Swag desk");
        const { unmount } = render(<GateConsole eventId={EVENT} />);
        fireEvent.click(await screen.findByRole("tab", { name: /Find/ }));
        fireEvent.change(screen.getByLabelText("Name, email, ticket or admission no."), { target: { value: "Asha" } });
        fireEvent.click(await screen.findByRole("button", { name: "Rewards" }));
        const panel = await screen.findByRole("region", { name: "Their rewards" });
        expect(await within(panel).findByText(line)).toBeInTheDocument();
        unmount();
      }
    } finally {
      net.guest = before;
    }
  });
});
