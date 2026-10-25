import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import eventFixture from "../__fixtures__/event-detail.json";
import summaryFixture from "../__fixtures__/event-summary.json";
import topicsFixture from "../__fixtures__/topics.json";

const pathname = { current: "/events/37" };

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => pathname.current,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/events/info/")) return eventFixture;
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path === "/api/v1/interests/list") return topicsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventConsole, EventOverviewTab, tabFor, clockNotices, overviewAttention, eventSummarySchema } = await import("./index");
const { eventDetailSchema } = await import("@/features/events");

describe("the console's sections", () => {
  it("names the tab from the path under the event", () => {
    expect(tabFor("")).toBe("overview");
    expect(tabFor("/")).toBe("overview");
    expect(tabFor("/check-ins")).toBe("check-ins");
    expect(tabFor("/emails/12")).toBe("emails");
    expect(tabFor("/edit")).toBe("settings");
    // The designer is under the event but is not a tab.
    expect(tabFor("/design")).toBe("");
  });

  it("earns a notice when the clock is off and the day has come and gone, each with the page that settles it", () => {
    const now = new Date("2099-06-10T00:00:00Z");
    const base = { starts_at: "2099-06-09T08:20:00+00:00", ends_at: "2099-06-09T16:20:00+00:00", retention: { mode: "keep", state: null, run_at: null } };
    expect(clockNotices({ ...base, status: "draft", status_clock: false }, now).map((n) => n.tag)).toEqual(["Started"]);
    expect(clockNotices({ ...base, status: "live", status_clock: false }, now).map((n) => n.tag)).toEqual(["Ended"]);
    expect(clockNotices({ ...base, status: "live", status_clock: false }, now)[0]!.action.path).toBe("/closeout");
    // With the clock on, the clock will do it; no nagging.
    expect(clockNotices({ ...base, status: "live", status_clock: true }, now)).toEqual([]);
    expect(clockNotices({ ...base, status: "closed", status_clock: true, retention: { mode: "delete", state: "deleted", run_at: null } }, now).map((n) => n.tone)).toEqual(["refuse"]);
  });

  it("parses the summary, tolerating an unknown status", () => {
    const parsed = eventSummarySchema.parse({ ...summaryFixture, status: "postponed" });
    expect(parsed.status).toBe("published");
    // Cancelling is a status of its own now (POST /events/{id}/cancel).
    expect(eventSummarySchema.parse({ ...summaryFixture, status: "cancelled" }).status).toBe("cancelled");
    expect(parsed.analytics.by_door).toHaveLength(2);
  });
});

describe("what needs attention", () => {
  const s = eventSummarySchema.parse(summaryFixture);

  it("puts a refused send first, then the missing tickets, the bounce and the failed card, each with its page", () => {
    const items = overviewAttention(s);
    expect(items.map((i) => i.kind)).toEqual(["SENDS_FAILED", "TICKETS_MISSING", "BOUNCED", "CARDS_FAILED"]);
    expect(items[0]!.tone).toBe("red");
    expect(items[1]!.title).toBe("4 guests without a ticket");
    expect(items[2]!.path).toBe("/attendees?delivery=not_delivered");
  });

  it("does not nag a draft about tickets it is not meant to send yet", () => {
    expect(overviewAttention({ ...s, status: "draft" }).map((i) => i.kind)).not.toContain("TICKETS_MISSING");
  });

  it("says an older design before a missing ticket, since re-sending fixes both", () => {
    const kinds = overviewAttention({ ...s, tickets: { ...s.tickets, older_design: 3 } }).map((i) => i.kind);
    expect(kinds).toContain("REDESIGNED_AFTER_ISSUE");
    expect(kinds).not.toContain("TICKETS_MISSING");
  });

  it("has nothing to ask once the list has been scrubbed", () => {
    expect(overviewAttention({ ...s, from_report: true })).toEqual([]);
  });
});

