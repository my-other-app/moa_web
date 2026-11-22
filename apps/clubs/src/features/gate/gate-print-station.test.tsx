import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@moa/api";

import type { GateContext, ScanResult } from "./schemas";

const ctx: GateContext = {
  event: { id: 37, name: "DevFest", code: "DF", org_name: "GDG", door_open: true, door_mode: "auto", close_after_minutes: 60, spot_registration_checks_in: true, capture_contact_at_gate: false, require_contact_at_gate: false, has_fee: false, starts_at: null, ticket_example: "MOA-XXXXX-XXXXX", auto_print_badges: false, reprint_policy: "anyone" },
  permissions: { check_in: true, walkup: false, merch: false, full: true },
  counters: { registered: 40, checked_in: 12 },
  walkup_roles: [],
  doors: [{ id: "d1", name: "Gate A", kind: "door" }],
  expected_door_id: "d1",
  guest_fields: [],
  me: { name: "Vani Rao", kind: "user" },
  has_merch: false,
  has_store: false,
  printers: { online: 1 },
};
const attendee = { id: "r1", name: "Ananya Iyer", ticket_id: "MOA-1", role: "attendee", has_contact: true, is_paid: true };
const admitted: ScanResult = {
  outcome: "CHECKED_IN",
  attendee,
  checked_in_at: null,
  checked_in_by: null,
  other_event: null,
  revoked_at: null,
  capture: { ask: false, required: false, reason: "DISABLED" },
  replayed: false,
  badge: { auto: false, may_print: true, printed_at: null, policy: "anyone" },
};
const sent = { id: "pr1", registration_id: "r1", name: "Ananya Iyer", ticket_code: "MOA-1", source: "door", status: "queued", attempts: 0, printer: null, error: null, created_at: null, printed_at: null, position: 1 };

const api = vi.hoisted(() => ({ context: vi.fn(), scan: vi.fn(), search: vi.fn(), send: vi.fn() }));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, fetchGateContext: api.context, scanTicket: api.scan, searchGuests: api.search, sendCardToPrinter: api.send };
});
const frames = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("@/features/idcards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/idcards")>();
  return { ...actual, PrintFrame: ({ url }: { url: string }) => (frames.urls.push(url), null) };
});

const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() });

const { render } = await import("@/test/render");
const { GateConsole } = await import("./components/gate-console");

async function scanOne() {
  render(<GateConsole eventId={37} />);
  fireEvent.change(await screen.findByLabelText("Or type the ticket code (MOA-XXXXX-XXXXX)"), { target: { value: "MOA-ABCDE-23456" } });
  fireEvent.click(screen.getByRole("button", { name: "Check in" }));
  await screen.findByText("Welcome in");
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  frames.urls.length = 0;
  api.context.mockResolvedValue(ctx);
  api.scan.mockResolvedValue(admitted);
  api.send.mockResolvedValue(sent);
});

describe("the door console with a print station online", () => {
  it("asks where to print their card, and sends it to the station by default", async () => {
    await scanOne();
    fireEvent.click(screen.getByRole("button", { name: /Print their card/ }));
    expect(await screen.findByRole("heading", { name: /Print Ananya Iyer.s ID card/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send to the print station" }));
    await waitFor(() => expect(api.send).toHaveBeenCalledWith(null, 37, "r1", false));
    expect(frames.urls).toEqual([]);
  });

  it("keeps printing on this screen as the other choice", async () => {
    await scanOne();
    fireEvent.click(screen.getByRole("button", { name: /Print their card/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Print on this computer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(frames.urls).toEqual(["/api/gateway/api/v1/events/37/idcards/r1.pdf?source=manual&record=true&door=Gate+A"]);
    expect(api.send).not.toHaveBeenCalled();
  });

  it("lets an organiser confirm an override when the rule refuses", async () => {
    api.send.mockRejectedValueOnce(new ApiError({ message: "Only an organiser may print a second card.", status: 409, errorCode: "REPRINT_NOT_ALLOWED" })).mockResolvedValue(sent);
    await scanOne();
    fireEvent.click(screen.getByRole("button", { name: /Print their card/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to the print station" }));
    fireEvent.click(await screen.findByRole("button", { name: /Print it again anyway/ }));
    await waitFor(() => expect(api.send).toHaveBeenLastCalledWith(null, 37, "r1", true));
  });
});

describe("the door console with no print station online", () => {
  it("prints on this screen straight away, as before", async () => {
    api.context.mockResolvedValue({ ...ctx, printers: { online: 0 } });
    await scanOne();
    fireEvent.click(screen.getByRole("button", { name: /Print their card/ }));
    expect(screen.queryByRole("heading", { name: /ID card/ })).toBeNull();
    expect(frames.urls).toEqual(["/api/gateway/api/v1/events/37/idcards/r1.pdf?source=manual&record=true&door=Gate+A"]);
    expect(api.send).not.toHaveBeenCalled();
  });
});
