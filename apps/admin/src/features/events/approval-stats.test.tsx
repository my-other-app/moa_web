import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import analyticsFixture from "../__fixtures__/event-analytics-admin.json";
import detailFixture from "../__fixtures__/event-detail.json";
import eventsFixture from "../__fixtures__/events.json";
import registrationsFixture from "../__fixtures__/event-registrations-admin.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Confirm each registration, for an admin: the events list marks the
 * events that confirm each place and how many wait; the event page reads
 * the requests as a funnel (read-only, nothing to decide here) and its
 * delete says the waiting people get a polite email. From an older server
 * none of it shows.
 */

const requests = {
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

let listRows: Array<Record<string, unknown>> = eventsFixture.items;
let detail: Record<string, unknown> = detailFixture;
let summary: Record<string, unknown> = summaryFixture;

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "a", email: "a@b.c", full_name: "A", user_type: "admin", admin_role: "owner" } }),
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/events/categories/list")) return [{ id: 1, name: "Hackathon" }];
        if (path.includes("/events/admin/list")) return { ...eventsFixture, items: listRows, total: listRows.length };
        if (path.includes("/clubs/admin/list")) return { limit: 100, offset: 0, total: 0, next: null, items: [] };
        if (path.includes("/analytics")) return { ...analyticsFixture, total_registrations: 0 };
        if (/\/events\/\d+\/summary$/.test(path)) return summary;
        if (path.includes("/registration/") && path.includes("/list")) return registrationsFixture;
        if (path.includes("/events/info/")) return detail;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/events",
    useSearchParams: () => new URLSearchParams(),
  };
});

const { render } = await import("@/test/render");
const { EventsV2 } = await import("./components/events-v2");
const { EventDetail } = await import("./components/event-detail");
const { adminEventSchema } = await import("./schemas");

beforeEach(() => {
  listRows = eventsFixture.items;
  detail = detailFixture;
  summary = summaryFixture;
});

describe("the events list", () => {
  it("marks an event that confirms each registration, with how many wait and how many asked", async () => {
    const [first, ...rest] = eventsFixture.items;
    listRows = [{ ...first, requires_approval: true, requests_pending: 37, requests_total: 412 }, ...rest];
    render(<EventsV2 />);
    const row = (await screen.findByText("Mutate")).closest("a")!;
    expect(within(row).getByText("Confirms each")).toBeInTheDocument();
    expect(within(row).getByText("37 waiting")).toBeInTheDocument();
    expect(within(row).getByText("412 asked")).toBeInTheDocument();
  });

  it("marks nothing from an older server, nor an event that doesn't confirm each", async () => {
    render(<EventsV2 />);
    await screen.findByText("Mutate");
    expect(screen.queryByText("Confirms each")).toBeNull();
    expect(screen.queryByText(/waiting$/)).toBeNull();
    expect(screen.queryByText(/asked$/)).toBeNull();
    const old = adminEventSchema.parse(eventsFixture.items[0]);
    expect(old).toMatchObject({ requires_approval: false, requests_pending: null, requests_total: null });
  });
});

describe("the event page", () => {
  it("reads the requests as a funnel, read-only, with the places", async () => {
    detail = { ...detailFixture, requires_approval: true, requests_pending: 37, requests_total: 412 };
    summary = { ...summaryFixture, requests, places: { capacity: 300, taken: 281, held: 12, left: 7 } };
    render(<EventDetail eventId={37} />);
    const card = await screen.findByRole("region", { name: "From asking to the door" });
    // The badge in the header (and the card says so too).
    expect(screen.getAllByText("Confirms each registration").length).toBeGreaterThanOrEqual(1);
    const steps = within(card).getByRole("list", { name: "From asking to the door" });
    expect(steps).toHaveTextContent("Asked412");
    expect(steps).toHaveTextContent("Waiting for you37");
    expect(within(card).getByRole("list", { name: "Confirmed, split" })).toHaveTextContent("Paying12");
    expect(within(card).getByText("Capacity 300 · 281 taken · 12 held · 7 left · 37 waiting")).toBeInTheDocument();
    // Read-only: no way into the queue, and no advice to change the event.
    expect(within(card).queryByRole("link")).toBeNull();
    expect(within(card).getByRole("alert")).toHaveTextContent("37 people are waiting and only 7 places are left. Confirming stops when the places run out.");
    expect(within(card).getByRole("alert")).not.toHaveTextContent("Settings");
    expect(within(card).getByText("The club decides in about 21 h on average.")).toBeInTheDocument();
  });

  it("says, before deleting, that the people waiting get a polite email", async () => {
    detail = { ...detailFixture, requires_approval: true, requests_pending: 37, requests_total: 412 };
    render(<EventDetail eventId={37} />);
    await screen.findByText("Confirms each registration");
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("37 people are waiting for the club to confirm them.");
    expect(dialog).toHaveTextContent("Their requests close, and they’ll get a polite email saying the club wasn’t able to confirm their place.");
  });

  it("shows no funnel and says nothing of waiting people from an older server", async () => {
    render(<EventDetail eventId={37} />);
    await screen.findByText("Test Participant One");
    expect(screen.queryByRole("region", { name: "From asking to the door" })).toBeNull();
    expect(screen.queryByText("Confirms each registration")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).not.toHaveTextContent("waiting");
  });
});
