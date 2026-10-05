import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

/**
 * The overview renders from six endpoints at once, four of which exist only to
 * be counted. Most of what can go wrong here is silent: a count fetched without
 * its filter, a share computed against the wrong denominator, a comparison
 * drawn before the window it compares against has arrived. None of that throws.
 */
const calls: string[] = [];

const ANALYTICS = {
  total_users: 669,
  verified_clubs: 38,
  events_hosted: 42,
  platform_revenue: 125000,
  user_growth_data: [],
};

const TRENDS: Record<number, unknown> = {
  30: {
    days: 30,
    series: [{ date: "2026-09-10", users: 4, events: 1, registrations: 9, revenue: 500 }],
    totals: { users: 120, events: 10, registrations: 300, revenue: 50000 },
    previous_totals: { users: 100, events: 10, registrations: 200, revenue: 25000 },
  },
  7: {
    days: 7,
    series: [],
    // Only `users` is -50%, so the assertion below counts the headline card
    // and its selector tile rather than another metric that happens to match.
    totals: { users: 10, events: 1, registrations: 20, revenue: 1000 },
    previous_totals: { users: 20, events: 1, registrations: 25, revenue: 4000 },
  },
};

const DAYS_WAITING = 20;
const applied = new Date(Date.now() - DAYS_WAITING * 86_400_000).toISOString();

const QUEUE = {
  pending_clubs: [{ id: 7, name: "Chess Club", created_at: applied }],
  events_without_attendance: [
    {
      id: 9,
      name: "Hack Night",
      event_datetime: "2026-09-01T10:00:00Z",
      registration_count: 25,
    },
  ],
};

/** total-only responses for the count fan-out, keyed by the exact query sent. */
const COUNTS: Record<string, number> = {
  "/api/v1/clubs/admin/list?offset=0&limit=1": 50,
  "/api/v1/clubs/admin/list?is_verified=true&offset=0&limit=1": 38,
  "/api/v1/events/admin/list?offset=0&limit=1": 42,
  "/api/v1/events/admin/list?is_ended=false&offset=0&limit=1": 7,
  "/api/v1/events/admin/list?has_fee=true&offset=0&limit=1": 9,
  "/api/v1/user/admin/list?offset=0&limit=1": 669,
  "/api/v1/user/admin/list?user_type=admin&offset=0&limit=1": 4,
  "/api/v1/user/admin/list?user_type=club&offset=0&limit=1": 50,
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        const q = new URLSearchParams(
          Object.entries(init?.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString();
        const url = q ? `${path}?${q}` : path;
        calls.push(url);

        if (path.endsWith("/admin/analytics")) return ANALYTICS;
        if (path.includes("/admin/analytics/trends")) {
          return TRENDS[Number(init?.query?.days)] ?? TRENDS[30];
        }
        if (path.includes("/admin/moderation-queue")) return QUEUE;
        if (path.includes("/payments/admin/totals")) {
          return {
            captured_total: 100000,
            refunded_total: 20000,
            net_total: 80000,
            failed_count: 3,
          };
        }
        if (url in COUNTS) return { items: [], total: COUNTS[url], limit: 1, offset: 0 };
        throw new Error(`unstubbed GET ${url}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { DashboardView } = await import("./analytics/components/dashboard-view");

beforeEach(() => {
  calls.length = 0;
});

describe("overview", () => {
  it("renders the headline figures with their direction", async () => {
    render(<DashboardView />);

    expect(await screen.findByText("669")).toBeInTheDocument();

    // 120 new users against 100 in the preceding window. It appears twice by
    // design -- on the headline card and on the chart's series selector -- and
    // both read the same window, so disagreement would be the bug.
    expect(await screen.findAllByText("+20%")).toHaveLength(2);
  });

  it("asks for each count with its filter applied", async () => {
    render(<DashboardView />);

    await waitFor(() => expect(calls.length).toBeGreaterThan(8));
    // A verified-club count fetched without is_verified returns every club and
    // the composition bar then reports 100% verified.
    expect(calls).toContain(
      "/api/v1/clubs/admin/list?is_verified=true&offset=0&limit=1"
    );
    expect(calls).toContain("/api/v1/events/admin/list?is_ended=false&offset=0&limit=1");
    expect(calls).toContain("/api/v1/user/admin/list?user_type=admin&offset=0&limit=1");
  });

  it("derives the pending share rather than reporting the raw total", async () => {
    render(<DashboardView />);

    // 38 of 50 verified leaves 12 pending: 76% / 24%.
    expect(await screen.findByText("76%")).toBeInTheDocument();
    expect(await screen.findByText("24%")).toBeInTheDocument();
    expect(
      await screen.findByText("12 clubs are waiting for approval")
    ).toBeInTheDocument();
  });

  it("shows revenue retained as a share of what was captured", async () => {
    render(<DashboardView />);

    // 80,000 net of 100,000 captured.
    expect(await screen.findByText("80%")).toBeInTheDocument();
  });

  it("ages the queue and flags what is past the review target", async () => {
    render(<DashboardView />);

    expect(await screen.findByText("Chess Club")).toBeInTheDocument();
    expect(await screen.findByText(`Waiting ${DAYS_WAITING} days`)).toBeInTheDocument();
    expect(await screen.findByText("Overdue")).toBeInTheDocument();
  });

  it("shows an event's registrations against nobody checked in", async () => {
    render(<DashboardView />);

    expect(await screen.findByText("Hack Night")).toBeInTheDocument();
    expect(await screen.findByText("0 checked in")).toBeInTheDocument();
    expect(await screen.findByText("25 registered")).toBeInTheDocument();
  });

  it("moves every panel to the same window when the period changes", async () => {
    render(<DashboardView />);
    await screen.findAllByText("+20%");

    fireEvent.click(screen.getByRole("button", { name: "7d" }));

    await waitFor(() =>
      expect(calls.some((c) => c.includes("/trends?days=7"))).toBe(true)
    );
    // 10 new users against 20: the headline delta has to follow the control,
    // not keep showing the 30-day figure beside a 7-day chart.
    expect(await screen.findAllByText("-50%")).toHaveLength(2);
  });
});
