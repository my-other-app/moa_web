import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import analyticsFixture from "../__fixtures__/event-analytics.json";
import eventFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/registrations.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/** What a test changes about the event or the URL; reset before each. */
const event: { patch: Record<string, unknown> } = { patch: {} };
const list: { page: unknown } = { page: null };
const url = { search: new URLSearchParams(), push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: url.push, replace: url.push, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events/37/attendees",
  useSearchParams: () => url.search,
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/events/info/")) return { ...eventFixture, ...event.patch };
        // The event summary, not the delivery summary, which also ends in /summary.
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path.includes("/analytics")) return analyticsFixture;
        if (path.includes("/list")) return list.page ?? registrationsFixture;
        if (path.endsWith("/imports")) return [];
        if (path.endsWith("/deliveries/summary"))
          return { kind: "ticket", registrations: 2, revoked: 0, channels: [{ channel: "email", sent: 0, failed: 0, skipped: 0, pending: 0, unsent: 2 }] };
        if (path.endsWith("/audience"))
          return {
            event: { id: 37, name: "SF Sea Hackathon" },
            registered: 24,
            checked_in: 3,
            reachable: 10,
            by_audience: { all: { people: 24, reachable: 10 }, attendees: { people: 3, reachable: 2 }, non_attendees: { people: 21, reachable: 8 } },
          };
        if (path.includes("/events/ratings/"))
          return { items: [{ id: "r1", rating: 4, review: "The judging was fair and fast.", user: { full_name: "Asha Menon" }, created_at: "2099-06-10T10:00:00Z" }], total: null };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { api } = await import("@moa/app-kit");
const { render } = await import("@/test/render");
const { EventWorkspace } = await import("./components/event-workspace");
const { RegistrationsPanel } = await import("./components/registrations-panel");
const { eventStatus } = await import("@/features/events");

beforeEach(() => {
  event.patch = {};
  list.page = null;
  url.search = new URLSearchParams();
  url.push.mockClear();
  vi.mocked(api.get).mockClear();
});

describe("event status derivation", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("is live while registration is still open", () => {
    expect(eventStatus({ event_datetime: "2026-07-01T10:00:00Z", duration: 120, reg_enddate: "2026-06-20T00:00:00Z" }, now)).toBe("live");
  });

  it("is live when there is no registration deadline at all", () => {
    expect(eventStatus({ event_datetime: "2026-07-01T10:00:00Z", duration: 120, reg_enddate: null }, now)).toBe("live");
  });

  it("is closed once registration has ended but the event has not run", () => {
    expect(eventStatus({ event_datetime: "2026-07-01T10:00:00Z", duration: 120, reg_enddate: "2026-06-01T00:00:00Z" }, now)).toBe("closed");
  });

  it("is ended once the event itself is over, whatever registration says", () => {
    // Registration nominally still open, but the event ran in May. Reporting
    // "live" here would be the less useful of two true things.
    expect(eventStatus({ event_datetime: "2026-05-01T10:00:00Z", duration: 120, reg_enddate: "2026-12-01T00:00:00Z" }, now)).toBe("ended");
  });

  it("counts duration, so an event mid-session is not yet ended", () => {
    expect(eventStatus({ event_datetime: "2026-06-15T11:00:00Z", duration: 180, reg_enddate: "2026-06-14T00:00:00Z" }, now)).toBe("closed");
  });

  it("treats an unparseable date as not yet ended rather than throwing", () => {
    expect(eventStatus({ event_datetime: "not a date", duration: null, reg_enddate: null }, now)).toBe("live");
  });
});

