import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import analyticsFixture from "../__fixtures__/event-analytics.json";
import clubFixture from "../__fixtures__/club-info.json";
import dashboardFixture from "../__fixtures__/club-dashboard.json";
import eventFixture from "../__fixtures__/event-detail.json";
import financeFixture from "../__fixtures__/finance-summary.json";
import overviewFixture from "../__fixtures__/club-overview.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Confirm each registration in numbers, around the club's dashboard: the
 * funnel on the event's overview (paid and free) with its places, the
 * events list's waiting badge and "Requests open", the home's "Asked", the
 * insights when only requests exist, the sales table's held places, the
 * delete wording, and the closeout's and finance's figures. Against an
 * older server (the fields absent) each piece stays away.
 */

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const DAY = 86_400_000;

let summary: Record<string, unknown> = summaryFixture;
let analytics: Record<string, unknown> = analyticsFixture;
let overview: Record<string, unknown> = overviewFixture;

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/events",
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/events/37/summary") return summary;
        if (path === "/api/v1/events/info/37") return eventFixture;
        if (path === "/api/v1/events/registration/37/analytics") return analytics;
        if (path.endsWith("/clubs/overview")) return overview;
        if (path.endsWith("/clubs/dashboard")) return { ...dashboardFixture, live: [], stats: { ...dashboardFixture.stats, doors_open: 0 } };
        if (path.endsWith("/clubs/info")) return clubFixture;
        if (path === "/api/v1/clubs/access/me") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventRequestsFunnel } = await import("./index");
const { eventDetailSchema, clubEventSchema } = await import("@/features/events/schemas");
const { EventRow } = await import("@/features/events/components/events-list");
const { EventRowMenu } = await import("@/features/events/components/event-row-menu");
const { ClubDashboardV2 } = await import("@/features/club/components/dashboard-v2");
const { EventInsightsPanel } = await import("@/features/registrations/components/event-insights-panel");
const { TicketSalesTable } = await import("@/features/ticketing/components/ticket-sales");
const { salesSchema, salesWorthShowing } = await import("@/features/ticketing/schemas");
const { figuresSchema } = await import("@/features/closeout/schemas");
const { financeSummarySchema } = await import("@/features/finance/schemas");
const { requestRates, placesShortfall, requestFiguresSchema } = await import("@moa/app-kit");

const paidFigures = {
  enabled: true,
  total: 412,
  pending: 37,
  approved: 293,
  declined: 40,
  withdrawn: 8,
  lapsed: 17,
  closed: 0,
  approved_paid: 281,
  approved_awaiting_payment: 12,
  awaiting_payment_amount: 2388,
  earliest_hold_expires_at: "2099-06-08T12:30:00+00:00",
  checked_in: 240,
  oldest_pending_at: "2099-06-07T09:05:00+00:00",
  avg_decision_hours: 20.5,
  added_directly: 15,
};
const freeFigures = { ...paidFigures, approved: 310, approved_paid: 0, approved_awaiting_payment: 0, awaiting_payment_amount: 0, earliest_hold_expires_at: null, lapsed: 0, checked_in: 200 };

beforeEach(() => {
  summary = summaryFixture;
  analytics = analyticsFixture;
  overview = overviewFixture;
});

const detail = (over: Record<string, unknown> = {}) => eventDetailSchema.parse({ ...eventFixture, ...over });

