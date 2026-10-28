import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import eventFixture from "../__fixtures__/event-detail.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * The event's Requests page against a fake server that keeps the queue:
 * the list oldest first with its counts, search and "Load more"; ticking
 * rows (the page, or every waiting request through all_pending); the
 * warning before confirming past the places left; declining with or
 * without an email and a note; reopening; the outcome in plain words; the
 * door role deciding nothing; and nothing at all from an API without it.
 */

interface Req {
  id: string;
  status: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  ticket_type: { id: number; name: string } | null;
  answers: Record<string, unknown> | null;
  submitted_at: string;
  decided_at: string | null;
  decided_by: { id: number | null; name: string | null } | null;
  decline_note: string | null;
  registration_id: string | null;
  pay_by: string | null;
  amount: number | null;
  discount_code: string | null;
  whatsapp_opt_in: boolean;
}

const calls: Array<{ method: string; path: string; query?: Record<string, unknown>; body?: Record<string, unknown> }> = [];
let server: "old" | "new" = "new";
let me: unknown = null;
let places: number | null = null;
let requests: Req[] = [];
/** Holds an approve call until released, to see the progress of a long run. */
let gate: { at: number; wait: Promise<void> } | null = null;
let approveCalls = 0;
/** The server's reason for refusing a reopen, when it should. */
let reopenRefusal: string | null = null;
/** The server counts `total` (and has the export); false: one from before. */
let withTotal = true;
/** The summary's `requests` block (null: a summary without it). */
let summaryRequests: Record<string, unknown> | null = null;

const at = (minute: number) => new Date(Date.UTC(2026, 9, 26, 4, minute)).toISOString();

function req(i: number, over: Partial<Req> = {}): Req {
  return {
    id: `rq-${String(i).padStart(4, "0")}`,
    status: "pending",
    full_name: `Person ${i}`,
    email: `p${i}@example.com`,
    phone: null,
    ticket_type: { id: 3, name: "Student" },
    answers: null,
    submitted_at: at(i),
    decided_at: null,
    decided_by: null,
    decline_note: null,
    registration_id: null,
    pay_by: null,
    amount: null,
    discount_code: null,
    whatsapp_opt_in: false,
    ...over,
  };
}

const byQueue = (a: Req, b: Req) => a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id);

function counts() {
  const c: Record<string, number> = { pending: 0, approved: 0, declined: 0, withdrawn: 0, lapsed: 0, closed: 0 };
  for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
  if (withTotal) c.total = requests.length;
  return c;
}

function page(query: Record<string, unknown>) {
  const q = String(query.q ?? "").toLowerCase();
  const all = requests
    .filter((r) => query.status === "all" || r.status === query.status)
    .filter((r) => !q || [r.full_name, r.email, r.phone].some((v) => v?.toLowerCase().includes(q)))
    // All is newest first, as the server reads it.
    .sort(query.status === "all" ? (a, b) => byQueue(b, a) : byQueue);
  const start = query.after ? Number(query.after) : 0;
  const limit = Number(query.limit ?? 50);
  return { items: all.slice(start, start + limit), next: start + limit < all.length ? String(start + limit) : null, counts: counts(), places_left: places };
}

