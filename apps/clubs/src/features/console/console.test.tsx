import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import eventFixture from "../__fixtures__/event-detail.json";
import summaryFixture from "../__fixtures__/event-summary.json";

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
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventConsole, EventOverviewTab, tabFor, clockNotices, eventSummarySchema } = await import("./index");

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

  it("earns a notice when the clock is off and the day has come and gone", () => {
    const now = new Date("2099-06-10T00:00:00Z");
    const base = { starts_at: "2099-06-09T08:20:00+00:00", ends_at: "2099-06-09T16:20:00+00:00", retention: { mode: "keep", state: null, run_at: null } };
    expect(clockNotices({ ...base, status: "draft", status_clock: false }, now).map((n) => n.tag)).toEqual(["Started"]);
    expect(clockNotices({ ...base, status: "live", status_clock: false }, now).map((n) => n.tag)).toEqual(["Ended"]);
    // With the clock on, the clock will do it; no nagging.
    expect(clockNotices({ ...base, status: "live", status_clock: true }, now)).toEqual([]);
    expect(clockNotices({ ...base, status: "closed", status_clock: true, retention: { mode: "delete", state: "deleted", run_at: null } }, now).map((n) => n.tone)).toEqual(["refuse"]);
  });

  it("parses the summary, tolerating an unknown status", () => {
    const parsed = eventSummarySchema.parse({ ...summaryFixture, status: "cancelled" });
    expect(parsed.status).toBe("published");
    expect(parsed.analytics.by_door).toHaveLength(2);
  });
});

describe("event console", () => {
  it("shows the event name as the page title, with its status and its sections", async () => {
    render(
      <EventConsole eventId={37}>
        <p>the panel</p>
      </EventConsole>
    );
    expect(await screen.findByRole("heading", { name: "SF Sea Hackathon" })).toBeInTheDocument();
    expect(await screen.findByText("Live")).toBeInTheDocument();
    const rail = await screen.findByRole("navigation", { name: "Event sections" });
    expect(within(rail).getByRole("link", { name: /Overview/ })).toHaveAttribute("aria-current", "page");
    expect(within(rail).getByRole("link", { name: /Attendees/ })).toHaveTextContent("24");
    expect(within(rail).getByRole("link", { name: /Check-ins/ })).toHaveTextContent("3");
    expect(screen.getByText("the panel")).toBeInTheDocument();
  });

  it("offers the gate console while the door is open, the designs and the row actions", async () => {
    render(
      <EventConsole eventId={37}>
        <p />
      </EventConsole>
    );
    expect(await screen.findByRole("link", { name: /Open gate console/ })).toHaveAttribute("href", "/gate/37");
    expect(screen.getByRole("button", { name: "Designs" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Edit SF Sea Hackathon/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Delete SF Sea Hackathon/ })).toBeInTheDocument();
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
    expect(screen.getByText(/4 without a ticket/)).toBeInTheDocument();
  });
});
