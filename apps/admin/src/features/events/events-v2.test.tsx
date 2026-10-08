import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import eventsFixture from "../__fixtures__/events.json";

/**
 * The v2 Events screen.
 *
 * The screen exists for one row: an event that has finished, has
 * registrations, and has nobody marked present. Certificates and winners are
 * both blocked until the club marks attendance, so those are the events an
 * admin chases -- and "0 present" and "nobody was ever marked" are the same
 * number and entirely different situations.
 *
 * `rowView` decides all four time-dependent cells together, so it is tested
 * directly against a fixed clock. Testing it through the rendered screen
 * would mean a suite whose result depends on the day it runs.
 */
const calls: string[] = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({
      data: {
        id: 1,
        username: "platform_admin",
        email: "a@b.c",
        full_name: "Admin",
        user_type: "admin",
        admin_role: "owner",
      },
    }),
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        const query = new URLSearchParams(
          Object.entries(init?.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString();
        calls.push(query ? `${path}?${query}` : path);

        if (path.includes("/events/categories/list")) {
          return [
            { id: 1, name: "Hackathon" },
            { id: 2, name: "Workshop" },
          ];
        }
        if (path.includes("/events/admin/list")) return eventsFixture;
        if (path.includes("/clubs/admin/list")) {
          return { limit: 100, offset: 0, total: 1, next: null, items: [] };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventsV2, rowView } = await import("./components/events-v2");
const { adminEventSchema } = await import("./schemas");

/**
 * A fixed "now", so none of this depends on the day the suite runs.
 *
 * Both the clock and the event times are built from local components rather
 * than from UTC strings. "Today" is a local-day comparison -- an admin in
 * Pune means the Indian day -- so a UTC literal here would straddle midnight
 * in IST and make the result depend on the machine's timezone.
 */
const NOW = new Date(2026, 9, 8, 12, 0, 0);

/** An ISO instant for a given local wall-clock time. */
function at(year: number, month: number, day: number, hour = 18): string {
  return new Date(year, month, day, hour, 0, 0).toISOString();
}

function eventWith(overrides: Record<string, unknown>) {
  return adminEventSchema.parse({
    id: 1,
    name: "Test Event",
    poster: null,
    event_datetime: at(2026, 8, 1),
    has_fee: false,
    reg_fee: null,
    page_views: 100,
    category: { id: 1, name: "Workshop" },
    club: { id: 1, name: "Circuit Society" },
    registration_count: 0,
    attended_count: 0,
    ...overrides,
  });
}

beforeEach(() => {
  calls.length = 0;
});

describe("rowView", () => {
  it("calls an ended event with registrations and no attendance 'Not marked'", () => {
    const view = rowView(
      eventWith({ event_datetime: at(2026, 8, 1), registration_count: 40 }),
      NOW
    );
    expect(view.state).toBe("Ended");
    expect(view.present).toBe("Not marked");
    // Accented, because this is the row the admin came for.
    expect(view.presentClass).toContain("accent");
  });

  it("does not call an ended event nobody registered for 'Not marked'", () => {
    /*
     * The distinction the whole column exists for. Zero registrations means
     * there was nobody to mark; it is not a club failing to do its job, and
     * flagging it would bury the rows that are.
     */
    const view = rowView(
      eventWith({ event_datetime: at(2026, 8, 1), registration_count: 0 }),
      NOW
    );
    expect(view.present).toBe("0");
    expect(view.presentClass).not.toContain("accent");
  });

  it("shows the turnout once attendance has been marked", () => {
    const view = rowView(
      eventWith({
        event_datetime: at(2026, 8, 1),
        registration_count: 40,
        attended_count: 31,
      }),
      NOW
    );
    expect(view.present).toBe("31");
    expect(view.presentClass).not.toContain("accent");
  });

  it("leaves attendance blank for an event that has not happened", () => {
    const view = rowView(
      eventWith({ event_datetime: at(2026, 10, 1), registration_count: 40 }),
      NOW
    );
    expect(view.state).toBe("Upcoming");
    // Not "Not marked": there is nothing to mark yet, and flagging a future
    // event would make the column meaningless.
    expect(view.present).toBe("—");
  });

  it("says Today for an event happening later the same day", () => {
    const view = rowView(eventWith({ event_datetime: at(2026, 9, 8, 19) }), NOW);
    expect(view.state).toBe("Today");
  });

  it("reads the date from the event, not from the clock", () => {
    const view = rowView(eventWith({ event_datetime: at(2026, 8, 14, 10) }), NOW);
    expect(view.month).toBe("SEP");
    expect(view.day).toBe("14");
  });

  it("survives an event with no date rather than rendering Invalid Date", () => {
    const view = rowView(eventWith({ event_datetime: null }), NOW);
    expect(view.month).toBe("—");
    expect(view.day).toBe("");
  });

  it("formats the fee, and free events as Free", () => {
    expect(rowView(eventWith({ has_fee: true, reg_fee: 250 }), NOW).fee).toBe("₹250");
    expect(rowView(eventWith({ has_fee: false, reg_fee: null }), NOW).fee).toBe("Free");
    // has_fee set with no amount is a half-filled record, not a ₹0 ticket.
    expect(rowView(eventWith({ has_fee: true, reg_fee: null }), NOW).fee).toBe("Free");
  });
});

describe("events screen", () => {
  it("renders a row per event", async () => {
    render(<EventsV2 />);
    const first = eventsFixture.items.at(0)!;
    expect(await screen.findByText(first.name)).toBeInTheDocument();
  });

  it("asks the API for the page size the pager reports", async () => {
    render(<EventsV2 />);
    await screen.findByText(eventsFixture.items.at(0)!.name);
    expect(calls.find((c) => c.includes("/events/admin/list"))).toContain("limit=25");
  });

  it("offers the category filter from the categories endpoint", async () => {
    render(<EventsV2 />);
    await screen.findByText(eventsFixture.items.at(0)!.name);

    const select = screen.getByRole("combobox", { name: "Category" });
    expect(within(select).getByRole("option", { name: "Hackathon" })).toBeInTheDocument();
  });
});
