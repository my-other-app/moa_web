import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import analyticsFixture from "../__fixtures__/event-analytics.json";
import eventFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/registrations.json";

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/events/info/")) return eventFixture;
        if (path.includes("/analytics")) return analyticsFixture;
        if (path.includes("/list")) return registrationsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventWorkspace } = await import("./components/event-workspace");
const { eventStatus } = await import("@/features/events");

describe("event status derivation", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("is live while registration is still open", () => {
    expect(
      eventStatus(
        {
          event_datetime: "2026-07-01T10:00:00Z",
          duration: 120,
          reg_enddate: "2026-06-20T00:00:00Z",
        },
        now
      )
    ).toBe("live");
  });

  it("is live when there is no registration deadline at all", () => {
    expect(
      eventStatus(
        { event_datetime: "2026-07-01T10:00:00Z", duration: 120, reg_enddate: null },
        now
      )
    ).toBe("live");
  });

  it("is closed once registration has ended but the event has not run", () => {
    expect(
      eventStatus(
        {
          event_datetime: "2026-07-01T10:00:00Z",
          duration: 120,
          reg_enddate: "2026-06-01T00:00:00Z",
        },
        now
      )
    ).toBe("closed");
  });

  it("is ended once the event itself is over, whatever registration says", () => {
    // Registration nominally still open, but the event ran in May. Reporting
    // "live" here would be the less useful of two true things.
    expect(
      eventStatus(
        {
          event_datetime: "2026-05-01T10:00:00Z",
          duration: 120,
          reg_enddate: "2026-12-01T00:00:00Z",
        },
        now
      )
    ).toBe("ended");
  });

  it("counts duration, so an event mid-session is not yet ended", () => {
    expect(
      eventStatus(
        {
          event_datetime: "2026-06-15T11:00:00Z",
          duration: 180,
          reg_enddate: "2026-06-14T00:00:00Z",
        },
        now
      )
    ).toBe("closed");
  });

  it("treats an unparseable date as not yet ended rather than throwing", () => {
    expect(
      eventStatus(
        { event_datetime: "not a date", duration: null, reg_enddate: null },
        now
      )
    ).toBe("live");
  });
});

describe("event screen", () => {
  it("renders without throwing", () => {
    expect(() => render(<EventWorkspace eventId={37} />)).not.toThrow();
  });

  it("shows the event name as the page title", async () => {
    render(<EventWorkspace eventId={37} />);
    expect(
      await screen.findByRole("heading", { name: "SF Sea Hackathon" })
    ).toBeInTheDocument();
  });

  it("shows the four stat cards with real numbers", async () => {
    render(<EventWorkspace eventId={37} />);
    expect(await screen.findByText("Total Registration Count")).toBeInTheDocument();
    expect(await screen.findByText("24")).toBeInTheDocument();
    // page_views comes from the event, not the analytics response.
    expect(await screen.findByText("Event Visitors")).toBeInTheDocument();
    expect(await screen.findByText("234")).toBeInTheDocument();
  });

  it("takes the institutions count from total_institutions, not the capped list", async () => {
    // The fixture's top_institutions has 5 entries but 7 distinct colleges.
    // Reading the list length would render 5.
    render(<EventWorkspace eventId={37} />);
    expect(await screen.findByText("Institutions")).toBeInTheDocument();
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.queryByText("5")).not.toBeInTheDocument();
  });

  it("offers the three row actions and Add Volunteers", async () => {
    render(<EventWorkspace eventId={37} />);
    expect(
      await screen.findByRole("link", { name: /Edit SF Sea Hackathon/ })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Delete SF Sea Hackathon/ })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Copy public link/ })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Add Volunteers" })
    ).toBeInTheDocument();
  });

  it("renders both registration tabs and the participant list", async () => {
    render(<EventWorkspace eventId={37} />);
    expect(
      await screen.findByRole("button", { name: "Registration" })
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Attendance" })).toBeInTheDocument();
    expect(await screen.findByText("NEX25AA001")).toBeInTheDocument();
    expect(await screen.findByText("Test Participant One")).toBeInTheDocument();
  });

  it("labels the export as what actually downloads", async () => {
    // The design says "Download CSV file"; the endpoint returns an xlsx workbook.
    render(<EventWorkspace eventId={37} />);
    expect(
      await screen.findByRole("link", { name: /Download Excel file/ })
    ).toBeInTheDocument();
  });

  it("keeps the announcement composer disabled until there is a message", async () => {
    render(<EventWorkspace eventId={37} />);
    expect(await screen.findByRole("button", { name: "Send Message" })).toBeDisabled();
  });
});
