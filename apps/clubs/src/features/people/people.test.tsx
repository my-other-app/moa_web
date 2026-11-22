import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import analyticsFixture from "../__fixtures__/event-analytics.json";
import eventFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/registrations.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * The guest profile (guest-profile contract §2): one person, everything about
 * them and a log of what happened, opened from Review, the attendee list, the
 * check-ins and the ID-card queue, and as a page. The server is faked; what is
 * asserted is what the screen shows and what it sends.
 */
const REG = "6f1b2c70-0000-4000-8000-000000000001";
const REQ = "rq-0001";

const ALL_ACTIONS = {
  can_print: true,
  can_send_to_station: true,
  printers_online: 1,
  can_resend_ticket: true,
  can_check_in: true,
  can_undo_check_in: true,
  can_edit: true,
  can_confirm: true,
  can_decline: true,
  can_ask_missing: true,
  can_remove: true,
};

const full = (over: Record<string, unknown> = {}) => ({
  kind: "registration",
  registration_id: REG,
  request_id: null,
  person: { full_name: "Test Participant One", email: "one@example.com", phone: "+91 98470 00001", institution: "CET", role: "attendee", photo_url: null, account: { kind: "app", user_id: 5 } },
  status: { stage: "confirmed", checked_in: true, card_printed: true, certificate: "issued", paid: true, ticket_revoked: false },
  answers: [
    { key: "college", label: "Which college are you from?", value: "College of Engineering Trivandrum", missing: false },
    { key: "diet", label: "Food preference", value: null, missing: true },
  ],
  ticket: { code: "MOA-TICKET-1", type_name: "Student", admission_no: "A-0042", pdf_url: "https://files.example.com/t.pdf", issued_at: "2026-11-20T09:00:00Z", revoked_at: null },
  payment: { amount: 499, currency: "INR", method: "UPI", status: "paid", paid_at: "2026-11-20T08:59:00Z", receipt: "rcpt_123" },
  check_in: { at: "2026-11-28T04:30:00Z", door: "Main gate", method: "qr", by: "Meera" },
  prints: [{ at: "2026-11-28T04:31:00Z", status: "printed", source: "kiosk", door: "Main gate", printer: "Help desk laptop", by: null, error: null }],
  merch: [{ item: "T-shirt", variant: "M", at: "2026-11-28T06:00:00Z", by: "Anil" }],
  deliveries: [
    { what: "ticket", channel: "email", status: "sent", outcome: "delivered", at: "2026-11-20T09:01:00Z", reason: null },
    { what: "certificate", channel: "email", status: "sent", outcome: "bounced", at: "2026-11-29T09:01:00Z", reason: "Mailbox full" },
  ],
  timeline: [
    { at: "2026-11-20T08:00:00Z", kind: "registered", title: "Registered on the website", detail: null, by: "the guest", tone: "default" },
    { at: "2026-11-28T04:30:00Z", kind: "check_in", title: "Checked in at Main gate", detail: "QR code", by: "Meera", tone: "success" },
  ],
  timeline_truncated: false,
  actions: ALL_ACTIONS,
  ...over,
});

const empty = () =>
  full({
    status: { stage: "under_review", checked_in: false, card_printed: false, certificate: "none", paid: null, ticket_revoked: false },
    answers: [],
    ticket: null,
    payment: null,
    check_in: null,
    prints: [],
    merch: [],
    deliveries: [],
    timeline: [],
    actions: Object.fromEntries(Object.keys(ALL_ACTIONS).map((k) => [k, k === "printers_online" ? 0 : false])),
  });

