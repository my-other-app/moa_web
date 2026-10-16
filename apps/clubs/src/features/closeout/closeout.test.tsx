import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import eventDetail from "../__fixtures__/event-detail.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];

// Long over, so the clock-dependent steps read as after the event.
const STARTS = "2025-10-10T12:00:00Z";
const ENDS = "2025-10-10T18:00:00Z";

const settings = {
  status: "live",
  status_clock: true,
  retention_mode: "keep",
  retention_hours: 48,
  report_recipients: ["chair@example.com"],
  keep_contacts: true,
  starts_at: STARTS,
  ends_at: ENDS,
  statuses: [
    { key: "draft", label: "Draft", note: "Only the club sees it." },
    { key: "published", label: "Published", note: "Open for registration." },
    { key: "live", label: "Live", note: "The door is open." },
    { key: "closed", label: "Closed", note: "Locked; the door is shut." },
    { key: "archived", label: "Archived", note: "Put away." },
  ],
};
const figures = {
  event_name: "SF Sea Hackathon",
  org_name: "Circuit Society",
  venue: "Hall B",
  starts_at: STARTS,
  ends_at: ENDS,
  registered: 120,
  checked_in: 92,
  turnout_pct: 77,
  no_shows: 28,
  by_role: [
    { role: "attendee", label: "Attendees", registered: 100, checked_in: 80 },
    { role: "speaker", label: "Speakers", registered: 20, checked_in: 12 },
  ],
  by_via: [
    { via: "scan", label: "Scanned at the gate", count: 70 },
    { via: "self", label: "Self check-in", count: 22 },
  ],
  walk_ins: 6,
  with_phone: 80,
  merch: [{ name: "Hack Night tee", collected: 30, total: 40 }],
  messages: [{ subject: "See you tonight", audience: "registered", sent: 118, failed: 2, skipped: 0 }],
  certificates_issued: 48,
  cards_printed: 84,
  rating_avg: 4.4,
  rating_count: 31,
};
const reports = [{ id: "rep1", filename: "sf-sea-hackathon-closeout.pdf", figures: {}, generated_at: "2025-10-11T09:00:00Z", generated_by_name: "Circuit Society", delivered_to: [] }];
const retention = {
  event_id: 37,
  mode: "keep",
  state: "pending",
  run_at: "2025-10-12T18:00:00Z",
  attempts: 0,
  last_error: null,
  refusal: null,
  refused_at: null,
  completed_at: null,
  deleted: null,
  recipients: ["chair@example.com"],
  preview: { walkups: 6, phones: 80 },
  keeps_contacts: true,
  contacts_kept: 0,
  ended: true,
  ends_at: ENDS,
};
const finance = {
  scope: "event",
  period: { start: "2025-10-10", end: "2025-10-10" },
  figures: { events: null, regs: 120, paying: 100, gross: 45000, tickets: 45000, refunds: 0, refund_count: 0, expenses: 12000, expense_count: 4, net: 33000, outstanding: 1500, outstanding_count: 3, avg_ticket: 450 },
  deltas: { gross: null, tickets: null, refunds: null, expenses: null, net: null },
  by_month: [],
  by_type: [],
  by_event: [],
  expenses: [],
  categories: [],
  generated_at: "2025-10-11T00:00:00Z",
};
const certificates = { issued: 48, revoked: 0, attended: 92, registrations: 120, outdated: 0, design_version: 2, channels: [{ channel: "email", sent: 40, failed: 0, skipped: 0, pending: 0, unsent: 8 }] };
const feedback = { auto_send: false, delay_minutes: 60, questions: [], sent_at: null, sent_count: 0, sends_at: null, results: { responses: 0, invited: 0, nps: null, averages: [], texts: [] }, previous: null, checked_in: 92 };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/closeout/settings")) return settings;
        if (path.endsWith("/closeout/figures")) return figures;
        if (path.endsWith("/closeout/reports")) return reports;
        if (path.endsWith("/closeout/retention")) return retention;
        if (path.endsWith("/37/finance")) return finance;
        if (path.endsWith("/certificates/summary")) return certificates;
        if (path.endsWith("/live/feedback")) return feedback;
        if (path.includes("/events/info/")) return eventDetail;
        throw new Error(`unstubbed GET ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return { ...settings, ...(body as object) };
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/retention/run")) return { state: "deleted", refusal: null, error: null, deleted: { phones: 80 } };
        return reports[0];
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { CloseoutPage } = await import("./components/closeout-page");

let open: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  calls.length = 0;
  open = vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => open.mockRestore());

describe("closeout", () => {
  it("leads with the night's four figures", async () => {
    render(<CloseoutPage eventId={37} />);
    expect(await screen.findByText("77%")).toBeInTheDocument();
    expect(screen.getByText("92 of 120 checked in · 28 no-shows")).toBeInTheDocument();
    expect(screen.getByText("4.4")).toBeInTheDocument();
    expect(await screen.findByText("₹33,000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Net: ₹33,000\. Open finance/ })).toHaveAttribute("href", "/events/37/finance");
  });

  it("works down the list after the event, each step saying where it stands", async () => {
    render(<CloseoutPage eventId={37} />);
    expect(await screen.findByText("Attendance is final")).toBeInTheDocument();
    expect(await screen.findByText("₹1,500 is still owed by 3 guests. It will not arrive by itself.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See who" })).toHaveAttribute("href", "/events/37/attendees");
    expect(await screen.findByText("48 issued · 8 not sent yet.")).toBeInTheDocument();
    expect(await screen.findByText("Feedback is in")).toBeInTheDocument();
    expect(screen.getByText("The report is kept")).toBeInTheDocument();
    expect(await screen.findByText("Guest data is kept")).toBeInTheDocument();
    expect(screen.getByText("4 of 7 done")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "4 of 7 closeout steps done" })).toHaveAttribute("aria-valuenow", "4");
  });

  it("closes the event as the one primary action once it is over", async () => {
    render(<CloseoutPage eventId={37} />);
    const close = await screen.findByRole("button", { name: "Close the event" });
    expect(close).toHaveClass("btn-primary");
    fireEvent.click(close);
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/events/37/closeout/settings", body: { status: "closed" } }));
  });

  it("downloads the latest report from the list and from its panel", async () => {
    render(<CloseoutPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Download sf-sea-hackathon-closeout.pdf" }));
    expect(open).toHaveBeenLastCalledWith("/api/gateway/api/v1/events/37/closeout/reports/rep1.pdf", "_blank", "noopener");
    fireEvent.click(screen.getByRole("button", { name: "Generate now" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/api/v1/events/37/closeout/reports" }));
  });

  it("reads the night in figures before the report is made", async () => {
    render(<CloseoutPage eventId={37} />);
    expect(await screen.findByText("80 of 100")).toBeInTheDocument();
    expect(screen.getByText("Scanned at the gate")).toBeInTheDocument();
    expect(screen.getByText("6 registered at the door")).toBeInTheDocument();
    expect(screen.getByText("30 of 40 collected")).toBeInTheDocument();
    expect(screen.getByText("118 · 2 failed")).toBeInTheDocument();
  });

  it("moves the status by hand and takes it off the clock", async () => {
    render(<CloseoutPage eventId={37} />);
    const group = await screen.findByRole("radiogroup", { name: "Status" });
    expect(within(group).getByRole("radio", { name: /^Live/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(group).getByRole("radio", { name: /^Archived/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ body: { status: "archived" } }));
    calls.length = 0;
    fireEvent.click(screen.getByRole("switch", { name: "Status clock" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ body: { status_clock: false } }));
  });

  it("scrubs the guest data only once the slug is typed", async () => {
    render(<CloseoutPage eventId={37} />);
    await screen.findByText("Guest data is kept");
    fireEvent.click(await screen.findByRole("button", { name: "Scrub the guest data now" }));
    const dialog = await screen.findByRole("dialog");
    const go = within(dialog).getByRole("button", { name: "Scrub guest data" });
    expect(go).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Type the event slug to confirm"), { target: { value: "sf-sea-hackathon-9f21a" } });
    expect(go).toBeEnabled();
    fireEvent.click(go);
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/retention/run"))).toMatchObject({ body: { confirm_slug: "sf-sea-hackathon-9f21a" } }));
  });
});
