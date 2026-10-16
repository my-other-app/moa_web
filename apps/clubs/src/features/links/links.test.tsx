import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import overviewFixture from "../__fixtures__/links-overview.json";
import summaryFixture from "../__fixtures__/links-summary.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];

const detail = {
  id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Freshers fair QR", code: "x7k2m9pq", url: "https://api.myotherapp.in/l/x7k2m9pq", destination: "https://events.myotherapp.in/37?utm_source=poster_qr&utm_medium=print&ref=x7k2m9pq",
  clicks: 960, uniques: 900, first_click_at: "2099-06-01T05:00:00+00:00", last_click_at: "2099-06-09T07:00:00+00:00",
  series: [{ date: "2099-06-07", clicks: 500 }, { date: "2099-06-08", clicks: 300 }, { date: "2099-06-09", clicks: 160 }],
  devices: [{ device: "phone", clicks: 900 }, { device: "desktop", clicks: 60 }],
  referrers: [{ referrer: "Direct · app or typed", clicks: 940 }, { referrer: "Instagram", clicks: 20 }],
  hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, clicks: h === 18 ? 400 : h > 8 && h < 22 ? 40 : 0 })),
  created_at: "2099-05-20T08:00:00+00:00", generated_at: "2099-06-09T09:05:00+00:00",
};

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/clubs/links/overview")) return overviewFixture;
        if (path.endsWith("/events/37/links/overview")) return { ...overviewFixture, scope: "event", links: overviewFixture.links.filter((l) => l.target.kind === "event"), totals: { ...overviewFixture.totals, links: 2 } };
        if (path.endsWith("/links/aaaaaaaa-0000-0000-0000-000000000001/detail")) return detail;
        if (path.endsWith("/clubs/events/list")) return { items: [{ id: 37, name: "Hack Night 04", event_datetime: "2099-06-20T13:30:00+00:00" }], total: 1, limit: 100, offset: 0 };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        return { ...summaryFixture.links[0], id: "aaaaaaaa-0000-0000-0000-000000000009", name: "Instagram story", code: "n3wl1nk2", url: "https://api.myotherapp.in/l/n3wl1nk2", clicks: 0, uniques: 0, conversions: 0, rate: 0, second: 0 };
      }),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { LinksPage } = await import("./components/links-page");
const { linksOverviewSchema, linksSummarySchema } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
});

