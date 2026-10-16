import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import analyticsFixture from "../__fixtures__/event-analytics.json";
import eventFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/registrations.json";
import summaryFixture from "../__fixtures__/event-summary.json";

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/events/info/")) return eventFixture;
        // The event summary, not the delivery summary, which also ends in /summary.
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path.includes("/analytics")) return analyticsFixture;
        if (path.includes("/list")) return registrationsFixture;
        if (path.endsWith("/imports")) return [];
        if (path.endsWith("/deliveries/summary"))
          return { kind: "ticket", registrations: 2, revoked: 0, channels: [{ channel: "email", sent: 0, failed: 0, skipped: 0, pending: 0, unsent: 2 }] };
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
const { RegistrationsPanel } = await import("./components/registrations-panel");
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

  it("shows the four stat cards with real numbers", async () => {
    render(<EventWorkspace eventId={37} />);
    /*
     * Each figure is asserted inside its own card. The insights panel below
     * reads the same analytics response, so these numbers legitimately appear
     * more than once on the page -- a document-wide lookup now finds two.
     */
    const inCard = async (label: string, value: string) => {
      const heading = await screen.findByText(label);
      const card = heading.closest("div.bg-card");
      expect(card).not.toBeNull();
      expect(within(card as HTMLElement).getByText(value)).toBeInTheDocument();
    };

    await inCard("Registrations", "24");
    // page_views comes from the event, not the analytics response.
    await inCard("Event visitors", "234");
  });

  it("takes the institutions count from total_institutions, not the capped list", async () => {
    // The fixture's top_institutions has 5 entries but 7 distinct colleges.
    // Reading the list length would render 5.
    render(<EventWorkspace eventId={37} />);

    /*
     * Scoped to the card rather than the document. Asserting that "5" appears
     * nowhere on the page was only ever true by accident -- the insights
     * panel below legitimately renders it, as a rank and in "top 5 of 17".
     * What matters is which number this card shows.
     */
    const label = await screen.findByText("Institutions");
    const card = label.closest("div.bg-card");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("7")).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("5")).toBeNull();
  });

  it("draws the door's figures and the status from the clock; the row actions live in the console", async () => {
    render(<EventWorkspace eventId={37} />);
    expect(await screen.findByText("Arrival curve")).toBeInTheDocument();
    // The fixture's dates would say "ended"; the clock says live, and the clock wins.
    const label = await screen.findByText("Status");
    const card = label.closest("div.bg-card");
    expect(within(card as HTMLElement).getByText("Live")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Edit SF Sea Hackathon/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add Volunteers/i })).toBeNull();
  });
});

describe("attendees tab", () => {
  it("renders the guest list with its filters, the delivery bar and the import", async () => {
    render(<RegistrationsPanel eventId={37} />);
    expect(await screen.findByRole("button", { name: "Checked in" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Not delivered" })).toBeInTheDocument();
    expect(await screen.findByText("NEX25AA001")).toBeInTheDocument();
    expect(await screen.findByText("Test Participant One")).toBeInTheDocument();
    expect(await screen.findByText("Tickets by email")).toBeInTheDocument();
    expect(await screen.findByText("Import a guest list")).toBeInTheDocument();
  });

  it("shows the role each person is attending as, treating a missing one as attendee", async () => {
    // The second fixture row deliberately carries no `role`, standing in for a
    // response cached from before the field existed.
    render(<RegistrationsPanel eventId={37} />);
    const speaker = await screen.findByLabelText("Role for Test Participant One");
    expect(within(speaker).getByText("Speaker")).toBeInTheDocument();
    const other = await screen.findByLabelText("Role for Test Participant Two");
    expect(within(other).getByText("Attendee")).toBeInTheDocument();
  });

  it("labels the export as what actually downloads", async () => {
    // The design says "Download CSV file"; the endpoint returns an xlsx workbook.
    render(<RegistrationsPanel eventId={37} />);
    expect(
      await screen.findByRole("link", { name: /Download Excel file/ })
    ).toBeInTheDocument();
  });

  it("keeps the announcement composer disabled until there is a message", async () => {
    render(<EventWorkspace eventId={37} />);
    expect(await screen.findByRole("button", { name: "Send Message" })).toBeDisabled();
  });
});