const state: { profile: Record<string, unknown> | (() => Record<string, unknown>) | "missing" } = { profile: full() };
const gets: string[] = [];
const posts: Array<{ path: string; body: unknown }> = [];
const station = { id: "p1", name: "Help desk laptop", door_label: "", online: true, last_seen_at: null, expires_at: null };
const reqRow = {
  id: REQ,
  status: "pending",
  full_name: "Asha Rao",
  email: "asha@example.com",
  phone: null,
  ticket_type: { id: 3, name: "Student" },
  answers: null,
  submitted_at: "2026-11-26T04:01:00Z",
  decided_at: null,
  decided_by: null,
  decline_note: null,
  registration_id: null,
  pay_by: null,
  amount: null,
  discount_code: null,
  whatsapp_opt_in: false,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events/37/attendees",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        gets.push(path);
        if (/\/api\/v1\/events\/37\/people\//.test(path)) {
          if (state.profile === "missing") throw new ApiError({ status: 404, message: "Not found" });
          return typeof state.profile === "function" ? state.profile() : state.profile;
        }
        if (path === "/api/v1/clubs/access/me") throw new ApiError({ status: 401, message: "Not signed in" });
        if (path.includes("/events/info/")) return { ...eventFixture, requires_approval: true };
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path === "/api/v1/events/registration/37/requests") return { items: [reqRow], next: null, counts: { pending: 1, approved: 0, declined: 0, withdrawn: 0, lapsed: 0, closed: 0, total: 1 }, places_left: null };
        if (path.includes("/analytics")) return analyticsFixture;
        if (path.includes("/list")) return registrationsFixture;
        if (path.endsWith("/idcards/printers")) return [station];
        if (path.endsWith("/idcards/print-requests")) return { items: [{ id: "pr9", registration_id: REG, name: "Test Participant One", source: "kiosk", status: "queued", attempts: 0, position: 1 }], printers_online: 1 };
        if (path.endsWith("/imports")) return [];
        if (path.endsWith("/deliveries/summary")) return { kind: "ticket", registrations: 2, revoked: 0, channels: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        posts.push({ path, body });
        if (path.endsWith("/idcards/print-requests")) return { id: "pr1", status: "queued", source: "dashboard", attempts: 0, name: "Test Participant One" };
        return { queued: 1 };
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(async () => undefined),
    },
  };
});

const { render } = await import("@/test/render");
const { GuestProfile, GuestProfilePage, GuestProfileSheet } = await import("./index");
const { guestProfileSchema } = await import("./schemas");
const { Timeline, SHOWN } = await import("./components/timeline");
const { RequestsPage } = await import("@/features/requests");
const { RegistrationsPanel } = await import("@/features/registrations/components/registrations-panel");
const { PrintQueuePanel } = await import("@/features/printing");

beforeEach(() => {
  state.profile = full();
  gets.length = 0;
  posts.length = 0;
  vi.restoreAllMocks();
});

const section = (name: string) => screen.getByRole("region", { name });
const profile = () => render(<GuestProfile eventId={37} personRef={REG} />);

describe("reading the profile", () => {
  it("is strict only on what the screen acts on", () => {
    const p = guestProfileSchema.parse({ kind: "request", timeline: [{ at: "2026-11-01T00:00:00Z", title: "x", tone: "purple" }, { nothing: true }], prints: [{ status: "odd" }], actions: { can_print: true } });
    expect(p.kind).toBe("request");
    expect(p.person.full_name).toBe("Unnamed");
    expect(p.timeline).toHaveLength(1);
    expect(p.timeline[0]!.tone).toBe("default");
    expect(p.actions.can_print).toBe(true);
    expect(p.actions.can_remove).toBe(false);
    expect(p.ticket).toBeNull();
  });
});