describe("tracking links", () => {
  it("parses the old summary and the overview", () => {
    expect(linksSummarySchema.parse(summaryFixture).links).toHaveLength(3);
    const o = linksOverviewSchema.parse(overviewFixture);
    expect(o.links[1]?.target.kind).toBe("club");
    expect(o.totals.best_link?.name).toBe("Freshers fair QR");
  });

  it("reads the period, the channels, the unshared link and every link the club made, wherever it points", async () => {
    render(<LinksPage scope={{ kind: "club" }} />);
    expect(await screen.findByText(/3 links · 3,100 opened in 30 days · 429 sign-ups came through them/)).toBeInTheDocument();
    expect(screen.getByText("Opened, 30 days")).toBeInTheDocument();
    expect(screen.getByText("3,100")).toBeInTheDocument();
    expect(screen.getByText(/\+11% vs prior/)).toBeInTheDocument();
    expect(screen.getByText("Sign-ups from links")).toBeInTheDocument();
    expect(screen.getByText("188 follows · 241 registrations")).toBeInTheDocument();
    expect(screen.getByText("13.8%")).toBeInTheDocument();
    expect(screen.getByText("48% of all sign-ups came by a link")).toBeInTheDocument();
    expect(screen.getByText("Best link")).toBeInTheDocument();
    expect(screen.getByText(/“Notice board” has never been opened/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Openings by day" })).toBeInTheDocument();
    expect(screen.getByText(/Busiest day: 7 June, 900 opened/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Poster QR sign-ups" })).toHaveAttribute("aria-valuenow", "241");
    expect(screen.getByText(/465 of 894 sign-ups in this period came without a link/)).toBeInTheDocument();
    // Every link, with where it points.
    expect(screen.getByRole("button", { name: "Open Instagram bio" })).toBeInTheDocument();
    expect(screen.getByText("Club page", { selector: "span.block" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Hack Night 04" })).toHaveLength(2);
    expect(screen.getByText("241 registrations")).toBeInTheDocument();
    expect(screen.getByText("188 follows")).toBeInTheDocument();
    expect(screen.getByText("registered later")).toBeInTheDocument();
    expect(screen.getByText("never opened")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "GET" && c.path === "/api/v1/clubs/links/overview")).toBe(true);

    // The chips narrow to the links of one kind.
    fireEvent.click(screen.getByRole("button", { name: "Club page 1" }));
    expect(screen.queryByRole("button", { name: "Open Freshers fair QR" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All 3" }));
    expect(screen.getByRole("button", { name: "Open Freshers fair QR" })).toBeInTheDocument();
  });

  it("opens a link under its row: QR, days, devices and where the openings came from", async () => {
    render(<LinksPage scope={{ kind: "club" }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Freshers fair QR" }));
    expect(await screen.findByText("Short link · share this")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Openings of Freshers fair QR by day" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Phone openings" })).toHaveAttribute("aria-valuenow", "900");
    expect(screen.getByRole("progressbar", { name: "Instagram openings" })).toHaveAttribute("aria-valuenow", "20");
    expect(screen.getByText(/most at 18:00–19:00/)).toBeInTheDocument();
    expect(await screen.findByAltText("QR code for https://api.myotherapp.in/l/x7k2m9pq")).toHaveAttribute("src", "data:image/png;base64,QR");
    expect(calls.some((c) => c.path === "/api/v1/events/37/links/aaaaaaaa-0000-0000-0000-000000000001/detail")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close Freshers fair QR" }));
    expect(screen.queryByText("Short link · share this")).toBeNull();
  });

  it("makes a link in a dialog: where it points, a name and a source, the medium following the source", async () => {
    render(<LinksPage scope={{ kind: "club" }} />);
    await screen.findByText("Opened, 30 days");
    fireEvent.click(screen.getByRole("button", { name: "New link" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /An event/ }));
    fireEvent.change(await within(dialog).findByLabelText("Event"), { target: { value: "37" } });
    fireEvent.change(within(dialog).getByLabelText("Name it (only you see this)"), { target: { value: "Instagram story" } });
    fireEvent.change(within(dialog).getByLabelText("Source · utm_source"), { target: { value: "poster_qr" } });
    expect((within(dialog).getByLabelText("Medium · utm_medium") as HTMLSelectElement).value).toBe("print");
    expect((within(dialog).getByLabelText("Campaign · utm_campaign") as HTMLInputElement).value).toBe("event-37");
    fireEvent.click(within(dialog).getByRole("button", { name: /Save link/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      path: "/api/v1/events/37/links",
      body: { name: "Instagram story", utm_source: "poster_qr", utm_medium: "print", utm_campaign: "event-37", utm_content: null },
    });
    expect(await screen.findByText("Your link is ready")).toBeInTheDocument();
    expect(screen.getByText("https://api.myotherapp.in/l/n3wl1nk2")).toBeInTheDocument();
    expect(await screen.findByAltText("QR code for https://api.myotherapp.in/l/n3wl1nk2")).toBeInTheDocument();
  });

  it("refuses a link with no name, and an event link with no event", async () => {
    render(<LinksPage scope={{ kind: "club" }} />);
    await screen.findByText("Opened, 30 days");
    fireEvent.click(screen.getByRole("button", { name: "New link" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /An event/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Save link/ }));
    expect(await within(dialog).findByText("Name the link so you know where it went")).toBeInTheDocument();
    expect(within(dialog).getByText("Pick the event the link points to")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("on one event, shows only that event's links and no target column", async () => {
    render(<LinksPage scope={{ kind: "event", eventId: 37 }} />);
    expect(await screen.findByText(/2 links · 3,100 opened in 30 days · 429 registrations came through them/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Instagram bio" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Club page/ })).toBeNull();
    expect(screen.getByText("Registrations from links")).toBeInTheDocument();
    expect(screen.getByText("158 of them checked in")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "GET" && c.path === "/api/v1/events/37/links/overview")).toBe(true);
  });
});
