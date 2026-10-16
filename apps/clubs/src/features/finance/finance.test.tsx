import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import summaryFixture from "../__fixtures__/finance-summary.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const eventFixture = {
  ...summaryFixture,
  scope: "event",
  figures: { ...summaryFixture.figures, events: null, regs: 186, paying: 180, outstanding: 1500, outstanding_count: 3 },
  by_type: [],
  by_event: [],
  expenses: summaryFixture.expenses.slice(0, 2),
  attention: { at_a_loss: [], owed: [{ id: 37, name: "Hack Night 04", outstanding: 1500, outstanding_count: 3 }], unlogged: [] },
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, opts?: { query?: Record<string, string> }) => {
        calls.push({ method: "GET", path, body: opts?.query });
        if (path.endsWith("/clubs/finance")) return summaryFixture;
        if (/\/events\/37\/finance$/.test(path)) return eventFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        return { ...summaryFixture.expenses[0], id: "e9", ...(body as object) };
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return { ...summaryFixture.expenses[0], ...(body as object) };
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { FinancePage } = await import("./components/finance-page");
const { short, rupees } = await import("./components/money");
const { financeSummarySchema, periodLabel, periodRange } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
});

describe("finance", () => {
  it("parses the summary and formats the helpers", () => {
    const s = financeSummarySchema.parse(summaryFixture);
    expect(s.by_event).toHaveLength(6);
    expect(s.figures.events?.conducted).toBe(14);
    expect(s.by_category[0]?.category).toBe("venue");
    expect(s.attention.owed[0]?.name).toBe("Hack Night 04");
    expect(periodLabel("2026-07-01", "2026-11-30")).toBe("Jul to Nov 2026");
    expect(periodLabel("2025-11-01", "2026-04-30")).toBe("Nov 2025 to Apr 2026");
    expect(short(18900)).toBe("₹18.9k");
    expect(short(197046)).toBe("₹1.97L");
    expect(short(-424)).toBe("−₹424");
    expect(rupees(-150)).toBe("−₹150");
    const today = new Date("2026-10-12T10:00:00Z");
    expect(periodRange("month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("3m", today)).toEqual({ from: "2026-09-01", to: "2026-11-30" });
    expect(periodRange("6m", today)).toEqual({});
  });

  it("reads the season: the line, four figures, what is owed, the months, where it went and came from, each type and each event", async () => {
    render(<FinancePage scope={{ kind: "club" }} />);
    expect(await screen.findByText("₹1,97,046 in · ₹86,424 out · ₹1,09,772 net · Jul to Nov 2026 · 14 events held")).toBeInTheDocument();
    expect(screen.getByText("Net surplus")).toBeInTheDocument();
    expect(screen.getByText("₹1,09,772")).toBeInTheDocument();
    expect(screen.getByText("₹1,97,046 in · ₹86,424 out · 56% kept")).toBeInTheDocument();
    expect(screen.getByText(/\+3% vs prior/)).toBeInTheDocument();
    expect(screen.getByText("₹1,80,196 online · ₹16,000 at the door · ₹850 refunded")).toBeInTheDocument();
    expect(screen.getByText("23 entries · most on venue, ₹42,000")).toBeInTheDocument();
    expect(screen.getByText("Still owed")).toBeInTheDocument();
    expect(screen.getByText("9 unpaid at 4 paid events")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Still owed/ })).toHaveAttribute("href", "/events/37/attendees");
    expect(screen.getByText(/₹4,500 is still owed by 9 guests at Hack Night 04/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Money in and out by month" })).toBeInTheDocument();
    expect(screen.getByText(/Best month: Oct, ₹37,400/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Venue spend" })).toHaveAttribute("aria-valuenow", "42000");
    expect(screen.getByRole("progressbar", { name: "Cash at the door income" })).toHaveAttribute("aria-valuenow", "16000");
    expect(screen.getByRole("progressbar", { name: "Hackathon income" })).toHaveAttribute("aria-valuenow", "108866");
    expect(screen.getByText("Club overheads")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Drone Build Weekend finance" })).toHaveAttribute("href", "/events/48/finance");
    expect(screen.getAllByText(/₹500 a ticket/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Upcoming").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Closed")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Export statement/ })).toHaveAttribute("href", expect.stringContaining("/api/v1/clubs/finance/statement.csv"));
    expect(screen.getByText("Midnight pizza")).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/v1/clubs/finance" });

    // The chips narrow the events to the ones held.
    fireEvent.click(screen.getByRole("button", { name: "Held 2" }));
    expect(screen.queryByRole("link", { name: "Drone Build Weekend finance" })).toBeNull();
    expect(screen.getByRole("link", { name: "Hack Night 04 finance" })).toBeInTheDocument();
    // And the ledger to one category.
    fireEvent.click(screen.getByRole("button", { name: "Food & drink 9" }));
    expect(screen.queryByText("Venue hire")).toBeNull();
    expect(screen.getByText("Midnight pizza")).toBeInTheDocument();
  });

  it("logs an expense in a dialog, and refuses one without a title", async () => {
    render(<FinancePage scope={{ kind: "club" }} />);
    await screen.findByText("Net surplus");
    fireEvent.click(screen.getAllByRole("button", { name: "Log expense" })[0]!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save expense" }));
    expect(await within(dialog).findByText("Say what the money went on")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    fireEvent.change(within(dialog).getByLabelText("What it went on"), { target: { value: "Banner print" } });
    fireEvent.change(within(dialog).getByLabelText("Category"), { target: { value: "printing" } });
    fireEvent.change(within(dialog).getByLabelText("Amount · ₹"), { target: { value: "1200" } });
    fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: "2026-10-10" } });
    fireEvent.change(within(dialog).getByLabelText("Against"), { target: { value: "37" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save expense" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      path: "/api/v1/clubs/finance/expenses",
      body: { title: "Banner print", category: "printing", amount: 1200, incurred_on: "2026-10-10", event_id: 37, note: null },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("corrects an entry in the same dialog, and removes one after asking twice", async () => {
    render(<FinancePage scope={{ kind: "club" }} />);
    await screen.findByText("Midnight pizza");
    fireEvent.click(screen.getByRole("button", { name: "Edit Midnight pizza" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Correct “Midnight pizza”")).toBeInTheDocument();
    expect((within(dialog).getByLabelText("What it went on") as HTMLInputElement).value).toBe("Midnight pizza");
    fireEvent.change(within(dialog).getByLabelText("Amount · ₹"), { target: { value: "6500" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/clubs/finance/expenses/e2", body: { amount: 6500, event_id: 37 } });

    fireEvent.click(screen.getByRole("button", { name: "Remove Domain renewal" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm removing Domain renewal" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")).toMatchObject({ path: "/api/v1/clubs/finance/expenses/e3" });
  });

  it("shows one event's own ledger without a period, and where it stands", async () => {
    render(<FinancePage scope={{ kind: "event", eventId: 37 }} />);
    expect(await screen.findByText("₹1,97,046 in · ₹86,424 out · ₹1,09,772 net · 180 of 186 guests paid")).toBeInTheDocument();
    expect(screen.queryByLabelText("Period")).not.toBeInTheDocument();
    expect(screen.getByText("Where it stands")).toBeInTheDocument();
    expect(screen.getByText("3 unpaid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Still owed/ })).toHaveAttribute("href", "/events/37/attendees");
    expect(screen.getByRole("link", { name: /Export statement/ })).toHaveAttribute("href", expect.stringContaining("/api/v1/events/37/finance/statement.csv"));
    fireEvent.click(screen.getAllByRole("button", { name: "Log expense" })[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("Against")).not.toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/v1/events/37/finance" });
  });
});