function approve(body: Record<string, unknown>) {
  const targets = body.all_pending
    ? requests.filter((r) => r.status === "pending").sort(byQueue).slice(0, Number(body.limit))
    : (body.ids as string[]).map((id) => requests.find((r) => r.id === id)!).sort(byQueue);
  const approved: Array<{ id: string; registration_id: string; pay_by: null }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const r of targets) {
    if (r.status !== "pending") skipped.push({ id: r.id, reason: "not_pending" });
    else if (places === 0) skipped.push({ id: r.id, reason: "event_full" });
    else {
      r.status = "approved";
      r.registration_id = `reg-${r.id}`;
      approved.push({ id: r.id, registration_id: r.registration_id, pay_by: null });
      if (places !== null) places--;
    }
  }
  return { approved, skipped, places_left: places };
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: options?.query });
        if (path === "/api/v1/clubs/access/me") {
          if (me) return me;
          throw new ApiError({ status: 401, message: "Not signed in" });
        }
        if (path.includes("/events/info/")) {
          return { ...eventFixture, requires_approval: true, additional_details: [{ key: "college", label: "College", field_type: "text", required: true }] };
        }
        if (path === "/api/v1/events/registration/37/requests") {
          if (server === "old") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          return page(options?.query ?? {});
        }
        if (path === "/api/v1/events/37/summary") return { ...summaryFixture, ...(summaryRequests ? { requests: summaryRequests } : {}) };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: Record<string, unknown>) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/requests/approve")) {
          approveCalls++;
          if (gate && approveCalls === gate.at) await gate.wait;
          return approve(body);
        }
        if (path.endsWith("/requests/decline")) {
          const targets = body.all_pending
            ? requests.filter((r) => r.status === "pending").sort(byQueue).slice(0, Number(body.limit)).map((r) => r.id)
            : (body.ids as string[]);
          const declined: string[] = [];
          for (const id of targets) {
            const r = requests.find((x) => x.id === id)!;
            if (r.status !== "pending") continue;
            r.status = "declined";
            r.decline_note = (body.note as string) ?? null;
            declined.push(id);
          }
          return { declined, skipped: targets.filter((id) => !declined.includes(id)).map((id) => ({ id, reason: "not_pending" })) };
        }
        if (path.endsWith("/requests/reopen")) {
          const reopened: string[] = [];
          const skipped: Array<{ id: string; reason: string }> = [];
          for (const id of body.ids as string[]) {
            const r = requests.find((x) => x.id === id)!;
            if (reopenRefusal) skipped.push({ id, reason: reopenRefusal });
            else {
              r.status = "pending";
              reopened.push(id);
            }
          }
          return { reopened, skipped };
        }
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { RequestsPage } = await import("./index");
const { indiaTime } = await import("./schemas");

const posts = (suffix: string) => calls.filter((c) => c.method === "POST" && c.path.endsWith(suffix));

beforeEach(() => {
  calls.length = 0;
  server = "new";
  me = null;
  places = null;
  gate = null;
  approveCalls = 0;
  reopenRefusal = null;
  withTotal = true;
  summaryRequests = null;
  requests = [
    req(1, { full_name: "Asha Rao", email: "asha@example.com", phone: "+91 98470 00001", answers: { college: "CET", diet: "veg" } }),
    req(2, { full_name: "Bilal Khan", email: "bilal@example.com", ticket_type: { id: 4, name: "Early bird" } }),
    req(3, { full_name: "Chitra Nair", email: "chitra@example.com" }),
    req(4, { full_name: "Dev Menon", status: "declined", decided_at: at(30), decided_by: { id: 9, name: "Priya" }, decline_note: "Full house" }),
  ];
});

describe("the list", () => {
  it("shows who is waiting, oldest first: contact, ticket type, the time in India, and their answers on request", async () => {
    render(<RequestsPage eventId={37} />);
    const table = await screen.findByRole("table");
    const names = within(table)
      .getAllByText(/^(Asha Rao|Bilal Khan|Chitra Nair)$/)
      .map((el) => el.textContent);
    expect(names).toEqual(["Asha Rao", "Bilal Khan", "Chitra Nair"]);
    expect(screen.getByText("asha@example.com · +91 98470 00001")).toBeInTheDocument();
    expect(screen.getByText("Early bird")).toBeInTheDocument();
    expect(screen.getAllByText(indiaTime(at(1)))[0]).toBeInTheDocument();
    expect(indiaTime(at(1))).toBe("26 Oct 2026, 9:31 am");
    expect(screen.getByText("4 in total · 3 waiting for you · 0 confirmed · 1 declined")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Waiting/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /^Declined/ })).toHaveTextContent("1");
    expect(screen.getByText("No limit on places")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Answers (2) of Asha Rao" }));
    const answers = screen.getByRole("group", { name: "Answers of Asha Rao" });
    // The event's own question by its label, then anything else they answered.
    expect(within(answers).getByText("College")).toBeInTheDocument();
    expect(within(answers).getByText("CET")).toBeInTheDocument();
    expect(within(answers).getByText("diet")).toBeInTheDocument();
  });

  it("reads more a page at a time with the server's cursor, and searches by name, email or phone", async () => {
    requests = Array.from({ length: 60 }, (_, i) => req(i + 1));
    render(<RequestsPage eventId={37} />);
    expect(await screen.findByText("Showing 50 of 60")).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/requests") && c.query?.limit === 50)?.query).toMatchObject({ status: "pending" });

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 60 of 60")).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/requests") && c.query?.after === "50")).toBe(true);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();

    const search = screen.getByRole("searchbox", { name: "Search requests" });
    fireEvent.change(search, { target: { value: "p42@" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(screen.getByText("Person 42")).toBeInTheDocument();
    expect(calls.some((c) => c.query?.q === "p42@")).toBe(true);
  });

  it("shows each tab's own requests, with what was decided", async () => {
    render(<RequestsPage eventId={37} />);
    await screen.findByText("Asha Rao");
    fireEvent.click(screen.getByRole("button", { name: /^Declined/ }));
    expect(await screen.findByText("Dev Menon")).toBeInTheDocument();
    expect(screen.getByText("“Full house”")).toBeInTheDocument();
    expect(screen.getByText(/· by Priya/)).toBeInTheDocument();
    expect(screen.queryByText("Asha Rao")).toBeNull();
  });
});

