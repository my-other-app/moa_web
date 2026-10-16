import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import type { GateContext, ScanResult } from "./schemas";

const ctx: GateContext = {
  event: {
    id: 37,
    name: "Hack Night 04",
    code: "HN04",
    org_name: "Edge AI Club",
    door_open: true,
    door_mode: "auto",
    close_after_minutes: 60,
    spot_registration_checks_in: true,
    capture_contact_at_gate: false,
    require_contact_at_gate: false,
    has_fee: true,
    starts_at: "2026-10-16T13:00:00Z",
    ticket_example: "MOA-XXXXX-XXXXX",
    auto_print_badges: false,
    reprint_policy: "anyone",
  },
  permissions: { check_in: true, walkup: true, merch: false, full: true },
  counters: { registered: 40, checked_in: 12 },
  walkup_roles: ["attendee", "speaker"],
  doors: [{ id: "d1", name: "Gate A", kind: "door" }],
  expected_door_id: "d1",
  guest_fields: [],
  me: { name: "Vani Rao", kind: "user" },
  has_merch: false,
  has_store: false,
};

const attendee = { id: "r1", name: "Ananya Iyer", ticket_id: "MOA-1", role: "speaker", has_contact: true, is_paid: true };
const result = (over: Partial<ScanResult>): ScanResult => ({
  outcome: "CHECKED_IN",
  attendee,
  checked_in_at: null,
  checked_in_by: null,
  other_event: null,
  revoked_at: null,
  capture: { ask: false, required: false, reason: "DISABLED" },
  replayed: false,
  badge: { auto: false, may_print: false, printed_at: null, policy: "anyone" },
  ...over,
});

const api = vi.hoisted(() => ({
  context: vi.fn(),
  scan: vi.fn(),
  search: vi.fn(),
  byHand: vi.fn(),
  walkup: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    fetchGateContext: api.context,
    scanTicket: api.scan,
    searchGuests: api.search,
    checkInByHand: api.byHand,
    registerWalkup: api.walkup,
  };
});

// Node's own localStorage shadows jsdom's and has no backing file here; the screens read through a plain one.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const { render } = await import("@/test/render");
const { GateConsole } = await import("./components/gate-console");
const { OutcomeCard } = await import("./components/outcome-card");
const { ShelfPicker } = await import("./components/shelf-picker");
const { outcomeCard } = await import("./lib/outcome-copy");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.context.mockResolvedValue(ctx);
});

