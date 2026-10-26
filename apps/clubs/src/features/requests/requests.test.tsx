import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import eventFixture from "../__fixtures__/event-detail.json";

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
  decided_by: string | null;
  decline_note: string | null;
  registration_id: string | null;
  pay_by: string | null;
}

const calls: Array<{ method: string; path: string; query?: Record<string, unknown>; body?: Record<string, unknown> }> = [];
let server: "old" | "new" = "new";
let me: unknown = null;
let places: number | null = null;
let requests: Req[] = [];
/** Holds an approve call until released, to see the progress of a long run. */
let gate: { at: number; wait: Promise<void> } | null = null;
let approveCalls = 0;

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
    ...over,
  };
}

const byQueue = (a: Req, b: Req) => a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id);

function counts() {
  const c: Record<string, number> = { pending: 0, approved: 0, declined: 0, withdrawn: 0, lapsed: 0, closed: 0 };
  for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
  return c;
}

function page(query: Record<string, unknown>) {
  const q = String(query.q ?? "").toLowerCase();
  const all = requests
    .filter((r) => r.status === query.status)
    .filter((r) => !q || [r.full_name, r.email, r.phone].some((v) => v?.toLowerCase().includes(q)))
    .sort(byQueue);
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
          const declined: string[] = [];
          for (const id of body.ids as string[]) {
            const r = requests.find((x) => x.id === id)!;
            if (r.status !== "pending") continue;
            r.status = "declined";
            r.decline_note = (body.note as string) ?? null;
            declined.push(id);
          }
          return { declined, skipped: [] };
        }
        if (path.endsWith("/requests/reopen")) {
          for (const id of body.ids as string[]) requests.find((x) => x.id === id)!.status = "pending";
          return { reopened: body.ids, skipped: [] };
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
  requests = [
    req(1, { full_name: "Asha Rao", email: "asha@example.com", phone: "+91 98470 00001", answers: { college: "CET", diet: "veg" } }),
    req(2, { full_name: "Bilal Khan", email: "bilal@example.com", ticket_type: { id: 4, name: "Early bird" } }),
    req(3, { full_name: "Chitra Nair", email: "chitra@example.com" }),
    req(4, { full_name: "Dev Menon", status: "declined", decided_at: at(30), decided_by: "Priya", decline_note: "Full house" }),
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
    expect(screen.getByText("3 waiting · 0 confirmed · 1 declined")).toBeInTheDocument();
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

  it("declines everyone waiting by reading their ids a page at a time, emailing them by default", async () => {
    requests = Array.from({ length: 120 }, (_, i) => req(i + 1));
    render(<RequestsPage eventId={37} />);
    await screen.findByText("Showing 50 of 120");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all 120 waiting" }));
    fireEvent.click(screen.getByRole("button", { name: "Decline 120" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Decline 120" }));

    expect(await screen.findByText("120 declined and emailed.")).toBeInTheDocument();
    const bodies = posts("/decline").map((c) => c.body as { ids: string[]; notify: boolean });
    expect(bodies.map((b) => b.ids.length)).toEqual([100, 20]);
    expect(bodies.every((b) => b.notify === true)).toBe(true);
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