describe("the funnel on the event's overview", () => {
  it("walks a paid event from asking to the door: paid, paying with ₹ and the first hold's end, didn't pay", async () => {
    summary = { ...summaryFixture, requests: paidFigures, places: { capacity: 300, taken: 281, held: 12, left: 7 } };
    render(<EventRequestsFunnel eventId={37} event={detail({ has_fee: true, page_views: 2060 })} />);
    const card = await screen.findByRole("region", { name: "Requests" });
    const steps = within(card).getByRole("list", { name: "From asking to the door" });
    expect(steps).toHaveTextContent("Asked412");
    expect(steps).toHaveTextContent("15 more people added directly");
    expect(steps).toHaveTextContent("Waiting for you37");
    expect(steps).toHaveTextContent(/oldest asked/);
    expect(steps).toHaveTextContent("Confirmed310");
    const split = within(card).getByRole("list", { name: "Confirmed, split" });
    expect(split).toHaveTextContent("Paid281");
    expect(split).toHaveTextContent("Paying12");
    expect(split).toHaveTextContent(/₹2,388 to come · first hold ends/);
    expect(split).toHaveTextContent("Didn't pay17");
    expect(steps).toHaveTextContent("40 declined · 8 withdrew");
    expect(steps).toHaveTextContent("Checked in240");

    const rates = within(card).getByLabelText("Rates");
    // 310 confirmed of 350 decided; 281 paid of 310; 240 in of 281 paid; 412 asked of 2,060 views.
    expect(rates).toHaveTextContent("Confirmed89%");
    expect(rates).toHaveTextContent("Paid91%");
    expect(rates).toHaveTextContent("Turnout85%");
    expect(rates).toHaveTextContent("Views → asked20%");
    expect(within(card).getByText("You decide in about 21 h on average.")).toBeInTheDocument();
    expect(within(card).getByText("Capacity 300 · 281 taken · 12 held · 7 left · 37 waiting")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Open requests →" })).toHaveAttribute("href", "/events/37/requests");
  });

  it("warns when more are waiting than places are left, and not when they fit", async () => {
    summary = { ...summaryFixture, requests: paidFigures, places: { capacity: 300, taken: 281, held: 12, left: 7 } };
    const { unmount } = render(<EventRequestsFunnel eventId={37} event={detail({ has_fee: true })} />);
    const card = await screen.findByRole("region", { name: "Requests" });
    expect(within(card).getByRole("alert")).toHaveTextContent("37 people are waiting and only 7 places are left. Confirming stops when the places run out: decline the rest, or add places under Settings.");
    unmount();

    summary = { ...summaryFixture, requests: paidFigures, places: { capacity: 400, taken: 281, held: 12, left: 107 } };
    render(<EventRequestsFunnel eventId={37} event={detail({ has_fee: true })} />);
    const roomy = await screen.findByRole("region", { name: "Requests" });
    expect(within(roomy).queryByRole("alert")).toBeNull();
    expect(placesShortfall({ capacity: 300, taken: 281, held: 12, left: 0 }, 5)).toBe(5);
    expect(placesShortfall({ capacity: null, taken: 281, held: 12, left: null }, 500)).toBe(0);
  });

  it("skips the payment step on a free event, and reads an uncapped event as no cap", async () => {
    summary = { ...summaryFixture, requests: freeFigures, places: { capacity: null, taken: 310, held: 0, left: null } };
    render(<EventRequestsFunnel eventId={37} event={detail({ has_fee: false })} />);
    const card = await screen.findByRole("region", { name: "Requests" });
    expect(within(card).queryByRole("list", { name: "Confirmed, split" })).toBeNull();
    expect(within(card).queryByText("Paying")).toBeNull();
    const rates = within(card).getByLabelText("Rates");
    expect(rates).not.toHaveTextContent("Paid");
    // 200 in of the 310 confirmed.
    expect(rates).toHaveTextContent("Turnout65%");
    expect(within(card).getByText("No cap · 310 taken · 0 held · 37 waiting")).toBeInTheDocument();
    expect(within(card).queryByRole("alert")).toBeNull();
  });

  it("stays away for an older server, and for an event that never asked anyone to wait", async () => {
    const { container, unmount } = render(<EventRequestsFunnel eventId={37} event={detail()} />);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Requests" })).toBeNull());
    expect(container).toBeEmptyDOMElement();
    unmount();
    summary = { ...summaryFixture, requests: { ...paidFigures, enabled: false, total: 0 } };
    const again = render(<EventRequestsFunnel eventId={37} event={detail()} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(again.container).toBeEmptyDOMElement();
  });

  it("works its rates out from the figures alone", () => {
    const r = requestFiguresSchema.parse(paidFigures);
    expect(requestRates(r, { paidEvent: true, pageViews: 2060 })).toEqual({ confirmed: 89, paid: 91, turnout: 85, asked: 20 });
    // Nobody decided, nobody viewed: no rate rather than 0%.
    expect(requestRates(requestFiguresSchema.parse({ enabled: true, total: 3, pending: 3 }), {})).toEqual({ confirmed: null, paid: null, turnout: null, asked: null });
    // Odd values from a server read safely.
    expect(requestFiguresSchema.parse({ total: "12", pending: -3, avg_decision_hours: "soon" })).toMatchObject({ total: 12, pending: 0, avg_decision_hours: null, enabled: false });
  });
});

describe("the events list", () => {
  const row = (over: Record<string, unknown> = {}) =>
    clubEventSchema.parse({
      id: 68, name: "Hack Night 04", slug: null, poster: null, event_datetime: iso(5 * DAY), ends_at: iso(5 * DAY + 3_600_000), duration: 3,
      location_name: "Lab 3", has_fee: false, reg_fee: null, has_prize: false, prize_amount: null, is_online: false,
      reg_startdate: iso(-10 * DAY), reg_enddate: iso(4 * DAY), category: { id: 1, name: "Hackathon" }, page_views: 50,
      registration_count: 0, attended_count: 0, status: "published", checked_in: 0, max_participants: 100, collected: 0, outstanding: 0,
      door_open: false, registration_open: true, ...over,
    });

  it("shows how many wait as a badge to the Requests, says Requests open, and leads with who asked", () => {
    render(
      <ul>
        <EventRow event={row({ requires_approval: true, requests_pending: 37, requests_total: 412 })} now={NOW} />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "37 waiting" })).toHaveAttribute("href", "/events/68/requests");
    expect(screen.getByText("Requests open")).toBeInTheDocument();
    expect(screen.queryByText("Sign-up open")).toBeNull();
    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText("asked")).toBeInTheDocument();
    expect(screen.getByText("0 of 100 in")).toBeInTheDocument();
    // Not "0 of 100", as if nobody wanted to come.
    expect(screen.queryByText("of 100")).toBeNull();
  });

  it("shows no badge when nobody waits, and the old figures from an older server", () => {
    const { unmount } = render(
      <ul>
        <EventRow event={row({ requires_approval: true, requests_pending: 0, requests_total: 12, registration_count: 12 })} now={NOW} />
      </ul>,
    );
    expect(screen.queryByRole("link", { name: /waiting/ })).toBeNull();
    expect(screen.getByText("12 of 100 in")).toBeInTheDocument();
    unmount();

    render(
      <ul>
        <EventRow event={row({ registration_count: 0 })} now={NOW} />
      </ul>,
    );
    expect(screen.queryByRole("link", { name: /waiting/ })).toBeNull();
    expect(screen.getByText("Sign-up open")).toBeInTheDocument();
    expect(screen.getByText("of 100")).toBeInTheDocument();
    expect(screen.queryByText("asked")).toBeNull();
  });

  it("says, before deleting, that the people waiting get a polite email", async () => {
    render(<EventRowMenu event={{ id: 68, name: "Hack Night 04", slug: null, registration_count: 0, requests_pending: 37 }} />);
    fireEvent.keyDown(await screen.findByRole("button", { name: "More for Hack Night 04" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete event/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("37 people are waiting for you to confirm them.");
    expect(dialog).toHaveTextContent("Their requests close, and they'll get a polite email saying you weren't able to confirm their place.");
  });
});

describe("the dashboard's home", () => {
  it("puts Asked beside Registrations on the next event and on past events", async () => {
    overview = {
      ...overviewFixture,
      next_event: { ...overviewFixture.next_event, requests_total: 412 },
      reach: overviewFixture.reach.map((e, i) => ({ ...e, requests_total: i === 0 ? 96 : null })),
    };
    render(<ClubDashboardV2 />);
    const labels = await screen.findAllByText("Asked");
    const box = labels.map((l) => l.closest("div")!).find((d) => d.textContent?.includes("Page views"))!;
    expect(box).toHaveTextContent("Asked412");
    expect(box).toHaveTextContent("Registrations40");
    // The reach table gains its column; an event that never asked reads "—".
    const demo = (await screen.findAllByRole("link", { name: /Demo Day/ })).find((a) => a.getAttribute("href") === "/events/12" && a.textContent?.includes("96"));
    expect(demo).toBeTruthy();
    expect(screen.getAllByText("Asked").length).toBeGreaterThanOrEqual(2);
  });

  it("shows no Asked from an older server", async () => {
    render(<ClubDashboardV2 />);
    await screen.findAllByText("Registrations");
    await screen.findByText("Hack Night");
    expect(screen.queryByText("Asked")).toBeNull();
  });
});

describe("the insights", () => {
  it("shows when people asked instead of 'nobody has signed up' while only requests exist", async () => {
    analytics = {
      ...analyticsFixture,
      total_registrations: 0,
      requests_total: 5,
      requests_by_day: [
        { date: "2099-06-02", count: 2 },
        { date: "2099-06-01", count: 3 },
      ],
    };
    render(<EventInsightsPanel eventId={37} pageViews={50} />);
    expect(await screen.findByText("When people asked")).toBeInTheDocument();
    expect(screen.queryByText("Nobody has signed up yet")).toBeNull();
    const days = screen.getByRole("list", { name: "Requests by day" });
    expect(within(days).getAllByRole("listitem")).toHaveLength(2);
    // Oldest first, whatever order the server sent.
    expect(within(days).getAllByRole("listitem")[0]).toHaveTextContent("1 Jun: 3 asked");
    expect(screen.getByText("busiest: 1 Jun")).toBeInTheDocument();
    expect(screen.getByText(/5 people asked for a place; 10% of the people who opened the event page asked\./)).toBeInTheDocument();
    expect(screen.getByText(/Nobody is registered yet: 5 people have asked/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open requests" })).toHaveAttribute("href", "/events/37/requests");
  });

  it("reads the days as a map too, and shows them beside the sign-ups once people are registered", async () => {
    analytics = { ...analyticsFixture, requests_total: 30, requests_by_day: { "2099-06-01": 10, "2099-06-03": 20 } };
    render(<EventInsightsPanel eventId={37} pageViews={234} />);
    expect(await screen.findByText("When people asked")).toBeInTheDocument();
    expect(screen.getByText("When people signed up")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Requests by day" })).getAllByRole("listitem")).toHaveLength(2);
  });

  it("still says nobody has signed up when nobody asked either (or the server is older)", async () => {
    analytics = { ...analyticsFixture, total_registrations: 0 };
    render(<EventInsightsPanel eventId={37} pageViews={0} />);
    expect(await screen.findByText("Nobody has signed up yet")).toBeInTheDocument();
    expect(screen.queryByText("When people asked")).toBeNull();
  });
});

describe("the sales table", () => {
  const type = (over: Record<string, unknown>) => ({ id: 1, name: "Standard", price: 199, capacity: 300, is_hidden: false, sold: 281, paid: 281, revenue: 55919, pending: 0, discount_total: 0, available: 7, waiting: 0, offered: 0, ...over });

  it("labels the places held for confirmed requests apart from the waiting list", () => {
    const sales = salesSchema.parse({ types: [type({ held: 12 })], totals: { sold: 281, revenue: 55919, held: 12 }, codes: [], event_capacity: 300, event_available: 7, waitlist_enabled: false });
    render(<TicketSalesTable sales={sales} />);
    const table = screen.getByRole("table", { name: "Sales by ticket type" });
    const heads = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(["Type", "Sold", "Revenue", "Awaiting payment", "Held", "Left", "Waiting list"]);
    const cells = within(within(table).getAllByRole("row")[1]!).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[4]).toBe("12");
    expect(screen.getByText(/Held: places kept for people you confirmed until they pay/)).toBeInTheDocument();
    // A single type with only holds is still worth showing on the overview.
    expect(salesWorthShowing(sales)).toBe(true);
  });

  it("has no Held column from a server that doesn't count holds apart", () => {
    const sales = salesSchema.parse({ types: [type({})], totals: { sold: 281 }, codes: [], event_capacity: 300, event_available: 7, waitlist_enabled: false });
    render(<TicketSalesTable sales={sales} />);
    expect(screen.queryByRole("columnheader", { name: "Held" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Waiting list" })).toBeInTheDocument();
    expect(salesWorthShowing(sales)).toBe(false);
  });
});

describe("closeout and finance", () => {
  const closeout = {
    event_name: "Hack Night", org_name: "Yukthi", venue: null, starts_at: iso(-DAY), ends_at: iso(-DAY + 3_600_000), registered: 310, checked_in: 240, turnout_pct: 77, no_shows: 70,
    by_role: [], by_via: [], walk_ins: 0, with_phone: 0, merch: [], messages: [], certificates_issued: 0, cards_printed: 0, rating_avg: 0, rating_count: 0,
  };

  it("reads the closeout's request figures, and none from an older server", () => {
    expect(figuresSchema.parse({ ...closeout, requests: paidFigures }).requests).toMatchObject({ total: 412, approved_paid: 281, lapsed: 17 });
    expect(figuresSchema.parse(closeout).requests).toBeNull();
  });

  it("reads what is expected from holds, in total and per event, and null from an older server", () => {
    const withHolds = {
      ...financeFixture,
      figures: { ...financeFixture.figures, expected_from_holds: 2388 },
      by_event: financeFixture.by_event.map((e, i) => ({ ...e, expected_from_holds: i === 0 ? 2388 : 0 })),
    };
    const s = financeSummarySchema.parse(withHolds);
    expect(s.figures.expected_from_holds).toBe(2388);
    expect(s.by_event[0]!.expected_from_holds).toBe(2388);
    expect(financeSummarySchema.parse(financeFixture).figures.expected_from_holds).toBeNull();
  });
});