describe("the outcome card", () => {
  it("paints the verdict in its tone, large, with the name and what to do", () => {
    const onDismiss = vi.fn();
    render(<OutcomeCard card={outcomeCard(result({ outcome: "UNPAID" }), "Gate A")} onDismiss={onDismiss} />);
    const card = screen.getByRole("status");
    expect(card).toHaveAttribute("data-tone", "refuse");
    expect(within(card).getByText("Not paid").parentElement).toHaveClass("bg-refuse");
    expect(within(card).getByText("Ananya Iyer has not paid for this ticket.")).toBeInTheDocument();
    expect(within(card).getByText(/Take the payment at the desk/)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("reads an admission, a repeat and a queued scan in admit, caution and info", () => {
    const { unmount } = render(<OutcomeCard card={outcomeCard(result({}), "Gate A")} onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "admit");
    unmount();
    const again = render(<OutcomeCard card={outcomeCard(result({ outcome: "ALREADY_CHECKED_IN", checked_in_at: new Date().toISOString(), checked_in_by: { name: "Vani", door: "Gate B" } }), "Gate A")} onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "caution");
    expect(screen.getByText("Already scanned by")).toBeInTheDocument();
    again.unmount();
    render(<OutcomeCard card={outcomeCard(result({ attendee: null }), "Gate A", true)} onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "info");
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });
});

describe("the gate console", () => {
  it("keeps the event, the door and the count in view, and opens on the scanner", async () => {
    render(<GateConsole eventId={37} />);
    expect(await screen.findByRole("heading", { name: "Hack Night 04" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Door: Gate A. Change door" })).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("/ 40")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "12 of 40 checked in" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Check-in", "Find", "Walk-up"]);
    expect(screen.getByRole("button", { name: /Start camera/ })).toBeInTheDocument();
    expect(screen.getByText("Full gate access")).toBeInTheDocument();
  });

  it("checks a typed code in and shows the verdict, without waiting for the camera", async () => {
    api.scan.mockResolvedValue(result({ outcome: "WRONG_EVENT", attendee: null, other_event: { name: "Demo Day" } }));
    render(<GateConsole eventId={37} />);
    const field = await screen.findByLabelText("Or type the code under the QR");
    const submit = screen.getByRole("button", { name: "Check in" });
    expect(submit).toBeDisabled();
    fireEvent.change(field, { target: { value: "moa-77" } });
    fireEvent.click(submit);
    expect(await screen.findByText("Wrong event")).toBeInTheDocument();
    expect(screen.getByText("That ticket is for another event.")).toBeInTheDocument();
    expect(api.scan).toHaveBeenCalledWith(null, 37, expect.objectContaining({ code: "moa-77", door: "Gate A" }));
  });

  it("says plainly when the door is shut", async () => {
    api.context.mockResolvedValue({ ...ctx, event: { ...ctx.event, door_open: false, door_mode: "closed" } });
    render(<GateConsole eventId={37} />);
    expect(await screen.findByText("Door shut")).toBeInTheDocument();
    expect(screen.getByText(/The organiser closed the door/)).toBeInTheDocument();
  });

  it("asks a signed-out volunteer to sign in rather than showing a blank console", async () => {
    api.context.mockRejectedValue(new ApiError({ message: "Not signed in", status: 401 }));
    render(<GateConsole eventId={37} />);
    expect(await screen.findByText("Sign in to open this gate")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fgate%2F37");
  });

  it("finds a guest by name and checks them in by hand, and will not admit an unpaid one", async () => {
    api.search.mockResolvedValue([
      { ...attendee, id: "r1", name: "Ananya Iyer", is_paid: true, checked_in_at: null },
      { ...attendee, id: "r2", name: "Ananya Rao", is_paid: false, checked_in_at: null },
      { ...attendee, id: "r3", name: "Ananya Das", is_paid: true, checked_in_at: "2026-10-16T13:05:00Z" },
    ]);
    api.byHand.mockResolvedValue(result({}));
    render(<GateConsole eventId={37} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Find" }));
    fireEvent.change(screen.getByLabelText("Name, email or ticket"), { target: { value: "Ananya" } });
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText("Not paid")).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole("button", { name: "Check in" })).toBeNull();
    expect(within(rows[2]!).getByText(/^In ·/)).toBeInTheDocument();
    fireEvent.click(within(rows[0]!).getByRole("button", { name: "Check in" }));
    expect(await screen.findByText("Welcome in")).toBeInTheDocument();
    expect(api.byHand).toHaveBeenCalledWith(null, 37, "r1", "Gate A");
  });

  it("registers a walk-up, asking for a name first", async () => {
    api.walkup.mockResolvedValue({ outcome: "REGISTERED", attendee: { ...attendee, name: "Devika Menon", role: "attendee" }, duplicate_of: null, duplicate_by: null, checked_in: true, ticket_sent: false });
    render(<GateConsole eventId={37} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Walk-up" }));
    expect(screen.getByText("Take the fee at the desk first.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Register and check in/ }));
    expect(await screen.findByText("Their full name, please.")).toBeInTheDocument();
    expect(api.walkup).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Devika Menon" } });
    fireEvent.click(screen.getByRole("radio", { name: "Speaker" }));
    fireEvent.click(screen.getByRole("button", { name: /Register and check in/ }));
    expect(await screen.findByText("Walk-in")).toBeInTheDocument();
    expect(api.walkup).toHaveBeenCalledWith(null, 37, expect.objectContaining({ name: "Devika Menon", role: "speaker", door: "Gate A" }));
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue(""));
  });
});

describe("the shelf at the desk", () => {
  it("counts up within stock and shows what to take", () => {
    const catalog = { enabled: true, items: [{ id: "kit", name: "Kit", price: 890, left: 1, variants: [] }] };
    let picks = {};
    const { rerender } = render(<ShelfPicker catalog={catalog} picks={picks} onChange={(p) => (picks = p)} />);
    fireEvent.click(screen.getByRole("button", { name: "One more Kit" }));
    rerender(<ShelfPicker catalog={catalog} picks={picks} onChange={(p) => (picks = p)} />);
    expect(screen.getByLabelText("Kit quantity")).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "One more Kit" })).toBeDisabled();
    expect(screen.getByText("Take for merchandise")).toBeInTheDocument();
  });
});
