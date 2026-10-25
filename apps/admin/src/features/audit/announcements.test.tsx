import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

/**
 * The Announcements log: everything clubs pushed to their followers' phones,
 * across every club, one row per send. It is the only place the platform's
 * pushes can be reviewed, and a push cannot be recalled -- so it reads, and
 * offers nothing that looks like it could undo one.
 */
let search = "";
const push = vi.fn();
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];

const sent = (over: Record<string, unknown>) => ({
  title: "Hack Night opens at 6",
  description: "Doors at 6, bring your laptop.",
  event_id: 37,
  event_name: "Hack Night",
  club_name: "TinkerHub",
  sent_count: 120,
  read_count: 66,
  created_at: "2026-10-20T10:00:00Z",
  ...over,
});
const page = {
  limit: 20,
  offset: 0,
  total: 3,
  next: null,
  items: [
    sent({}),
    // Pushed to the club's followers, not about an event; read by fewer than half.
    sent({ title: "We moved!", description: "New room: B-204.", event_id: null, event_name: null, club_name: "IEDC CET", sent_count: 40, read_count: 10, created_at: "2026-10-19T08:00:00Z" }),
    // Sent to nobody: no "NaN% read".
    sent({ title: "Test push", description: null, club_name: null, event_name: null, sent_count: 0, read_count: 0, created_at: "2026-10-18T08:00:00Z" }),
  ],
};
let reply: () => unknown = () => page;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/announcements",
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        gets.push({ path, query: init?.query });
        if (path === "/api/v1/admin/notifications") return reply();
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { default: AnnouncementsPage } = await import("@/app/(dashboard)/announcements/page");
const { formatDateTime } = await import("@moa/app-kit");

const rowOf = async (title: string) => (await screen.findByText(title)).closest("tr")!;

beforeEach(() => {
  search = "";
  push.mockClear();
  gets.length = 0;
  reply = () => page;
});

describe("the announcements log", () => {
  it("says what it holds and that a push cannot be recalled, and asks for the first page", async () => {
    render(<AnnouncementsPage />);
    expect(screen.getByRole("heading", { name: "Announcements" })).toBeInTheDocument();
    expect(screen.getByText(/These cannot be recalled/)).toBeInTheDocument();
    await screen.findByText("Hack Night opens at 6");
    expect(gets).toEqual([{ path: "/api/v1/admin/notifications", query: { offset: 0, limit: 20 } }]);
  });

  it("shows each send: the message, the club and event it came from, its reach and when", async () => {
    render(<AnnouncementsPage />);
    const row = await rowOf("Hack Night opens at 6");
    expect(within(row).getByText("Doors at 6, bring your laptop.")).toBeInTheDocument();
    expect(within(row).getByText("TinkerHub")).toBeInTheDocument();
    expect(within(row).getByText("Hack Night")).toBeInTheDocument();
    expect(within(row).getByText("120 sent")).toBeInTheDocument();
    // 66 of 120.
    expect(within(row).getByText("55% read")).toBeInTheDocument();
    expect(within(row).getByText(formatDateTime("2026-10-20T10:00:00Z"))).toBeInTheDocument();
    expect(screen.getByText("3 total")).toBeInTheDocument();
  });

  it("lists a push to a club's followers that is not about any event", async () => {
    render(<AnnouncementsPage />);
    const row = await rowOf("We moved!");
    expect(within(row).getByText("IEDC CET")).toBeInTheDocument();
    expect(within(row).getByText("40 sent")).toBeInTheDocument();
    expect(within(row).getByText("25% read")).toBeInTheDocument();
  });

  it("reads a send that reached nobody as 0% read, not a broken figure", async () => {
    render(<AnnouncementsPage />);
    const row = await rowOf("Test push");
    expect(within(row).getByText("0 sent")).toBeInTheDocument();
    expect(within(row).getByText("0% read")).toBeInTheDocument();
    expect(within(row).getByText("--")).toBeInTheDocument();
  });

  it("asks for the page in the address", async () => {
    search = "page=2";
    reply = () => ({ ...page, offset: 20, total: 45 });
    render(<AnnouncementsPage />);
    await screen.findByText("Hack Night opens at 6");
    expect(gets[0]!.query).toEqual({ offset: 20, limit: 20 });
  });

  it("moves to the next page through the address", async () => {
    reply = () => ({ ...page, total: 45 });
    render(<AnnouncementsPage />);
    await screen.findByText("Hack Night opens at 6");
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(push).toHaveBeenCalledWith("/announcements?page=2", { scroll: false });
  });

  it("offers nothing that could recall or change a push", async () => {
    render(<AnnouncementsPage />);
    const row = await rowOf("Hack Night opens at 6");
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
    expect(within(row).queryAllByRole("link")).toHaveLength(0);
  });

  it("says nothing has been sent yet on an empty log", async () => {
    reply = () => ({ ...page, items: [], total: 0 });
    render(<AnnouncementsPage />);
    expect(await screen.findByText("Nothing sent yet")).toBeInTheDocument();
    expect(screen.getByText("Announcements clubs push to their followers appear here.")).toBeInTheDocument();
  });

  it("says the log could not be loaded when the request fails", async () => {
    reply = () => {
      throw new Error("Internal server error");
    };
    render(<AnnouncementsPage />);
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing sent yet")).toBeNull();
  });
});
