import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import summaryFixture from "../__fixtures__/finance-summary.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const eventFixture = { ...summaryFixture, scope: "event", figures: { ...summaryFixture.figures, events: null, regs: 186, paying: 180 }, by_type: [], by_event: [], expenses: summaryFixture.expenses.slice(0, 2) };

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
const { short } = await import("./components/finance-page");
const { financeSummarySchema, periodLabel, periodRange } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
});

describe("finance", () => {
  it("parses the summary and formats the helpers", () => {
    const s = financeSummarySchema.parse(summaryFixture);
    expect(s.by_event).toHaveLength(6);
    expect(s.figures.events?.conducted).toBe(14);
    expect(periodLabel("2026-07-01", "2026-11-30")).toBe("Jul to Nov 2026");
    expect(periodLabel("2025-11-01", "2026-04-30")).toBe("Nov 2025 to Apr 2026");
    expect(short(18900)).toBe("₹18.9k");
    expect(short(197046)).toBe("₹1.97L");
    expect(short(-424)).toBe("−₹424");
    const today = new Date("2026-10-12T10:00:00Z");
    expect(periodRange("month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("3m", today)).toEqual({ from: "2026-09-01", to: "2026-11-30" });
    expect(periodRange("6m", today)).toEqual({});
  });

  it("reads the club's season: tiles, months, types and the table", async () => {
    render(<FinancePage scope={{ kind: "club" }} />);
    expect(await screen.findByText("Events conducted")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText(/\+13%/)).toBeInTheDocument();
    expect(screen.getByText("+6 upcoming")).toBeInTheDocument();
    expect(screen.getByText("Gross income")).toBeInTheDocument();
    expect(screen.getByText("₹1,97,046")).toBeInTheDocument();
    expect(screen.getByText("Net surplus")).toBeInTheDocument();
    expect(screen.getByText("₹1,09,772")).toBeInTheDocument();
    expect(screen.getByText("9 unpaid at paid events")).toBeInTheDocument();
    expect(screen.getByText(/Jul to Nov 2026/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Tickets and expenses by month" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Hackathon tickets" })).toHaveAttribute("aria-valuenow", "108866");
    expect(screen.getByText("Club overheads")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Drone Build Weekend" })).toHaveAttribute("href", "/events/48/finance");
    expect(screen.getAllByText("Upcoming").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Closed")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Export statement/ })).toHaveAttribute("href", expect.stringContaining("/api/v1/clubs/finance/statement.csv"));
    expect(screen.getByText("Midnight pizza")).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/v1/clubs/finance" });
  });

  it("logs an expense against the club, and refuses one without a title", async () => {
    render(<FinancePage scope={{ kind: "club" }} />);
    await screen.findByText("Events conducted");
    fireEvent.click(screen.getByRole("button", { name: "Log expense" }));
    expect(await screen.findByText("Say what the money went on")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    fireEvent.change(screen.getByLabelText("What it went on"), { target: { value: "Banner print" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "printing" } });
    fireEvent.change(screen.getByLabelText("Amount · ₹"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-10" } });
    fireEvent.change(screen.getByLabelText("Against"), { target: { value: "37" } });
    fireEvent.click(screen.getByRole("button", { name: "Log expense" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      path: "/api/v1/clubs/finance/expenses",
      body: { title: "Banner print", category: "printing", amount: 1200, incurred_on: "2026-10-10", event_id: 37, note: null },
    });
  });

  it("edits and removes an entry, the removal asking twice", async () => {
    render(<FinancePage scope={{ kind: "club" }} />);
    await screen.findByText("Midnight pizza");
    fireEvent.click(screen.getByRole("button", { name: "Edit Midnight pizza" }));
    expect((screen.getByLabelText("What it went on") as HTMLInputElement).value).toBe("Midnight pizza");
    fireEvent.change(screen.getByLabelText("Amount · ₹"), { target: { value: "6500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/clubs/finance/expenses/e2", body: { amount: 6500, event_id: 37 } });

    fireEvent.click(screen.getByRole("button", { name: "Remove Domain renewal" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm removing Domain renewal" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")).toMatchObject({ path: "/api/v1/clubs/finance/expenses/e3" });
  });

  it("shows one event's own ledger without a period", async () => {
    render(<FinancePage scope={{ kind: "event", eventId: 37 }} />);
    expect(await screen.findByText("Paying guests")).toBeInTheDocument();
    expect(screen.getByText("180")).toBeInTheDocument();
    expect(screen.queryByLabelText("Period")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Against")).not.toBeInTheDocument();
    expect(screen.getByText("Where it stands")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Export statement/ })).toHaveAttribute("href", expect.stringContaining("/api/v1/events/37/finance/statement.csv"));
    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/v1/events/37/finance" });
  });
});
