import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import analyticsFixture from "../__fixtures__/event-analytics-admin.json";
import detailFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/event-registrations-admin.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Registrations under review, for an admin: on an event that reviews
 * registrations, who registered and where each stands -- by status, searched,
 * paged by the server's cursor and exported -- read-only. From a server that
 * hasn't the route (404) or won't show an admin (401, 403) the section isn't
 * there at all. (The list's own route: GET /events/registration/{id}/requests.)
 */

type Query = Record<string, string>;

const calls: string[] = [];
let role = "owner";
let detail: Record<string, unknown> = detailFixture;
let requests: (query: Query) => unknown = () => page([]);

function person(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    status: "pending",
    full_name: `Person ${n}`,
    email: `person${n}@example.com`,
    phone: `98765${String(n).padStart(5, "0")}`,
    ticket_type: { id: 1, name: "General admission" },
    answers: { College: "CET" },
    submitted_at: "2026-10-20T10:00:00+05:30",
    decided_at: null,
    decided_by: null,
    decline_note: null,
    registration_id: null,
    closed_reason: null,
    pay_by: null,
    amount: null,
    discount_code: null,
    whatsapp_opt_in: false,
    ...over,
  };
}

const COUNTS = { pending: 107, approved: 20, declined: 9, withdrawn: 3, lapsed: 0, closed: 1, total: 140 };

function page(items: unknown[], next: string | null = null, counts: Record<string, number> = COUNTS) {
  return { items, next, counts, places_left: null };
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "a", email: "a@b.c", full_name: "A", user_type: "admin", admin_role: role } }),
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        const query = Object.fromEntries(
          Object.entries(init?.query ?? {})
            .filter(([, v]) => v !== undefined && v !== null && v !== "")
            .map(([k, v]) => [k, String(v)])
        ) as Query;
        const qs = new URLSearchParams(query).toString();
        calls.push(qs ? `${path}?${qs}` : path);
        if (/\/registration\/\d+\/requests$/.test(path)) return requests(query);
        if (path.includes("/analytics")) return analyticsFixture;
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path.includes("/registration/") && path.includes("/list")) return registrationsFixture;
        if (path.includes("/events/info/")) return detail;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string) => {
        calls.push(`POST ${path}`);
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventDetail } = await import("./components/event-detail");

const requestCalls = () => calls.filter((c) => c.includes("/requests"));
const section = () => screen.findByRole("region", { name: "Registrations under review" });

