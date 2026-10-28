import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

const calls: Array<{ method: string; path: string; query?: Record<string, unknown> }> = [];
const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const DAY = 86_400_000;

const base = { slug: null, poster: null, duration: 3, has_prize: false, prize_amount: null, is_online: false, reg_startdate: iso(-10 * DAY), category: { id: 1, name: "Hackathon" }, merch_enabled: false, swag_enabled: false, attended_count: 0, outstanding: 0 };
const rows = [
  { ...base, id: 68, name: "Hack Night 04", event_datetime: iso(2 * DAY), ends_at: iso(2 * DAY + 3 * 3_600_000), location_name: "Lab 3", has_fee: true, reg_fee: 100, reg_enddate: iso(20 * 3_600_000), page_views: 50, registration_count: 2, checked_in: 0, max_participants: 3, collected: 200, door_open: false, registration_open: true, status: "published" },
  { ...base, id: 69, name: "Annual Summit", event_datetime: iso(20 * DAY), ends_at: iso(20 * DAY + 6 * 3_600_000), location_name: "Main Auditorium", has_fee: false, reg_fee: null, reg_enddate: iso(19 * DAY), page_views: 18, registration_count: 0, checked_in: 0, max_participants: null, collected: 0, door_open: false, registration_open: true, status: "published" },
];
const figures = {
  upcoming: 2, next_event: { id: 68, name: "Hack Night 04", starts_at: iso(2 * DAY) }, registered: 2, capacity: 3, collected: 200, outstanding: 0,
  attention: { closing_soon: [{ id: 68, name: "Hack Night 04", at: iso(20 * 3_600_000) }], doors_open: [], unmarked: [{ id: 60, name: "Hack Night 03", at: null }], stale_drafts: [] },
  past: 1, drafts: 1, generated_at: iso(0),
};

let scope = "";
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/events",
    useSearchParams: () => new URLSearchParams(scope ? `scope=${scope}` : ""),
  };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: init?.query });
        if (path.endsWith("/events/figures")) return figures;
        if (path.endsWith("/events/list")) return { items: init?.query?.scope === "past" ? [] : rows, total: init?.query?.scope === "past" ? 0 : 2, limit: 20, offset: 0, next: null };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubEventsList } = await import("./components/events-list");
const { groupOf, relativeDay, signalOf } = await import("./components/events-list");
type ClubEvent = import("./schemas").ClubEvent;

beforeEach(() => {
  calls.length = 0;
  scope = "";
});