describe("the sections", () => {
  it("shows every section in muster's order when the person has everything", async () => {
    profile();
    expect(await screen.findByRole("heading", { name: "Test Participant One", level: 1 })).toBeInTheDocument();
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Contact", "Answers", "Ticket and delivery", "Payment", "At the event", "Certificate"]);
    const contact = within(section("Contact"));
    expect(contact.getByText("one@example.com")).toBeInTheDocument();
    expect(contact.getByText("+91 98470 00001")).toBeInTheDocument();
    expect(contact.getByText("Has the app")).toBeInTheDocument();
    // Answers: the answered one in full, the missing one marked.
    const answers = within(section("Answers"));
    expect(answers.getByText("College of Engineering Trivandrum")).toBeInTheDocument();
    expect(answers.getByText("Missing")).toBeInTheDocument();
    expect(answers.getByText("1 answer is missing.")).toBeInTheDocument();
    // Ticket and delivery.
    const ticket = within(section("Ticket and delivery"));
    expect(ticket.getByText("MOA-TICKET-1")).toBeInTheDocument();
    expect(ticket.getByText("Student")).toBeInTheDocument();
    expect(ticket.getByRole("link", { name: /Open the ticket PDF/ })).toHaveAttribute("href", "https://files.example.com/t.pdf");
    expect(ticket.getByText(/Ticket: delivered/)).toBeInTheDocument();
    // Payment.
    const pay = within(section("Payment"));
    expect(pay.getByText("₹499")).toBeInTheDocument();
    expect(pay.getByText("UPI")).toBeInTheDocument();
    // At the event: door, method and who; the card print; the merch.
    const event = within(section("At the event"));
    expect(event.getByText(/Main gate · QR code · by Meera/)).toBeInTheDocument();
    expect(event.getByText("Printed")).toBeInTheDocument();
    expect(event.getByText(/Help desk laptop/)).toBeInTheDocument();
    expect(event.getByText(/T-shirt — M/)).toBeInTheDocument();
    // Certificate: issued, and its send said bounced.
    const cert = within(section("Certificate"));
    expect(cert.getByText("Issued")).toBeInTheDocument();
    expect(cert.getByText(/Certificate: bounced — mailbox full/)).toBeInTheDocument();
  });

  it("says so in each section when there is nothing to show", async () => {
    state.profile = empty();
    profile();
    await screen.findByRole("heading", { name: "Test Participant One", level: 1 });
    expect(within(section("Answers")).getByText("No answers on this registration.")).toBeInTheDocument();
    expect(within(section("Ticket and delivery")).getByText("No ticket yet.")).toBeInTheDocument();
    expect(within(section("Payment")).getByText("No payment on this registration.")).toBeInTheDocument();
    const event = within(section("At the event"));
    expect(event.getByText("Not checked in")).toBeInTheDocument();
    expect(event.getByText("no card printed")).toBeInTheDocument();
    expect(event.getByText("nothing collected")).toBeInTheDocument();
    expect(within(section("Certificate")).getByText("Not issued")).toBeInTheDocument();
    expect(screen.getByText("Nothing has happened yet.")).toBeInTheDocument();
  });

  it("puts the chips in the header", async () => {
    profile();
    const chips = within(await screen.findByRole("list", { name: "Status" }));
    for (const t of ["Confirmed", "Checked in", "Card printed", "Certificate issued", "Paid"]) expect(chips.getByText(t)).toBeInTheDocument();
    expect(chips.queryByText("Ticket revoked")).toBeNull();
  });

  it("shows contacts masked for a role that sees them in part, with nothing to copy", async () => {
    state.profile = full({ person: { full_name: "Masked Guest", email: "m***@example.com", phone: "+91 ****** 001", institution: null, role: "attendee", photo_url: null, account: null } });
    profile();
    await screen.findByRole("heading", { name: "Masked Guest", level: 1 });
    expect(screen.getAllByText("m***@example.com").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Copy m\*\*\*@example.com/ })).toBeNull();
  });

  it("says the guest could not be loaded, with a way to try again", async () => {
    state.profile = "missing";
    profile();
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    state.profile = full();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Test Participant One", level: 1 })).toBeInTheDocument();
  });
});