beforeEach(() => {
  calls.length = 0;
  role = "owner";
  detail = { ...detailFixture, requires_approval: true, requests_pending: 107, requests_total: 140 };
  requests = () => page([person(1), person(2)]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "";
});

describe("registrations under review on the event page", () => {
  it("lists who is under review: name, email, phone, ticket type, when they registered, status", async () => {
    render(<EventDetail eventId={37} />);
    const region = await section();
    await within(region).findByText("Person 1");
    const rows = within(within(region).getByRole("table")).getAllByRole("row");
    // The header, and the two people.
    expect(rows).toHaveLength(3);
    for (const header of ["Name", "Email", "Phone", "Ticket type", "Registered", "Status"]) {
      expect(within(rows[0]!).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    const first = within(rows[1]!);
    expect(first.getByText("Person 1")).toBeInTheDocument();
    // On a wide screen in their columns; on a phone, under the name.
    expect(first.getAllByText(/person1@example\.com/).length).toBeGreaterThanOrEqual(1);
    expect(first.getByText("9876500001")).toBeInTheDocument();
    expect(first.getByText("General admission")).toBeInTheDocument();
    expect(first.getAllByText(/20 Oct 2026/).length).toBeGreaterThanOrEqual(1);
    expect(first.getByText("Under review")).toBeInTheDocument();
    // The queue first: under review, the default page.
    expect(requestCalls()[0]).toBe("/api/v1/events/registration/37/requests?status=pending&limit=50");
    expect(region).toHaveTextContent("Oldest first");
  });

  it("offers each status as a tab with its count, in the review words", async () => {
    render(<EventDetail eventId={37} />);
    const region = await section();
    const tabs = within(region).getByRole("tablist", { name: "Registration status" });
    await waitFor(() => expect(within(tabs).getByRole("tab", { name: /^Under review/ })).toHaveTextContent("Under review107"));
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Under review107",
      "Confirmed20",
      "Declined9",
      "Cancelled3",
      // Expired only once anyone is; Closed is, here.
      "Closed1",
      "All140",
    ]);
    expect(region).not.toHaveTextContent(/waiting|request|withdrawn|lapsed/i);
  });

  it("reads another status, newest first, and says what the badge alone doesn't", async () => {
    requests = (q) =>
      q.status === "approved"
        ? page([person(3, { status: "approved", pay_by: "2026-11-03T18:00:00+05:30" }), person(4, { status: "approved", registration_id: "r-4" })])
        : q.status === "closed"
          ? page([person(5, { status: "closed", closed_reason: "event_cancelled" })])
          : page([person(1)]);
    render(<EventDetail eventId={37} />);
    const region = await section();
    fireEvent.click(await within(region).findByRole("tab", { name: /^Confirmed/ }));
    expect(await within(region).findByText("Person 3")).toBeInTheDocument();
    expect(requestCalls().at(-1)).toBe("/api/v1/events/registration/37/requests?status=approved&limit=50");
    expect(within(region).getAllByText("Confirmed").length).toBeGreaterThanOrEqual(2);
    expect(within(region).getByText(/^Paying · by 0?3 Nov 2026/)).toBeInTheDocument();
    expect(region).toHaveTextContent("Newest first");

    fireEvent.click(within(region).getByRole("tab", { name: /^Closed/ }));
    expect(await within(region).findByText("Event cancelled")).toBeInTheDocument();
  });

  it("searches by name, email or phone", async () => {
    requests = (q) => (q.q ? page([person(42)]) : page([person(1), person(2)]));
    render(<EventDetail eventId={37} />);
    const region = await section();
    await within(region).findByText("Person 1");
    const search = within(region).getByRole("searchbox", { name: "Search registrations under review" });
    fireEvent.change(search, { target: { value: "  person42 " } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(await within(region).findByText("Person 42")).toBeInTheDocument();
    expect(requestCalls().at(-1)).toBe("/api/v1/events/registration/37/requests?status=pending&q=person42&limit=200");
    expect(within(region).getByText("1 match")).toBeInTheDocument();
  });

  it("says when a search found nobody", async () => {
    requests = (q) => (q.q ? page([]) : page([person(1)]));
    render(<EventDetail eventId={37} />);
    const region = await section();
    await within(region).findByText("Person 1");
    const search = within(region).getByRole("searchbox");
    fireEvent.change(search, { target: { value: "zzz" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(await within(region).findByText("Nobody matches “zzz”.")).toBeInTheDocument();
  });

  it("pages by the server's cursor, forward and back", async () => {
    requests = (q) =>
      q.after === "c2"
        ? page([person(51)], null)
        : page(Array.from({ length: 50 }, (_, i) => person(i + 1)), "c2");
    render(<EventDetail eventId={37} />);
    const region = await section();
    expect(await within(region).findByText("1–50 of 107 people")).toBeInTheDocument();
    fireEvent.click(within(region).getByRole("button", { name: "Next page" }));
    expect(await within(region).findByText("Person 51")).toBeInTheDocument();
    expect(requestCalls().at(-1)).toBe("/api/v1/events/registration/37/requests?status=pending&after=c2&limit=50");
    // No further page: the server said so, whatever the count.
    expect(within(region).getByRole("button", { name: "Next page" })).toBeDisabled();
    fireEvent.click(within(region).getByRole("button", { name: "Previous page" }));
    expect(await within(region).findByText("Person 50")).toBeInTheDocument();
  });

  it("exports every registration under review as the server's CSV", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("Status,Full name\r\nUnder review,Person 1\r\n", {
          status: 200,
          headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="devfest-requests.csv"' },
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    render(<EventDetail eventId={37} />);
    const region = await section();
    await within(region).findByText("Person 1");
    fireEvent.click(within(region).getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(saved).toEqual(["devfest-requests.csv"]));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gateway/api/v1/events/registration/37/requests/export",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("offers no export to an admin whose role can't export data, and no decisions to anyone", async () => {
    role = "viewer";
    render(<EventDetail eventId={37} />);
    const region = await section();
    await within(region).findByText("Person 1");
    expect(within(region).queryByRole("button", { name: "Export CSV" })).toBeNull();
    expect(within(region).queryByRole("button", { name: /confirm|decline|back to review/i })).toBeNull();
    expect(within(region).queryByRole("checkbox")).toBeNull();
    expect(region).toHaveTextContent("Read-only. The club confirms and declines registrations in its own dashboard.");
    expect(calls.some((c) => c.startsWith("POST"))).toBe(false);
  });

  it.each([
    [404, "an older server without the route"],
    [401, "a server that won't let an admin in"],
    [403, "a server that refuses admins"],
  ])("isn't there at all on a %i from %s", async (status) => {
    requests = () => {
      throw new ApiError({ message: "no", status, routeMissing: status === 404 });
    };
    render(<EventDetail eventId={37} />);
    await screen.findByRole("heading", { name: "SF Sea Hackathon" });
    await waitFor(() => expect(requestCalls().length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Registrations under review" })).toBeNull());
    expect(screen.queryByText("Registrations under review")).toBeNull();
  });

  it("says so when the list fails for another reason", async () => {
    requests = () => {
      throw new ApiError({ message: "boom", status: 500 });
    };
    render(<EventDetail eventId={37} />);
    const region = await section();
    expect(await within(region).findByText("The registrations could not load. Try again in a moment.")).toBeInTheDocument();
  });

  it("isn't shown, nor asked for, on an event that doesn't review registrations", async () => {
    detail = { ...detailFixture };
    render(<EventDetail eventId={37} />);
    await screen.findByText("Test Participant One");
    expect(screen.queryByRole("region", { name: "Registrations under review" })).toBeNull();
    expect(requestCalls()).toEqual([]);
  });

  it("is shown for an event that stopped reviewing but still has registrations from then", async () => {
    detail = { ...detailFixture, requires_approval: false, requests_pending: 0, requests_total: 12 };
    render(<EventDetail eventId={37} />);
    expect(await section()).toBeInTheDocument();
  });

  it("comes into view when the events list's “N under review” brought the admin here", async () => {
    window.location.hash = "#under-review";
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<EventDetail eventId={37} />);
    const region = await section();
    expect(region).toHaveAttribute("id", "under-review");
    await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(1));
    expect(scrolled.mock.instances[0]).toBe(region);
  });
});