describe("the events page", () => {
  it("says which events have registrations to review", async () => {
    const held = figures.attention;
    (figures as { attention: unknown }).attention = { ...held, closing_soon: [], unmarked: [], requests_pending: [{ id: 69, name: "Annual Summit", count: 12 }] };
    try {
      render(<ClubEventsList />);
      const notice = (await screen.findByText(/registrations to review at/)).closest("[role]")!;
      expect(notice).toHaveTextContent("12 registrations to review at Annual Summit.");
      expect(within(notice as HTMLElement).getByRole("link", { name: "Open Review" })).toHaveAttribute("href", "/events/69/requests");
      expect(notice).not.toHaveTextContent(/waiting|request/i);
    } finally {
      figures.attention = held;
    }
  });

  it("reads the season, what waits, and each row's figures and state", async () => {
    render(<ClubEventsList />);
    expect(await screen.findByText("2 upcoming · 2 registered · ₹200 collected · 1 past")).toBeInTheDocument();
    expect(screen.getByText("of 3 places")).toBeInTheDocument();
    expect(screen.getByText("Waiting on you")).toBeInTheDocument();
    expect(screen.getByText(/Sign-up for/)).toBeInTheDocument();
    expect(screen.getByText(/Nobody was marked present/)).toBeInTheDocument();

    const row = (await screen.findByText("Hack Night 04", { selector: "a" })).closest("li")!;
    expect(within(row).getByText("Sign-up closes in 20h")).toBeInTheDocument();
    expect(within(row).getByText("of 3")).toBeInTheDocument();
    expect(within(row).getByText("₹200")).toBeInTheDocument();
    // The ticket price; the free one says so.
    expect(within(row).getByText("₹100 entry")).toBeInTheDocument();
    const free = (await screen.findByText("Annual Summit", { selector: "a" })).closest("li")!;
    expect(within(free).getByText("Free")).toBeInTheDocument();
    expect(within(row).getByText("4% sign up")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Open console" })).toHaveAttribute("href", "/events/68");
    expect(within(row).getByRole("button", { name: "More for Hack Night 04" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "This week" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "This month" })).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/events/list"))?.query).toMatchObject({ scope: "upcoming", limit: 20, offset: 0 });
  });

  it("never calls a paid event free when its price is missing", async () => {
    // The list the server sent had no reg_fee, so every paid event read "Free".
    const paid = rows[0] as { reg_fee: number | null };
    paid.reg_fee = null;
    try {
      render(<ClubEventsList />);
      const row = (await screen.findByText("Hack Night 04", { selector: "a" })).closest("li")!;
      expect(within(row).getByText("Paid")).toBeInTheDocument();
      expect(within(row).queryByText("Free")).toBeNull();
    } finally {
      paid.reg_fee = 100;
    }
  });

  it("shows an empty past scope with its own words", async () => {
    scope = "past";
    render(<ClubEventsList />);
    expect(await screen.findByText("Nothing has run yet")).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/events/list"))?.query).toMatchObject({ scope: "past" });
  });
});

describe("the row's words", () => {
  const ev = rows[0]! as ClubEvent;
  it("says what is true about sign-up", () => {
    expect(signalOf({ ...ev }, NOW)).toEqual({ text: "Sign-up closes in 20h", tone: "caution" });
    expect(signalOf({ ...ev, reg_enddate: iso(10 * DAY) }, NOW)).toEqual({ text: "Sign-up open", tone: "muted" });
    expect(signalOf({ ...ev, registration_count: 3 }, NOW)).toEqual({ text: "Full", tone: "admit" });
    expect(signalOf({ ...ev, registration_open: false, reg_startdate: iso(DAY) }, NOW)?.text).toBe("Sign-up opens in 1d");
    expect(signalOf({ ...ev, registration_open: false }, NOW)).toEqual({ text: "Sign-up closed", tone: "refuse" });
    expect(signalOf({ ...ev, door_open: true }, NOW)).toEqual({ text: "Doors open", tone: "admit" });
    expect(signalOf({ ...ev, status: "draft" }, NOW)?.tone).toBe("caution");
    expect(signalOf({ ...ev, event_datetime: iso(-3 * DAY), ends_at: iso(-3 * DAY + 3_600_000), registration_count: 5, checked_in: 0 }, NOW)?.text).toBe("Attendance not marked");
    expect(signalOf({ ...ev, event_datetime: iso(-3 * DAY), ends_at: iso(-3 * DAY + 3_600_000), registration_count: 5, checked_in: 4 }, NOW)).toBeNull();
  });

  it("groups by nearness ahead and by month behind", () => {
    expect(groupOf({ ...ev, event_datetime: iso(3_600_000) }, "upcoming", NOW)).toBe("Today");
    expect(groupOf({ ...ev, event_datetime: iso(2 * DAY) }, "upcoming", NOW)).toBe("This week");
    expect(groupOf({ ...ev, event_datetime: iso(40 * DAY) }, "upcoming", NOW)).toBe("Later");
    expect(groupOf({ ...ev, door_open: true }, "upcoming", NOW)).toBe("Happening now");
    expect(groupOf({ ...ev, event_datetime: "2026-09-02T10:00:00Z" }, "past", NOW)).toBe("September 2026");
    expect(relativeDay(iso(-15 * DAY), NOW)).toBe("2w ago");
  });
});
