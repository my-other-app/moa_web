import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * Admin notifications against the backend's contract:
 * GET /admin/notifications?unread=&kind=&offset=&limit= → {items, total, unread},
 * GET /admin/notifications/unread-count → {unread},
 * POST /admin/notifications/{id}/read and /read-all.
 */
let role: string | null = "owner";
let search = "";
const pushes: string[] = [];
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];
const posts: string[] = [];
let unread = 3;
let total = 3;

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW - ms).toISOString();

function item(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    kind: "payment_failed",
    title: "Circuit's payment failed",
    body: "Razorpay could not charge ₹999 for Growth: card declined.",
    club: { id: 5, name: "Circuit", slug: "circuit" },
    subscription_id: 11,
    data: { amount_paise: 99900 },
    created_at: iso(5 * 60_000),
    read_at: null,
    ...over,
  };
}

const ITEMS = [
  item(),
  item({ id: 2, kind: "club_applied", title: "Robotics applied to join", body: "Picked Growth at sign-up.", club: { id: 6, name: "Robotics", slug: "robotics" }, subscription_id: null, created_at: iso(3 * 3_600_000) }),
  item({ id: 3, kind: "payment_received", title: "₹999 from Drama", body: null, club: { id: 7, name: "Drama", slug: "drama" }, subscription_id: 12, read_at: iso(60_000) }),
  item({ id: 4, kind: "grace_ending", title: "Grace ends tomorrow for Circuit", subscription_id: 11 }),
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => pushes.push(url), replace: (url: string) => pushes.push(url), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/notifications",
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: role } }),
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        gets.push({ path, query: init?.query });
        if (path === "/api/v1/admin/notifications/unread-count") return { unread };
        if (path === "/api/v1/admin/notifications") {
          const limit = Number(init?.query?.limit ?? 20);
          return { items: ITEMS.slice(0, limit), total, unread };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string) => {
        posts.push(path);
        if (path.endsWith("/read-all")) unread = 0;
        else if (path.endsWith("/read")) unread = Math.max(0, unread - 1);
        return {};
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { NotificationBell, NotificationsPage, notificationHref, kindLabel, kindTone, notificationPageSchema, UNREAD_POLL_MS, BELL_LIMIT } = await import("./index");

/** jsdom cannot navigate; following a link here is only about what it marks read. */
const stayPut = (e: MouseEvent) => {
  if ((e.target as Element | null)?.closest?.("a")) e.preventDefault();
};

beforeEach(() => {
  document.addEventListener("click", stayPut);
  role = "owner";
  search = "";
  pushes.length = 0;
  gets.length = 0;
  posts.length = 0;
  unread = 3;
  total = 3;
});

afterEach(() => {
  document.removeEventListener("click", stayPut);
  vi.useRealTimers();
});

const countCalls = () => gets.filter((g) => g.path.endsWith("/unread-count")).length;
const listCalls = () => gets.filter((g) => g.path === "/api/v1/admin/notifications");

describe("the shapes", () => {
  it("reads a page, keeps an unknown kind as the server says it, and leads each to its record", () => {
    const page = notificationPageSchema.parse({ items: [item({ kind: "something_new" })], total: 1, unread: 1 });
    expect(page.items[0]).toMatchObject({ id: "1", kind: "something_new", club: { id: 5 } });
    expect(kindLabel("something_new")).toBe("something new");
    expect(kindLabel("payment_failed")).toBe("Payment failed");
    expect(kindTone("payment_received")).toBe("money");
    expect(kindTone("payment_failed")).toBe("failure");
    expect(kindTone("grace_ending")).toBe("grace");
    expect(kindTone("club_applied")).toBe("application");
    // Billing goes to the subscription, found by the club's name; an application to the club.
    expect(notificationHref(item())).toBe("/subscriptions?q=Circuit");
    expect(notificationHref(item({ kind: "club_applied", subscription_id: null, club: { id: 6, name: "Robotics" } }))).toBe("/clubs/6");
    expect(notificationHref(item({ club: null }))).toBeNull();
  });
});

describe("the bell", () => {
  it("shows the unread count, and asks again every minute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NotificationBell />);
    expect(await screen.findByRole("button", { name: "Notifications: 3 unread" })).toHaveTextContent("3");
    expect(countCalls()).toBe(1);
    // Nothing is listed until the bell is opened.
    expect(listCalls()).toHaveLength(0);

    unread = 5;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS);
    });
    await waitFor(() => expect(countCalls()).toBe(2));
    expect(await screen.findByRole("button", { name: "Notifications: 5 unread" })).toBeInTheDocument();
  });

  it("says nothing when all is read", async () => {
    unread = 0;
    render(<NotificationBell />);
    await waitFor(() => expect(countCalls()).toBe(1));
    expect(await screen.findByRole("button", { name: "Notifications" })).not.toHaveTextContent(/\d/);
  });

  it("lists the latest ten, each with its icon, club and link, and goes to See all", async () => {
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications: 3 unread/ }));
    const list = await screen.findByRole("list", { name: "Latest notifications" });
    expect(listCalls()[0]!.query).toMatchObject({ offset: 0, limit: BELL_LIMIT });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);

    const failed = within(list).getByRole("link", { name: "Circuit's payment failed" });
    expect(failed).toHaveAttribute("href", "/subscriptions?q=Circuit");
    const applied = within(list).getByRole("link", { name: "Robotics applied to join" });
    expect(applied).toHaveAttribute("href", "/clubs/6");
    expect(within(list).getAllByRole("img", { name: "Payment failed" })[0]).toHaveAttribute("data-tone", "failure");
    expect(within(list).getByRole("img", { name: "Payment received" })).toHaveAttribute("data-tone", "money");
    expect(within(list).getByRole("img", { name: "Club applied" })).toHaveAttribute("data-tone", "application");
    expect(within(list).getByRole("link", { name: "Drama" })).toHaveAttribute("href", "/clubs/7");
    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/notifications");
  });

  it("marks one read, and all of them, then counts again", async () => {
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications: 3 unread/ }));
    await screen.findByRole("list", { name: "Latest notifications" });

    fireEvent.click(screen.getByRole("button", { name: "Mark read: Circuit's payment failed" }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/notifications/1/read"]));
    // A read one has nothing to mark.
    expect(screen.queryByRole("button", { name: "Mark read: ₹999 from Drama" })).not.toBeInTheDocument();
    await waitFor(() => expect(countCalls()).toBeGreaterThanOrEqual(2));

    fireEvent.click(screen.getByRole("button", { name: /Mark all read/ }));
    await waitFor(() => expect(posts).toContain("/api/v1/admin/notifications/read-all"));
  });

  it("marks it read when it is followed", async () => {
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications: 3 unread/ }));
    fireEvent.click(await screen.findByRole("link", { name: "Robotics applied to join" }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/notifications/2/read"]));
  });

  it("lets a viewer read them but not mark them, since that clears them for everyone", async () => {
    role = "viewer";
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications: 3 unread/ }));
    await screen.findByRole("list", { name: "Latest notifications" });
    expect(screen.queryByRole("button", { name: /Mark read/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark all read/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Robotics applied to join" }));
    expect(posts).toHaveLength(0);
  });
});