describe("event console", () => {
  it("shows the event name as the page title, with its status and its sections", async () => {
    render(
      <EventConsole eventId={37}>
        <p>the panel</p>
      </EventConsole>
    );
    expect(await screen.findByRole("heading", { level: 1, name: "SF Sea Hackathon" })).toBeInTheDocument();
    // The status badge says Live; so does the Live tab in the rail, hence the badge is found by its slot.
    expect((await screen.findAllByText("Live")).some((el) => el.getAttribute("data-slot") === "badge")).toBe(true);
    const rail = await screen.findByRole("navigation", { name: "Event sections" });
    expect(within(rail).getByRole("link", { name: /Overview/ })).toHaveAttribute("aria-current", "page");
    expect(within(rail).getByRole("link", { name: /Attendees/ })).toHaveTextContent("24");
    expect(within(rail).getByRole("link", { name: /Check-ins/ })).toHaveTextContent("3");
    expect(screen.getByText("the panel")).toBeInTheDocument();
  });

  it("offers the gate console while the door is open, the designs, and the event's verbs behind one menu", async () => {
    render(
      <EventConsole eventId={37}>
        <p />
      </EventConsole>
    );
    expect(await screen.findByRole("link", { name: /Open gate console/ })).toHaveAttribute("href", "/gate/37");
    expect(screen.getByRole("button", { name: "Designs" })).toBeInTheDocument();
    const more = await screen.findByRole("button", { name: "More for SF Sea Hackathon" });
    fireEvent.keyDown(more, { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /Edit details/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Duplicate/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Copy public link/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete event/ })).toBeInTheDocument();
  });

  it("steps aside for the designer, which wants the whole width", async () => {
    pathname.current = "/events/37/design";
    try {
      render(
        <EventConsole eventId={37}>
          <p>the designer</p>
        </EventConsole>
      );
      expect(screen.getByText("the designer")).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Event sections" })).toBeNull();
    } finally {
      pathname.current = "/events/37";
    }
  });
});

describe("overview tab", () => {
  it("draws the door from one summary: arrivals, the curve, recent check-ins, the panels", async () => {
    render(<EventOverviewTab eventId={37} event={undefined} />);
    expect(await screen.findByText("Arrival curve")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Checked in" })).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText("Walk-up Nine")).toBeInTheDocument();
    expect(screen.getByText("Load by door")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Gate A admitted" })).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByText("Turnout by role")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Speaker checked in" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("Did tickets reach people?")).toBeInTheDocument();
    expect(screen.getByText("How guests were admitted")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "T-shirt collected" })).toHaveAttribute("aria-valuenow", "2");
    // The curve is an image with a caption a screen reader can read.
    expect(screen.getByRole("img", { name: /Admissions per quarter hour/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View all 3 check-ins/ })).toHaveAttribute("href", "/events/37/check-ins");
  });

  it("lists what needs attention, each leading to the page where it is settled", async () => {
    render(<EventOverviewTab eventId={37} event={undefined} />);
    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /4 guests without a ticket/ })).toHaveAttribute("href", "/events/37/attendees");
    expect(screen.getByRole("link", { name: /1 ticket email failed/ })).toHaveAttribute("href", "/events/37/deliveries");
    expect(screen.getByRole("link", { name: /1 email address bounced/ })).toHaveAttribute("href", "/events/37/attendees?delivery=not_delivered");
  });

  it("places the caller's pieces in its layout", async () => {
    render(<EventOverviewTab eventId={37} event={undefined} figures={<p>the figures</p>} signups={<p>the sign-ups</p>} notify={<p>the composer</p>} reviews={<p>the reviews</p>} />);
    expect(await screen.findByText("the figures")).toBeInTheDocument();
    for (const piece of ["the sign-ups", "the composer", "the reviews"]) expect(screen.getByText(piece)).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("names the event's topics beside its interests: the server's own, else derived from the interests", async () => {
    const own = eventDetailSchema.parse({ ...eventFixture, interests: [{ id: 6, name: "Coding" }], topics: [{ id: 2, slug: "development", name: "Development", color: "#2563EB" }] });
    const { unmount } = render(<EventOverviewTab eventId={37} event={own} />);
    const row = (await screen.findByText("Interests")).closest("div")!;
    expect(within(row).getByRole("list", { name: "Topics" })).toHaveTextContent("Development");
    expect(within(row).getByText("Coding")).toBeInTheDocument();
    unmount();

    // A server before topics: worked out from the interests against /interests/list.
    const derived = eventDetailSchema.parse({ ...eventFixture, interests: [{ id: 31, name: "Robotics" }, { id: 6, name: "Coding" }] });
    expect(derived.topics).toBeNull();
    const second = render(<EventOverviewTab eventId={37} event={derived} />);
    const list = await screen.findByRole("list", { name: "Topics" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Development", "Deep Tech"]);
    expect(screen.getByText("Robotics, Coding")).toBeInTheDocument();
    second.unmount();

    render(<EventOverviewTab eventId={37} event={eventDetailSchema.parse(eventFixture)} />);
    const none = (await screen.findByText("Interests")).closest("div")!;
    expect(within(none).getByText("None picked")).toBeInTheDocument();
  });
});
