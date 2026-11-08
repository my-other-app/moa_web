import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import type { GateContext, ScanResult } from "./schemas";

/**
 * Missing answers at the door (missing-answers contract §2.5): soft. The
 * guest's card says what they haven't answered whatever happens; a volunteer
 * with check-in permission fills it there and then (types checked, nothing
 * required), and the card keeps whatever is still missing. Their admission
 * never waits on it.
 */
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
    has_fee: false,
    starts_at: "2026-10-16T13:00:00Z",
    ticket_example: "MOA-XXXXX-XXXXX",
    auto_print_badges: false,
    reprint_policy: "anyone",
  },
  permissions: { check_in: true, walkup: true, merch: false, full: true },
  counters: { registered: 40, checked_in: 12 },
  walkup_roles: ["attendee"],
  doors: [{ id: "d1", name: "Gate A", kind: "door" }],
  expected_door_id: "d1",
  guest_fields: [
    { key: "t_shirt_size", label: "T-shirt size", field_type: "select", options: ["S", "M", "L"] },
    { key: "age", label: "Age", field_type: "number" },
  ],
  me: { name: "Vani Rao", kind: "user" },
  has_merch: false,
  has_store: false,
};

const MISSING = [
  { key: "t_shirt_size", label: "T-shirt size" },
  { key: "age", label: "Age" },
];
const attendee = { id: "r1", name: "Ananya Iyer", ticket_id: "MOA-1", role: "attendee", has_contact: true, is_paid: true, missing_answers: MISSING };
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

const api = vi.hoisted(() => ({ context: vi.fn(), scan: vi.fn(), search: vi.fn(), answers: vi.fn() }));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, fetchGateContext: api.context, scanTicket: api.scan, searchGuests: api.search, saveGateAnswers: api.answers };
});

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const { render } = await import("@/test/render");
const { GateConsole } = await import("./components/gate-console");
const { MissingAnswersStrip } = await import("./components/missing-answers-sheet");
const { attendeeSummarySchema, gateAnswersResultSchema, missingOf, scanResultSchema } = await import("./schemas");

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  api.context.mockResolvedValue(ctx);
});

async function scan() {
  render(<GateConsole eventId={37} />);
  fireEvent.change(await screen.findByLabelText("Or type the ticket code (MOA-XXXXX-XXXXX)"), { target: { value: "MOA-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Check in" }));
  return screen.findByRole("group", { name: "Answers Ananya Iyer hasn't given" });
}

describe("the door's payloads", () => {
  it("read what a guest is missing, and nothing from a server without it", () => {
    expect(missingOf(attendeeSummarySchema.parse(attendee))).toEqual(MISSING);
    expect(missingOf(attendeeSummarySchema.parse({ ...attendee, missing_answers: undefined }))).toEqual([]);
    expect(missingOf(scanResultSchema.parse(result({ attendee: { ...attendee, missing_answers: undefined } })).attendee)).toEqual([]);
    expect(gateAnswersResultSchema.parse({ missing_answers: [{ key: "age", label: "Age" }] }).missing_answers).toEqual([{ key: "age", label: "Age" }]);
  });
});

describe("missing answers on the guest card", () => {
  it("says what is missing on the admission, and the volunteer fills it there", async () => {
    api.scan.mockResolvedValue(result({}));
    api.answers.mockResolvedValue({ missing_answers: [{ key: "age", label: "Age" }] });
    const strip = await scan();
    // Admitted either way: the verdict is the welcome.
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "admit");
    expect(strip).toHaveTextContent("2 answers missing: T-shirt size and Age");
    fireEvent.click(within(strip).getByRole("button", { name: "Add them now" }));
    fireEvent.change(within(strip).getByLabelText("T-shirt size"), { target: { value: "M" } });
    fireEvent.click(within(strip).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.answers).toHaveBeenCalledWith(null, 37, "r1", { t_shirt_size: "M" }));
    // What is still missing stays on the card.
    await waitFor(() => expect(strip).toHaveTextContent("1 answer missing: Age"));
  });

  it("says the server's word under an answer it refuses", async () => {
    api.scan.mockResolvedValue(result({}));
    api.answers.mockRejectedValue(new ApiError({ status: 422, message: "Check the answers", errorCode: "INVALID_ANSWERS", fieldErrors: { age: ["Enter a number"] } }));
    const strip = await scan();
    fireEvent.click(within(strip).getByRole("button", { name: "Add them now" }));
    fireEvent.change(within(strip).getByLabelText("Age"), { target: { value: "12" } });
    fireEvent.click(within(strip).getByRole("button", { name: "Save" }));
    expect(await within(strip).findByText("Enter a number")).toBeInTheDocument();
  });

  it("shows it to a volunteer without check-in permission, with nothing to fill", () => {
    render(<MissingAnswersStrip gateKey={null} ctx={{ ...ctx, permissions: { ...ctx.permissions, check_in: false } }} registrationId="r1" name="Ananya Iyer" missing={MISSING} startOpen />);
    const strip = screen.getByRole("group", { name: "Answers Ananya Iyer hasn't given" });
    expect(strip).toHaveTextContent("2 answers missing: T-shirt size and Age");
    expect(strip).toHaveTextContent("Nothing about their admission depends on it.");
    expect(within(strip).queryByRole("button")).toBeNull();
    expect(within(strip).queryByLabelText("Age")).toBeNull();
  });

  it("isn't shown on a refusal", async () => {
    api.scan.mockResolvedValue(result({ outcome: "UNPAID" }));
    render(<GateConsole eventId={37} />);
    fireEvent.change(await screen.findByLabelText("Or type the ticket code (MOA-XXXXX-XXXXX)"), { target: { value: "MOA-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    expect(await screen.findByText("Not paid")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /hasn't given/ })).toBeNull();
  });
});

describe("missing answers in Find", () => {
  it("marks a guest who is missing answers, and opens the fields under them", async () => {
    api.search.mockResolvedValue([{ ...attendee, checked_in_at: null }]);
    api.answers.mockResolvedValue({ missing_answers: [] });
    render(<GateConsole eventId={37} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Find" }));
    fireEvent.change(screen.getByLabelText("Name, email, ticket or admission no."), { target: { value: "Ana" } });
    fireEvent.click(await screen.findByRole("button", { name: "2 answers missing for Ananya Iyer" }));
    const strip = await screen.findByRole("group", { name: "Answers Ananya Iyer hasn't given" });
    fireEvent.change(within(strip).getByLabelText("Age"), { target: { value: "21" } });
    fireEvent.click(within(strip).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.answers).toHaveBeenCalledWith(null, 37, "r1", { age: "21" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Answers Ananya Iyer hasn't given" })).toBeNull());
  });
});
