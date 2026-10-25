import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * Activity: every admin action from the audit log, newest first, searched
 * by words or filtered by action or by the kind of record it touched. The
 * search and the filters live in the URL, so what is asked of the API is
 * what the address says; the actions offered come from the API, not a list
 * in the code that drifts from it.
 */
let search = "";
const push = vi.fn();
const replace = vi.fn();
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];
let actions: () => unknown = () => ["badge.award", "club.approve", "user.suspend"];

const page = {
  limit: 20,
  offset: 0,
  total: 3,
  next: null,
  // The API searches: it says what for (null: nothing).
  search: null as string | null,
  items: [
    {
      id: 3,
      action: "club.approve",
      summary: "Approved club “Robotics”",
      entity_type: "club",
      entity_id: "12",
      ip_address: "10.0.0.7",
      created_at: "2026-10-20T10:00:00Z",
      actor: { id: 1, full_name: "Platform Owner", email: "owner@example.com", avatar: null },
    },
    {
      // No summary: the bare action is all there is to say.
      id: 2,
      action: "user.suspend",
      summary: null,
      entity_type: "user",
      entity_id: "412",
      ip_address: null,
      created_at: "2026-10-19T10:00:00Z",
      actor: { id: 2, full_name: "Support Desk", email: "support@example.com", avatar: null },
    },
    {
      // The admin has since been deleted: no actor at all, and no record.
      id: 1,
      action: "badge.award",
      summary: "Awarded Regular",
      created_at: "2026-10-18T10:00:00Z",
      actor: null,
    },
  ],
};
let reply: () => unknown = () => page;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/activity",
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        gets.push({ path, query: init?.query });
        if (path === "/api/v1/admin/audit-log") return reply();
        if (path === "/api/v1/admin/audit-log/actions") return actions();
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { default: ActivityPage } = await import("@/app/(dashboard)/activity/page");
const { formatDateTime } = await import("@moa/app-kit");