describe("overview", () => {
  it("renders without throwing", () => {
    expect(() => render(<EventWorkspace eventId={37} />)).not.toThrow();
  });

  it("opens with four figures, each leading where it is acted on", async () => {
    render(<EventWorkspace eventId={37} />);
    // The door figures come from the live summary, the page views from the event.
    expect(await screen.findByRole("link", { name: "Registered: 24. Open the guest list" })).toHaveAttribute("href", "/events/37/attendees");
    expect(screen.getByRole("link", { name: "Checked in: 3. See every check-in" })).toHaveAttribute("href", "/events/37/check-ins");
    expect(screen.getByRole("link", { name: /^Have a ticket: 20\./ })).toHaveAttribute("href", "/events/37/attendees");
    expect(await screen.findByRole("link", { name: "Page views: 234. See which links bring them" })).toHaveAttribute("href", "/events/37/links");
  });

  it("puts what needs attention beside the door, then the curve and the door's panels", async () => {
    render(<EventWorkspace eventId={37} />);
    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("The door")).toBeInTheDocument();
    expect(screen.getByText("Arrival curve")).toBeInTheDocument();
    // The row actions live in the console, not here.
    expect(screen.queryByRole("button", { name: /Add Volunteers/i })).toBeNull();
  });

  it("takes the colleges from total_institutions, not the capped list", async () => {
    // The fixture's top_institutions has 5 entries but 7 distinct colleges.
    render(<EventWorkspace eventId={37} />);
    const heading = await screen.findByText("Where they came from");
    const panel = heading.closest("[data-slot='figure-panel']") as HTMLElement;
    expect(within(panel).getByText("7 colleges")).toBeInTheDocument();
    expect(within(panel).getByText("College of Engineering Trivandrum")).toBeInTheDocument();
    expect(within(panel).getByText(/And 2 more colleges/)).toBeInTheDocument();
  });

  it("names the money and the unpaid for a paid event", async () => {
    event.patch = { has_fee: true, reg_fee: 200 };
    render(<EventWorkspace eventId={37} />);
    expect(await screen.findByRole("link", { name: /^Collected: / })).toHaveAttribute("href", "/events/37/finance");
    expect(await screen.findByRole("link", { name: /24 registrations have not paid/ })).toHaveAttribute("href", "/events/37/attendees?paid=no");
  });

  it("keeps the notification disabled until there is a message, and says who it reaches", async () => {
    render(<EventWorkspace eventId={37} />);
    const send = await screen.findByRole("button", { name: "Send to 10 phones" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "We have moved to Hall B." } });
    expect(send).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: "Checked in" }));
    expect(await screen.findByRole("button", { name: "Send to 2 phones" })).toBeEnabled();
  });

  it("reads what attendees said", async () => {
    render(<EventWorkspace eventId={37} />);
    expect(await screen.findByText("The judging was fair and fast.")).toBeInTheDocument();
    expect(screen.getByText("Asha Menon")).toBeInTheDocument();
    // No average on the event, so the loaded reviews' is shown rather than 0.0.
    expect(screen.getByText("4.0")).toBeInTheDocument();
  });
});

describe("attendees tab", () => {
  it("renders the guest list with its figures, filters, the delivery bar and the import", async () => {
    render(<RegistrationsPanel eventId={37} />);
    expect(await screen.findByRole("button", { name: "Checked in 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not delivered" })).toBeInTheDocument();
    expect(await screen.findByText("NEX25AA001")).toBeInTheDocument();
    expect(await screen.findByText("Test Participant One")).toBeInTheDocument();
    expect(await screen.findByText("Tickets by email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checked in: 3. Show them" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByRole("dialog", { name: "Import a guest list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download the template/ })).toBeInTheDocument();
  });

  it("counts each role on its chip and spells the plural right", async () => {
    render(<RegistrationsPanel eventId={37} />);
    expect(await screen.findByRole("button", { name: "Attendees 22" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speakers 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Staff" })).toBeInTheDocument();
  });

  it("shows the role each person is attending as, treating a missing one as attendee", async () => {
    // The second fixture row deliberately carries no `role`, standing in for a
    // response cached from before the field existed.
    render(<RegistrationsPanel eventId={37} />);
    expect(await screen.findByLabelText("Role for Test Participant One")).toHaveValue("speaker");
    expect(await screen.findByLabelText("Role for Test Participant Two")).toHaveValue("attendee");
  });

  it("filters from a figure: the check-in tile writes the filter to the URL", async () => {
    render(<RegistrationsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Checked in: 3. Show them" }));
    expect(url.push).toHaveBeenCalledWith("/events/37/attendees?in=yes", { scroll: false });
  });

  it("labels the export as what actually downloads, and carries the filters it can", async () => {
    // The design says "Download CSV file"; the endpoint returns an xlsx workbook.
    url.search = new URLSearchParams("in=yes");
    render(<RegistrationsPanel eventId={37} />);
    const link = await screen.findByRole("link", { name: /Export checked in to Excel/ });
    expect(link.getAttribute("href")).toMatch(/\/registration\/37\/export\?is_attended=true$/);
  });

  it("offers payment filters and a payment column for a paid event, and sends the filter to the list", async () => {
    event.patch = { has_fee: true, reg_fee: 200 };
    url.search = new URLSearchParams("paid=no");
    render(<RegistrationsPanel eventId={37} />);
    expect(await screen.findByRole("button", { name: "Unpaid 24" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("columnheader", { name: "Payment" })).toBeInTheDocument();
    const listCall = vi.mocked(api.get).mock.calls.find(([path]) => String(path).includes("/list"));
    expect(listCall?.[1]).toMatchObject({ query: { is_paid: false } });
  });

  it("says nobody matches, with a way out, when the filters leave nobody", async () => {
    url.search = new URLSearchParams("q=zzz&in=no");
    list.page = { items: [], total: 0, limit: 20, offset: 0 };
    render(<RegistrationsPanel eventId={37} />);
    expect(await screen.findByText("Nobody matches")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    // One write clears the filters and the search together.
    expect(url.push).toHaveBeenCalledWith("/events/37/attendees", { scroll: false });
  });

  it("starts an empty list from the import or the desk, not a blank table", async () => {
    list.page = { items: [], total: 0, limit: 20, offset: 0 };
    render(<RegistrationsPanel eventId={37} />);
    expect(await screen.findByText("No guests on the list yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import a list" })).toBeInTheDocument();
  });
});