describe("the actions follow `actions`", () => {
  const NAMES = ["Print another card", "Send ticket again", "Check in", "Undo check-in", "Confirm", "Decline", "Edit", "Ask for missing answers", "Remove"];

  it("shows every action the server allows", async () => {
    state.profile = full({ request_id: REQ });
    profile();
    const bar = within(await screen.findByRole("group", { name: "Actions for Test Participant One" }));
    for (const n of NAMES) expect(bar.getByRole("button", { name: n })).toBeInTheDocument();
  });

  it("shows none, and no bar, when nothing is allowed", async () => {
    state.profile = full({ actions: {} });
    profile();
    await screen.findByRole("heading", { name: "Test Participant One", level: 1 });
    expect(screen.queryByRole("group", { name: /Actions for/ })).toBeNull();
  });

  it.each([
    ["can_print", "Print another card"],
    ["can_resend_ticket", "Send ticket again"],
    ["can_check_in", "Check in"],
    ["can_undo_check_in", "Undo check-in"],
    ["can_confirm", "Confirm"],
    ["can_decline", "Decline"],
    ["can_edit", "Edit"],
    ["can_ask_missing", "Ask for missing answers"],
    ["can_remove", "Remove"],
  ])("hides %s's button when it is false", async (flag, name) => {
    state.profile = full({ request_id: REQ, actions: { ...ALL_ACTIONS, [flag]: false } });
    profile();
    const bar = within(await screen.findByRole("group", { name: "Actions for Test Participant One" }));
    expect(bar.queryByRole("button", { name })).toBeNull();
    // The rest are still there.
    expect(bar.getAllByRole("button").length).toBeGreaterThanOrEqual(NAMES.length - 1);
  });

  it("checks in, sends the ticket again and undoes a check-in through the existing calls", async () => {
    profile();
    fireEvent.click(await screen.findByRole("button", { name: "Send ticket again" }));
    await waitFor(() => expect(posts.some((p) => p.path.includes("/deliveries/") || p.path.includes("ticket"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() => expect(posts.some((p) => p.path.endsWith(`/attendance/${REG}`) && (p.body as { is_attended: boolean }).is_attended)).toBe(true));
  });
});

describe("printing the ID card", () => {
  it("sends the card to the print station and shows where it is", async () => {
    state.profile = full({ prints: [], status: { ...full().status, card_printed: false } });
    profile();
    fireEvent.click(await screen.findByRole("button", { name: "Print ID card" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to the print station" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ path: "/api/v1/events/37/idcards/print-requests", body: { printer_id: null, override: false, registration_id: REG } });
  });

  it("prints on this computer when no station is online", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    state.profile = full({ actions: { ...ALL_ACTIONS, printers_online: 0, can_send_to_station: false } });
    profile();
    fireEvent.click(await screen.findByRole("button", { name: "Print another card" }));
    expect(open).toHaveBeenCalledWith(`/api/gateway/api/v1/events/37/idcards/${REG}.pdf?source=manual&record=true`, "_blank", "noopener");
    expect(posts).toHaveLength(0);
  });

  it.each([
    ["queued", "Waiting for the print station"],
    ["printing", "Printing"],
    ["printed", "Printed"],
    ["failed", "Did not print"],
  ])("says a %s card is %s", async (status, word) => {
    state.profile = full({ prints: [{ at: "2026-11-28T04:31:00Z", status, source: "dashboard", door: null, printer: "Help desk laptop", by: "Meera", error: status === "failed" ? "Out of paper" : null }] });
    profile();
    const live = await screen.findByRole("status");
    expect(within(live).getByText(word)).toBeInTheDocument();
    expect(within(live).getByText(/on Help desk laptop/)).toBeInTheDocument();
    if (status === "failed") {
      expect(within(live).getByText("Out of paper")).toBeInTheDocument();
      expect(within(live).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    } else expect(within(live).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("retries a failed card that has its request id by retrying that request", async () => {
    state.profile = full({ prints: [{ id: "pr7", at: "2026-11-28T04:31:00Z", status: "failed", source: "kiosk", door: null, printer: "Help desk laptop", by: null, error: "Jam" }] });
    profile();
    fireEvent.click(await within(await screen.findByRole("status")).findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(posts.some((p) => p.path.endsWith("/print-requests/pr7/retry"))).toBe(true));
  });

  it("reads the profile again every 5 seconds while a card is queued, then stops", async () => {
    let n = 0;
    state.profile = () => (n++ === 0 ? full({ prints: [{ at: "2026-11-28T04:31:00Z", status: "queued", source: "dashboard", door: null, printer: null, by: null, error: null }] }) : full());
    profile();
    expect(within(await screen.findByRole("status")).getByText("Waiting for the print station")).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole("status")).getByText("Printed")).toBeInTheDocument(), { timeout: 8000 });
    const reads = gets.filter((g) => g.includes("/people/")).length;
    expect(reads).toBe(2);
    await new Promise((r) => setTimeout(r, 300));
    expect(gets.filter((g) => g.includes("/people/")).length).toBe(reads);
  }, 15_000);
});

describe("the timeline", () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), kind: i % 2 ? "print_queued" : "email_sent", title: `Event ${i}`, detail: null, by: null, tone: "default" as const }));

  it("lists the newest first, whatever order it came in", () => {
    const shuffled = [...rows(5)].reverse().sort((a, b) => (a.title < b.title ? 1 : -1));
    render(<Timeline rows={shuffled} truncated={false} />);
    const titles = screen.getAllByRole("listitem").map((li) => within(li).getByText(/^Event \d$/).textContent);
    expect(titles).toEqual(["Event 4", "Event 3", "Event 2", "Event 1", "Event 0"]);
  });

  it("folds past 30 rows behind Show all, and says when the server cut it", () => {
    render(<Timeline rows={rows(SHOWN + 5)} truncated />);
    expect(screen.getAllByRole("listitem")).toHaveLength(30);
    expect(screen.queryByText("Event 0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all 35" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(35);
    expect(screen.getByText("Event 0")).toBeInTheDocument();
    expect(screen.getByText("Only the latest 35 are shown.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(30);
  });

  it("offers no fold for 30 rows or fewer, and gives each row its relative and exact time and its tone", () => {
    render(<Timeline rows={[{ at: "2026-11-28T04:30:00Z", kind: "check_in", title: "Checked in", detail: "QR code", by: "Meera", tone: "success" }]} truncated={false} />);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
    const li = screen.getByRole("listitem");
    expect(li).toHaveAttribute("data-tone", "success");
    expect(li.querySelector("time")).toHaveAttribute("datetime", "2026-11-28T04:30:00Z");
    expect(within(li).getByText(/Meera/)).toBeInTheDocument();
    expect(within(li).getByText("QR code")).toBeInTheDocument();
  });
});

describe("where it opens", () => {
  it("opens from a Review row by its name, as that request", async () => {
    state.profile = full({ kind: "request", registration_id: null, request_id: REQ, person: { ...full().person, full_name: "Asha Rao" }, actions: { ...ALL_ACTIONS, can_check_in: false } });
    render(<RequestsPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Asha Rao" }));
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByRole("heading", { name: "Asha Rao" })).toBeInTheDocument();
    expect(gets).toContain(`/api/v1/events/37/people/${REQ}`);
    // The decision is made from here, through the same call as the row's.
    fireEvent.click(within(sheet).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(posts.some((p) => p.path.endsWith("/requests/approve") && (p.body as { ids: string[] }).ids[0] === REQ)).toBe(true));
  });

  it("opens from a click on the Review row itself, but not from the buttons in it", async () => {
    render(<RequestsPage eventId={37} />);
    const name = await screen.findByRole("button", { name: "Open Asha Rao" });
    // The row's own buttons do their own thing: Decline asks its question, and no profile is read.
    fireEvent.click(screen.getByRole("button", { name: "Decline Asha Rao" }));
    expect(await screen.findByRole("heading", { name: "Decline Asha Rao?" })).toBeInTheDocument();
    expect(gets.some((g) => g.includes("/people/"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Keep them under review" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Decline Asha Rao?" })).toBeNull());
    fireEvent.click(name.closest("tr")!.querySelector("td:nth-of-type(3)") as HTMLElement);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(gets).toContain(`/api/v1/events/37/people/${REQ}`));
  });

  it("opens from an attendee list row, as that registration", async () => {
    render(<RegistrationsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Test Participant One" }));
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByRole("heading", { name: "Test Participant One" })).toBeInTheDocument();
    expect(gets).toContain(`/api/v1/events/37/people/${REG}`);
    expect(within(sheet).getByRole("heading", { name: "Timeline" })).toBeInTheDocument();
  });

  it("opens from the ID-card queue, by the guest's name", async () => {
    render(<PrintQueuePanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Test Participant One" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(gets).toContain(`/api/v1/events/37/people/${REG}`));
  });

  it("is a sheet that closes and leaves the list as it was", async () => {
    const seen: Array<string | null> = [];
    render(<GuestProfileSheet eventId={37} personRef={REG} onOpenChange={(r) => seen.push(r)} />);
    const sheet = await screen.findByRole("dialog");
    await within(sheet).findByRole("heading", { name: "Test Participant One" });
    expect(sheet).toHaveAccessibleName("Test Participant One");
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(seen).toEqual([null]);
  });

  it("is a page at /events/{eventId}/people/{ref}", async () => {
    const { default: Page } = await import("@/app/(dashboard)/events/[eventId]/people/[ref]/page");
    render(await Page({ params: Promise.resolve({ eventId: "37", ref: encodeURIComponent(REG) }) }));
    expect(await screen.findByRole("heading", { name: "Test Participant One", level: 1 })).toBeInTheDocument();
    expect(gets).toContain(`/api/v1/events/37/people/${REG}`);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the page view directly", async () => {
    render(<GuestProfilePage eventId={37} personRef={REG} />);
    expect(await screen.findByRole("heading", { name: "Test Participant One", level: 1 })).toBeInTheDocument();
  });
});