const logCalls = () => gets.filter((g) => g.path === "/api/v1/admin/audit-log");
const rowOf = async (text: string) => (await screen.findByText(text)).closest("tr")!;
const pick = async (filter: string, option: string) => {
  fireEvent.keyDown(screen.getByRole("combobox", { name: filter }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
};

beforeEach(() => {
  search = "";
  push.mockClear();
  replace.mockClear();
  gets.length = 0;
  reply = () => page;
  actions = () => ["badge.award", "club.approve", "user.suspend"];
});

describe("the activity log", () => {
  it("says what it is, and asks for the first page with no filter", async () => {
    render(<ActivityPage />);
    expect(screen.getByRole("heading", { name: "Activity" })).toBeInTheDocument();
    await screen.findByText("Approved club “Robotics”");
    expect(logCalls()).toEqual([
      { path: "/api/v1/admin/audit-log", query: { action: undefined, entity_type: undefined, entity_id: undefined, q: undefined, offset: 0, limit: 20 } },
    ]);
  });

  it("shows who did what, to which record, from where and when", async () => {
    render(<ActivityPage />);
    const row = await rowOf("Approved club “Robotics”");
    expect(within(row).getByText("Platform Owner")).toBeInTheDocument();
    expect(within(row).getByText("owner@example.com")).toBeInTheDocument();
    expect(within(row).getByText("club.approve")).toBeInTheDocument();
    expect(within(row).getByText("club #12")).toBeInTheDocument();
    expect(within(row).getByText("10.0.0.7")).toBeInTheDocument();
    expect(within(row).getByText(formatDateTime("2026-10-20T10:00:00Z"))).toBeInTheDocument();
    expect(screen.getByText("3 total")).toBeInTheDocument();
  });

  it("falls back to the action when there is no summary, and says plainly when the actor is gone", async () => {
    render(<ActivityPage />);
    const suspended = await rowOf("Support Desk");
    // The action is both the line and its tag.
    expect(within(suspended).getAllByText("user.suspend")).toHaveLength(2);
    expect(within(suspended).getByText("user #412")).toBeInTheDocument();

    const orphan = await rowOf("Awarded Regular");
    expect(within(orphan).getByText("Unknown")).toBeInTheDocument();
    expect(within(orphan).getAllByText("--").length).toBeGreaterThanOrEqual(2);
  });

  it("offers the actions the API reports, and narrows the URL to the one picked", async () => {
    render(<ActivityPage />);
    await screen.findByText("Approved club “Robotics”");
    await pick("Action", "user.suspend");
    expect(push).toHaveBeenCalledWith("/activity?action=user.suspend", { scroll: false });
  });

  it("narrows by the kind of record touched", async () => {
    render(<ActivityPage />);
    await screen.findByText("Approved club “Robotics”");
    await pick("Record type", "Organisations");
    expect(push).toHaveBeenCalledWith("/activity?entity_type=org", { scroll: false });
  });

  it("asks the API for exactly the filters in the address, from the right page", async () => {
    search = "action=club.approve&entity_type=club&page=3";
    render(<ActivityPage />);
    await screen.findByText("Approved club “Robotics”");
    expect(logCalls()[0]!.query).toEqual({
      action: "club.approve",
      entity_type: "club",
      entity_id: undefined,
      q: undefined,
      offset: 40,
      limit: 20,
    });
  });

  it("clears every filter at once, back to the first page", async () => {
    search = "action=club.approve&entity_type=club&page=2";
    render(<ActivityPage />);
    await screen.findByText("Approved club “Robotics”");
    fireEvent.click(screen.getByRole("button", { name: /Clear 2 filters/ }));
    expect(push).toHaveBeenCalledWith("/activity", { scroll: false });
  });

  it("still lists the log when the actions cannot be loaded; only the filter is empty", async () => {
    actions = () => {
      throw new Error("Internal server error");
    };
    render(<ActivityPage />);
    expect(await screen.findByText("Approved club “Robotics”")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Action" })).toBeInTheDocument();
  });

  it("says nothing is recorded yet on an empty log", async () => {
    reply = () => ({ ...page, items: [], total: 0 });
    render(<ActivityPage />);
    expect(await screen.findByText("Nothing recorded yet")).toBeInTheDocument();
    expect(screen.getByText("Admin actions appear here as they happen.")).toBeInTheDocument();
  });

  it("offers nothing to edit or remove: the log is append-only", async () => {
    render(<ActivityPage />);
    const row = await rowOf("Approved club “Robotics”");
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/Append-only — nothing here can be edited or removed/)).toBeInTheDocument();
  });

  it("shows why, when the admin had to say: a session as someone else", async () => {
    reply = () => ({
      ...page,
      items: [
        {
          id: 9,
          action: "user.impersonate",
          summary: "Started a session as robotics@example.com",
          entity_type: "user",
          entity_id: "77",
          details: { target_user_type: "club", reason: "Ticket 4512: cannot publish" },
          created_at: "2026-10-25T10:00:00Z",
          actor: { id: 1, full_name: "Platform Owner", email: "owner@example.com", avatar: null },
        },
        ...page.items,
      ],
    });
    render(<ActivityPage />);
    const row = await rowOf("Started a session as robotics@example.com");
    expect(within(row).getByText("Reason: Ticket 4512: cannot publish")).toBeInTheDocument();
    // Only where a reason was given.
    expect(within(await rowOf("Approved club “Robotics”")).queryByText(/^Reason:/)).toBeNull();
  });
});

describe("searching the activity log", () => {
  const box = () => screen.getByRole("searchbox", { name: "Search who, what, record or reason" });

  it("asks the API for the words in the address, from the page the address says", async () => {
    search = "q=robotics+priya&page=2";
    reply = () => ({ ...page, offset: 20, search: "robotics priya" });
    render(<ActivityPage />);
    await screen.findByText("Approved club “Robotics”");
    expect(logCalls()[0]!.query).toEqual({
      action: undefined, entity_type: undefined, entity_id: undefined, q: "robotics priya", offset: 20, limit: 20,
    });
    expect(box()).toHaveValue("robotics priya");
  });

  it("puts what is typed in the address once typing settles, back on the first page", async () => {
    search = "page=3";
    render(<ActivityPage />);
    await screen.findByText("Approved club “Robotics”");
    fireEvent.change(box(), { target: { value: "club #12" } });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/activity?q=club+%2312", { scroll: false }), { timeout: 2000 });
  });

  it("goes with the filters", async () => {
    search = "q=desk&action=user.suspend";
    render(<ActivityPage />);
    await screen.findByText("Approved club “Robotics”");
    expect(logCalls()[0]!.query).toMatchObject({ action: "user.suspend", q: "desk" });
  });

  it("says nothing matched, and offers to clear the search", async () => {
    search = "q=zebra";
    reply = () => ({ ...page, items: [], total: 0, search: "zebra" });
    render(<ActivityPage />);
    expect(await screen.findByText("No matches")).toBeInTheDocument();
    expect(screen.getByText("Nothing matched “zebra”. Try a different term.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(push).toHaveBeenCalledWith("/activity", { scroll: false });
  });

  it("offers no search box to an API that cannot search, rather than one it would ignore", async () => {
    // An API from before the log could be searched: no `search` in its answer.
    const old: Record<string, unknown> = { ...page };
    delete old.search;
    reply = () => old;
    search = "q=robotics";
    render(<ActivityPage />);
    // Every row, as that API answers whatever the address says, and not
    // presented as what "robotics" matched.
    expect(await screen.findByText("Awarded Regular")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText("No matches")).toBeNull();
    // The filters still work.
    expect(screen.getByRole("combobox", { name: "Action" })).toBeInTheDocument();
  });
});