describe("deciding", () => {
  it("confirms one from its row: it leaves the waiting list and the counts move", async () => {
    render(<RequestsPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Asha Rao" }));
    await waitFor(() => expect(screen.queryByText("Asha Rao")).toBeNull());
    expect(posts("/approve")[0]!.body).toEqual({ ids: ["rq-0001"] });
    expect(screen.getByRole("button", { name: /^Waiting/ })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /^Confirmed/ })).toHaveTextContent("1");
  });

  it("warns before confirming more than the places left, sends them oldest first, and says what was skipped", async () => {
    places = 2;
    render(<RequestsPage eventId={37} />);
    await screen.findByText("2 places left");
    // Ticked out of order: they still go in queue order.
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Chitra Nair" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Asha Rao" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Bilal Khan" }));
    expect(screen.getByText("3 people selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm 3" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Confirm 3 people?")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Only 2 places are left. Only the first 2 in order (oldest request first) will be confirmed; the other person stays waiting."),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm 3" }));

    expect(await screen.findByText("2 confirmed, 1 skipped.")).toBeInTheDocument();
    expect(screen.getByText("Skipped: 1 because the event is full.")).toBeInTheDocument();
    expect(posts("/approve")[0]!.body).toEqual({ ids: ["rq-0001", "rq-0002", "rq-0003"] });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("3 people selected")).toBeNull();
  });

  it("won't confirm anyone when no place is left", async () => {
    places = 0;
    render(<RequestsPage eventId={37} />);
    await screen.findByText("0 places left");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Asha Rao" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm 1" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/No places are left, so nobody can be confirmed/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("selects every waiting request at once and confirms them through all_pending, with progress", async () => {
    requests = Array.from({ length: 250 }, (_, i) => req(i + 1));
    let release!: () => void;
    gate = { at: 2, wait: new Promise<void>((r) => (release = r)) };
    render(<RequestsPage eventId={37} />);
    await screen.findByText("Showing 50 of 250");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    expect(screen.getByText("50 people selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select all 250 waiting" }));
    expect(screen.getByText("250 people selected")).toBeInTheDocument();
    expect(screen.getByText(/Every waiting request, oldest first/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm 250" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm 250" }));
    expect(await screen.findByRole("progressbar", { name: "Confirming 100 of 250" })).toBeInTheDocument();
    release();

    expect(await screen.findByText("250 confirmed.")).toBeInTheDocument();
    const bodies = posts("/approve").map((c) => c.body);
    expect(bodies).toEqual([
      { all_pending: true, limit: 100 },
      { all_pending: true, limit: 100 },
      { all_pending: true, limit: 50 },
    ]);
    // Nothing was loaded to do it: the list read its first page only.
    expect(calls.filter((c) => c.method === "GET" && c.query?.after).length).toBe(0);
  });

  it("declines with the choice to email them and a short note", async () => {
    render(<RequestsPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline Bilal Khan" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Decline Bilal Khan?")).toBeInTheDocument();
    const email = within(dialog).getByRole("switch", { name: "Email them to say so" });
    expect(email).toBeChecked();
    fireEvent.click(email);
    const note = within(dialog).getByLabelText("A note for them (optional)");
    expect(note).toHaveAttribute("maxLength", "300");
    fireEvent.change(note, { target: { value: "  We had far more requests than seats.  " } });
    expect(within(dialog).getByText("40/300")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Decline" }));

    expect(await screen.findByText("1 declined, not emailed.")).toBeInTheDocument();
    expect(posts("/decline")[0]!.body).toEqual({ ids: ["rq-0002"], notify: false, note: "We had far more requests than seats." });
  });

  it("declines everyone waiting through all_pending without loading them, emailing them by default", async () => {
    requests = Array.from({ length: 620 }, (_, i) => req(i + 1));
    render(<RequestsPage eventId={37} />);
    await screen.findByText("Showing 50 of 620");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all 620 waiting" }));
    fireEvent.click(screen.getByRole("button", { name: "Decline 620" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("A note for them (optional)"), { target: { value: "Full house" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Decline 620" }));

    expect(await screen.findByText("620 declined and emailed.")).toBeInTheDocument();
    expect(posts("/decline").map((c) => c.body)).toEqual([
      { all_pending: true, limit: 500, notify: true, note: "Full house" },
      { all_pending: true, limit: 120, notify: true, note: "Full house" },
    ]);
    // Nothing was read to do it: the list's first page only.
    expect(calls.filter((c) => c.method === "GET" && c.query?.after).length).toBe(0);
  });

  it("reopens a declined request", async () => {
    render(<RequestsPage eventId={37} />);
    await screen.findByText("Asha Rao");
    fireEvent.click(screen.getByRole("button", { name: /^Declined/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Reopen Dev Menon's request" }));
    await waitFor(() => expect(screen.queryByText("Dev Menon")).toBeNull());
    expect(posts("/reopen")[0]!.body).toEqual({ ids: ["rq-0004"] });
    expect(screen.getByRole("button", { name: /^Waiting/ })).toHaveTextContent("4");
  });

  it("says why a request couldn't be reopened, and leaves it where it is", async () => {
    reopenRefusal = "already_open";
    const error = vi.spyOn(toast, "error");
    render(<RequestsPage eventId={37} />);
    await screen.findByText("Asha Rao");
    fireEvent.click(screen.getByRole("button", { name: /^Declined/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Reopen Dev Menon's request" }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith("Dev Menon couldn't be put back among the requests waiting for you, because they have asked again since, and that request is still open."),
    );
    expect(screen.getByText("Dev Menon")).toBeInTheDocument();
    error.mockRestore();
  });

  it("shows a confirmed paid ticket's price and its pay-by, and a WhatsApp ask", async () => {
    requests = [
      req(1, { full_name: "Esha Pillai", phone: "+91 98470 00009", whatsapp_opt_in: true }),
      req(2, { full_name: "Farah Ali", status: "approved", decided_at: at(40), amount: 199, pay_by: "2026-10-27T10:30:00Z" }),
      req(3, { full_name: "Gopal Das", status: "approved", decided_at: at(41), amount: 149.5, registration_id: "reg-3" }),
    ];
    render(<RequestsPage eventId={37} />);
    expect(await screen.findByText("p1@example.com · +91 98470 00009 · WhatsApp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Confirmed/ }));
    expect(await screen.findByText(`Confirmed ${indiaTime(at(40))} · ₹199 to pay by ${indiaTime("2026-10-27T10:30:00Z")}`)).toBeInTheDocument();
    expect(screen.getByText(`Confirmed ${indiaTime(at(41))} · registered · ₹149.50`)).toBeInTheDocument();
  });
});

describe("who may decide, and an API without requests", () => {
  it("lets door staff read the list and decide nothing", async () => {
    me = {
      role: "door",
      role_label: "Door",
      role_description: "Check-ins.",
      can: { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: false, delete_events: false, door: true },
      club_id: 5,
      club_name: "Circuit Society",
      member: null,
    };
    render(<RequestsPage eventId={37} />);
    expect(await screen.findByText(/Your role can see the requests but not decide them/)).toBeInTheDocument();
    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm Asha Rao" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline Asha Rao" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("follows the server's word on deciding over editing events", async () => {
    me = {
      role: "editor",
      role_label: "Editor",
      role_description: "Events.",
      can: { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: true, delete_events: false, door: true, decide_requests: false },
      club_id: 5,
      club_name: "Circuit Society",
      member: null,
    };
    render(<RequestsPage eventId={37} />);
    expect(await screen.findByText(/Your role can see the requests but not decide them/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm Asha Rao" })).toBeNull();
  });

  it("says it isn't available when the API has no such route, and sends nothing", async () => {
    server = "old";
    render(<RequestsPage eventId={37} />);
    expect(await screen.findByText("Requests aren't available yet")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toEqual([]);
  });
});

describe("the numbers, All and Export", () => {
  const paidFigures = {
    enabled: true, total: 412, pending: 37, approved: 293, declined: 40, withdrawn: 8, lapsed: 17, closed: 0,
    approved_paid: 281, approved_awaiting_payment: 12, awaiting_payment_amount: 2388, earliest_hold_expires_at: "2026-10-28T12:30:00Z",
    checked_in: 0, oldest_pending_at: "2026-10-26T04:00:00Z", avg_decision_hours: 20.5, added_directly: 15,
  };

  it("says how many asked in total, and on a paid event how many confirmed have paid and are paying", async () => {
    summaryRequests = paidFigures;
    render(<RequestsPage eventId={37} />);
    expect(await screen.findByText("4 in total · 3 waiting for you · 0 confirmed · 1 declined")).toBeInTheDocument();
    const split = (await screen.findByText(/Of the confirmed:/)).closest("p")!;
    expect(split).toHaveTextContent("Of the confirmed: 281 paid · 12 paying (₹2,388 to come, the first hold ends");
    expect(split).toHaveTextContent("17 didn't pay");
  });

  it("shows no paid split on a free event, or from a summary without requests", async () => {
    summaryRequests = { ...paidFigures, approved: 30, approved_paid: 0, approved_awaiting_payment: 0, awaiting_payment_amount: 0, lapsed: 0 };
    render(<RequestsPage eventId={37} />);
    await screen.findByText("4 in total · 3 waiting for you · 0 confirmed · 1 declined");
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/37/summary")).toBe(true));
    expect(screen.queryByText(/Of the confirmed:/)).toBeNull();
  });

  it("has an All tab with every request, newest first, each with its status", async () => {
    render(<RequestsPage eventId={37} />);
    await screen.findByText("Asha Rao");
    const all = screen.getByRole("button", { name: /^All/ });
    expect(all).toHaveTextContent("4");
    fireEvent.click(all);
    expect(await screen.findByText("Dev Menon")).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/requests") && c.query?.status === "all")).toBe(true);
    const table = screen.getByRole("table");
    const names = within(table).getAllByText(/^(Asha Rao|Bilal Khan|Chitra Nair|Dev Menon)$/).map((el) => el.textContent);
    expect(names).toEqual(["Dev Menon", "Chitra Nair", "Bilal Khan", "Asha Rao"]);
    const dev = within(table).getByText("Dev Menon").closest("tr")!;
    expect(within(dev).getByText("Declined")).toBeInTheDocument();
    const asha = within(table).getByText("Asha Rao").closest("tr")!;
    expect(within(asha).getByText("Waiting")).toBeInTheDocument();
    expect(screen.getByText("Showing 4 of 4")).toBeInTheDocument();

    // Confirmed from All, the row stays with its new status and the counts move.
    fireEvent.click(within(asha).getByRole("button", { name: "Confirm Asha Rao" }));
    await waitFor(() => expect(within(screen.getByText("Asha Rao").closest("tr")!).getAllByText("Confirmed").length).toBeGreaterThan(0));
    expect(within(screen.getByText("Asha Rao").closest("tr")!).queryByText("Waiting")).toBeNull();
    expect(screen.getByRole("button", { name: /^Waiting/ })).toHaveTextContent("2");
  });

  it("exports every request as a CSV through the gateway", async () => {
    const fetchMock = vi.fn(async () => new Response("status,name\r\npending,Asha Rao", { status: 200, headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="requests-hack-night.csv"' } }));
    vi.stubGlobal("fetch", fetchMock);
    const createUrl = vi.fn(() => "blob:requests");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    const success = vi.spyOn(toast, "success");
    try {
      render(<RequestsPage eventId={37} />);
      fireEvent.click(await screen.findByRole("button", { name: "Export" }));
      await waitFor(() => expect(success).toHaveBeenCalledWith("Requests exported"));
      expect(fetchMock).toHaveBeenCalledWith("/api/gateway/api/v1/events/registration/37/requests/export", expect.objectContaining({ credentials: "include" }));
      expect(clicked).toEqual(["requests-hack-night.csv"]);
      expect(createUrl).toHaveBeenCalled();
    } finally {
      click.mockRestore();
      success.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("drops Export, saying so, when the server has no export route", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: "Not Found" }), { status: 404, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(toast, "warning");
    try {
      render(<RequestsPage eventId={37} />);
      fireEvent.click(await screen.findByRole("button", { name: "Export" }));
      await waitFor(() => expect(warn).toHaveBeenCalledWith("Exporting requests arrives with the next update of MyOtherApp."));
      await waitFor(() => expect(screen.queryByRole("button", { name: "Export" })).toBeNull());
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("shows no Export to an older server (no total), and All counts the statuses together", async () => {
    withTotal = false;
    render(<RequestsPage eventId={37} />);
    await screen.findByText("Asha Rao");
    expect(screen.getByText("4 in total · 3 waiting for you · 0 confirmed · 1 declined")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^All/ })).toHaveTextContent("4");
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });
});
