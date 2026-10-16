import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

const page = {
  items: [
    { id: "a1", kind: "announcement", title: "Doors open at 5", body: "Come early", event_id: 37, event: { id: 37, name: "SF Sea Hackathon", starts_at: "2099-06-10T08:00:00+00:00" }, audience: "all", sent: 24, read: 12, read_quickly: 9, read_pct: 50, slot: "morning", created_at: "2099-06-09T08:00:00+00:00" },
    { id: "l1", kind: "live_update", title: "SF Sea Hackathon", body: "Demos move to Lab 3B", event_id: 37, event: { id: 37, name: "SF Sea Hackathon", starts_at: null }, audience: "checked_in", sent: 2, read: 0, read_quickly: 0, read_pct: 0, slot: "evening", created_at: "2099-06-08T08:00:00+00:00" },
  ],
  total: 2,
  limit: 20,
  offset: 0,
  counts: { all: 2, announcements: 1, live_updates: 1 },
};
const insights = {
  sends: 2, sends_delta: 1, reached: 26, reached_delta: 10, open_rate: 46, open_rate_prev: 30, quick_rate: 35, last_sent_at: "2099-06-09T08:00:00+00:00",
  best: { id: "a1", title: "Doors open at 5", read_pct: 50, sent: 24 },
  slots: [{ key: "morning", label: "Morning · 6–12", sends: 2, open_rate: 46 }, { key: "afternoon", label: "Afternoon · 12–5", sends: 0, open_rate: null }, { key: "evening", label: "Evening · 5–9", sends: 1, open_rate: 0 }, { key: "night", label: "Night · 9–6", sends: 0, open_rate: null }],
  best_slot: "morning",
  coming: [{ id: 37, name: "SF Sea Hackathon", starts_at: "2099-06-10T08:00:00+00:00", registered: 148, reachable: 120 }],
  registered_ahead: 148, reachable_ahead: 120, all_time: { sends: 2, reached: 26, opened: 12 }, generated_at: "2099-06-09T09:00:00+00:00",
};
const responses: { page: unknown } = { page };

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, usePathname: () => "/announcements", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams() };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/clubs/notifications/page")) return responses.page;
        if (path.endsWith("/clubs/notifications/insights")) return insights;
        if (path.includes("/clubs/events/list")) return { items: [], total: 0, limit: 100, offset: 0 };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { AnnouncementsPage } = await import("./components/announcements-page");

describe("the announcements page", () => {
  it("reads the month, when a push lands, who can be reached, and each send with who opened it", async () => {
    render(<AnnouncementsPage />);
    expect(await screen.findByText(/2 pushes in 30 days · 26 phones reached · 46% opened/)).toBeInTheDocument();
    expect(screen.getByText("35% within the hour")).toBeInTheDocument();
    expect(screen.getByText("best: Morning")).toBeInTheDocument();
    expect(screen.getByText("120 of 148 reachable")).toBeInTheDocument();
    expect(screen.getByText("Most opened")).toBeInTheDocument();
    const row = screen.getByText("Doors open at 5", { selector: "span" }).closest("li")!;
    expect(within(row).getByText("12 of 24 opened")).toBeInTheDocument();
    expect(within(row).getByText("9 within the hour")).toBeInTheDocument();
    expect(within(row).getByText("Everyone registered")).toBeInTheDocument();
    const live = screen.getByText("Demos move to Lab 3B").closest("li")!;
    expect(within(live).getByTitle("Live update")).toBeInTheDocument();
    expect(within(live).getByText("not opened yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Live updates 1/ })).toBeInTheDocument();
  });

  it("says so when nothing has been pushed", async () => {
    responses.page = { items: [], total: 0, limit: 20, offset: 0, counts: {} };
    render(<AnnouncementsPage />);
    expect(await screen.findByText("Nothing pushed yet")).toBeInTheDocument();
  });
});