describe("the notifications page", () => {
  it("asks for everything by default, and filters by unread and kind through the URL", async () => {
    render(<NotificationsPage />);
    expect(await screen.findByRole("list", { name: "Notifications" })).toBeInTheDocument();
    expect(listCalls()[0]!.query).toMatchObject({ unread: undefined, kind: undefined, offset: 0, limit: 20 });
    expect(screen.getByText(/3 unread/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unread" }));
    expect(pushes.at(-1)).toBe("/notifications?unread=1");
    fireEvent.change(screen.getByRole("combobox", { name: "Kind" }), { target: { value: "payment_failed" } });
    expect(pushes.at(-1)).toBe("/notifications?kind=payment_failed");
  });

  it("reads the filters and the page from the URL", async () => {
    search = "unread=1&kind=payment_failed&page=2";
    total = 45;
    render(<NotificationsPage />);
    await screen.findByRole("list", { name: "Notifications" });
    expect(listCalls()[0]!.query).toMatchObject({ unread: true, kind: "payment_failed", offset: 20, limit: 20 });
    expect(screen.getByRole("button", { name: "Unread" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox", { name: "Kind" })).toHaveValue("payment_failed");
    expect(screen.getByText(/21–40 of 45 notifications/)).toBeInTheDocument();
  });

  it("pages forward", async () => {
    total = 45;
    render(<NotificationsPage />);
    await screen.findByRole("list", { name: "Notifications" });
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(pushes.at(-1)).toBe("/notifications?page=2");
  });

  it("marks everything read", async () => {
    render(<NotificationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Mark all read/ }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/notifications/read-all"]));
  });

  it("says when a filter matches nothing", async () => {
    search = "kind=subscription_paused";
    total = 0;
    const { api } = await import("@moa/app-kit");
    vi.mocked(api.get).mockImplementationOnce(async (path: string, init?: { query?: Record<string, unknown> }) => {
      gets.push({ path, query: init?.query });
      return { items: [], total: 0, unread: 0 };
    });
    render(<NotificationsPage />);
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
  });
});
