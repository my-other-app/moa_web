import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * Admin alerts against the backend's contract (the UI calls them
 * notifications; the API is /admin/alerts, since /admin/notifications is the
 * audit router's list of club announcements):
 * GET /admin/alerts?unread=&kind=&offset=&limit= → {items, total, unread},
 * GET /admin/alerts/unread-count → {unread},
 * POST /admin/alerts/{id}/read → the item, POST /admin/alerts/read-all?kind= → {updated, unread}.
 */
let role: string | null = "owner";
let search = "";
const pushes: string[] = [];
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];
const posts: string[] = [];
const postQueries: Array<Record<string, unknown> | undefined> = [];
let unread = 3;
let total = 3;
/** What the list answers with, when a test needs other alerts than ITEMS. */
let listItems: unknown[] | null = null;

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
  item({ id: 2, kind: "club_applied", title: "Robotics applied to join", body: "Picked Growth at sign-up.", club: { id: 6, name: "Robotics", slug: "robotics" }, subscription_id: null, data: { requested_plan: "growth", requested_cycle: "yearly", contact_email: "hi@robotics.in" }, created_at: iso(3 * 3_600_000) }),
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
        if (path === "/api/v1/admin/alerts/unread-count") return { unread };
        if (path === "/api/v1/admin/alerts") {
          const limit = Number(init?.query?.limit ?? 20);
          return { items: (listItems ?? ITEMS).slice(0, limit), total, unread };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, _body?: unknown, opts?: { query?: Record<string, unknown> }) => {
        posts.push(path);
        postQueries.push(opts?.query);
        if (path.endsWith("/read-all")) {
          const updated = unread;
          unread = 0;
          return { updated, unread };
        }
        const id = path.split("/").at(-2);
        unread = Math.max(0, unread - 1);
        return { ...ITEMS.find((i) => String(i.id) === id), read_at: new Date().toISOString() };
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { NotificationBell, NotificationsPage, NotificationRow, notificationHref, kindLabel, kindTone, alertLabel, displayKind, notificationPageSchema, NOTIFICATION_KINDS, UNREAD_POLL_MS, BELL_LIMIT } = await import("./index");

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
  postQueries.length = 0;
  unread = 3;
  total = 3;
  listItems = null;
});

afterEach(() => {
  document.removeEventListener("click", stayPut);
  vi.useRealTimers();
});

const countCalls = () => gets.filter((g) => g.path.endsWith("/unread-count")).length;
const listCalls = () => gets.filter((g) => g.path === "/api/v1/admin/alerts");

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

  it("says what the alert's data adds: the plan applied for, who cancelled, grace given", () => {
    expect(alertLabel(item({ kind: "club_applied", data: { requested_plan: "growth", requested_cycle: "yearly", contact_email: "hi@robotics.in" } }))).toBe("Club applied · wants Growth (yearly)");
    expect(alertLabel(item({ kind: "club_applied", data: {} }))).toBe("Club applied");
    expect(alertLabel(item({ kind: "subscription_cancelled", data: { by: "club" } }))).toBe("Cancelled by the club");
    expect(alertLabel(item({ kind: "subscription_cancelled", data: { by: "admin" } }))).toBe("Cancelled by an admin");
    expect(alertLabel(item({ kind: "subscription_cancelled", data: { by: "razorpay" } }))).toBe("Cancelled by Razorpay");
    expect(alertLabel(item({ kind: "subscription_cancelled", data: { by: "razorpay_completed" } }))).toBe("Cancelled by Razorpay, its billing cycles done");
    expect(alertLabel(item({ kind: "subscription_cancelled", data: null }))).toBe("Cancelled");
    expect(alertLabel(item({ kind: "plan_assigned", data: { action: "extend_grace" } }))).toBe("Grace extended");
    expect(alertLabel(item({ kind: "plan_assigned", data: {} }))).toBe("Plan assigned");
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
    // The plan a club applied for, from the alert's data.
    expect(within(list).getByText("Club applied · wants Growth (yearly)")).toBeInTheDocument();
    // Alerts are /admin/alerts; /admin/notifications is the audit list of club announcements.
    expect(gets.some((g) => g.path.startsWith("/api/v1/admin/notifications"))).toBe(false);
  });

  it("marks one read, and all of them, then counts again", async () => {
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications: 3 unread/ }));
    await screen.findByRole("list", { name: "Latest notifications" });

    fireEvent.click(screen.getByRole("button", { name: "Mark read: Circuit's payment failed" }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/alerts/1/read"]));
    // A read one has nothing to mark.
    expect(screen.queryByRole("button", { name: "Mark read: ₹999 from Drama" })).not.toBeInTheDocument();
    await waitFor(() => expect(countCalls()).toBeGreaterThanOrEqual(2));

    fireEvent.click(screen.getByRole("button", { name: /Mark all read/ }));
    await waitFor(() => expect(posts).toContain("/api/v1/admin/alerts/read-all"));
  });

  it("marks it read when it is followed", async () => {
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications: 3 unread/ }));
    fireEvent.click(await screen.findByRole("link", { name: "Robotics applied to join" }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/alerts/2/read"]));
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

  it("lets support mark them, as with the other moderation writes", async () => {
    role = "support";
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications: 3 unread/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark read: Circuit's payment failed" }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/alerts/1/read"]));
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
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/alerts/read-all"]));
    expect(postQueries[0]).toEqual({ kind: undefined });
  });

  it("marks only the kind it is filtered to", async () => {
    search = "kind=payment_failed";
    render(<NotificationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark all payment failed read" }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/alerts/read-all"]));
    expect(postQueries[0]).toEqual({ kind: "payment_failed" });
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

// ─── A club's own Razorpay ───────────────────────────────────────────────

const GATEWAY_ITEMS = [
  item({ id: 21, kind: "payment_gateway_connected", title: "Circuit connected its own Razorpay", body: "New ticket payments go to rzp_live_Circ1.", subscription_id: null, data: { key_id: "rzp_live_Circ1" } }),
  item({ id: 22, kind: "payment_gateway_failed", title: "Robotics' Razorpay keys stopped working", body: "Authentication failed.", club: { id: 6, name: "Robotics", slug: "robotics" }, subscription_id: null, data: {} }),
  item({ id: 23, kind: "payment_gateway_disconnected", title: "Drama's Razorpay is off", body: null, club: { id: 7, name: "Drama", slug: "drama" }, subscription_id: null, data: { by: "admin" }, read_at: iso(60_000) }),
];

describe("alerts about a club's own Razorpay", () => {
  it("have their own words and colours, and lead to the club rather than its subscription", () => {
    expect(kindLabel("payment_gateway_connected")).toBe("Razorpay connected");
    expect(kindLabel("payment_gateway_failed")).toBe("Razorpay check failed");
    expect(kindLabel("payment_gateway_disconnected")).toBe("Razorpay disconnected");
    expect(kindTone("payment_gateway_connected")).toBe("money");
    expect(kindTone("payment_gateway_failed")).toBe("failure");
    expect(kindTone("payment_gateway_disconnected")).toBe("ended");
    for (const n of GATEWAY_ITEMS) expect(notificationHref(n)).toBe(`/clubs/${n.club.id}`);
    // Even one that names a subscription: it is about the club's account, not its plan.
    expect(notificationHref(item({ kind: "payment_gateway_failed", subscription_id: 11 }))).toBe("/clubs/5");
    expect(notificationHref(item({ kind: "payment_gateway_failed", club: null }))).toBeNull();
  });

  it("say an admin turned one back on, when the alert does", () => {
    expect(alertLabel(item({ kind: "payment_gateway_connected", data: { by: "admin" } }))).toBe("Razorpay re-enabled by an admin");
    expect(alertLabel(item({ kind: "payment_gateway_connected", data: { by: "club" } }))).toBe("Razorpay connected");
    expect(alertLabel(item({ kind: "payment_gateway_connected", data: null }))).toBe("Razorpay connected");
  });

  it("say who took the account off, when the alert does", () => {
    expect(alertLabel(item({ kind: "payment_gateway_disconnected", data: { by: "admin" } }))).toBe("Razorpay disabled by an admin");
    expect(alertLabel(item({ kind: "payment_gateway_disconnected", data: { by: "club" } }))).toBe("Razorpay disconnected by the club");
    expect(alertLabel(item({ kind: "payment_gateway_disconnected", data: null }))).toBe("Razorpay disconnected");
  });

  it("show in the bell with their icon, colour and the club", async () => {
    listItems = GATEWAY_ITEMS;
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications: 3 unread/ }));
    const list = await screen.findByRole("list", { name: "Latest notifications" });
    expect(within(list).getByRole("img", { name: "Razorpay connected" })).toHaveAttribute("data-tone", "money");
    expect(within(list).getByRole("img", { name: "Razorpay check failed" })).toHaveAttribute("data-tone", "failure");
    expect(within(list).getByRole("img", { name: "Razorpay disconnected" })).toHaveAttribute("data-tone", "ended");
    expect(within(list).getByRole("link", { name: "Circuit connected its own Razorpay" })).toHaveAttribute("href", "/clubs/5");
    expect(within(list).getByRole("link", { name: "Robotics' Razorpay keys stopped working" })).toHaveAttribute("href", "/clubs/6");
    expect(within(list).getByText("Razorpay disabled by an admin")).toBeInTheDocument();
  });

  it("can be picked out on the Notifications page", async () => {
    listItems = GATEWAY_ITEMS;
    render(<NotificationsPage />);
    const page = await screen.findByRole("list", { name: "Notifications" });
    expect(within(page).getAllByRole("img").map((i) => i.getAttribute("aria-label"))).toEqual(["Razorpay connected", "Razorpay check failed", "Razorpay disconnected"]);
    const kinds = screen.getByRole("combobox", { name: "Kind" });
    for (const label of ["Razorpay connected", "Razorpay check failed", "Razorpay disconnected"]) {
      expect(within(kinds).getByRole("option", { name: label })).toBeInTheDocument();
    }
    expect(NOTIFICATION_KINDS).toEqual(expect.arrayContaining(["payment_gateway_connected", "payment_gateway_failed", "payment_gateway_disconnected"]));
    fireEvent.change(kinds, { target: { value: "payment_gateway_failed" } });
    expect(pushes.at(-1)).toBe("/notifications?kind=payment_gateway_failed");
  });
});

describe("free plans", () => {
  const given = item({ id: 9, kind: "plan_assigned", title: "Deepu gave Drama Growth free", body: "Growth, monthly, free until 31 Mar 2027.", club: { id: 7, name: "Drama", slug: "drama" }, subscription_id: 12, data: { plan: "growth", cycle: "monthly", complimentary: true, action: "assign" } });
  const ending = item({ id: 10, kind: "comp_ending", title: "Drama's free plan ends in 7 days", club: { id: 7, name: "Drama", slug: "drama" }, subscription_id: 12, data: { ends_at: "2027-03-31T23:59:59+05:30" } });
  const ended = item({ id: 11, kind: "comp_ended", title: "Drama's free plan has ended", club: { id: 7, name: "Drama", slug: "drama" }, subscription_id: 12, data: {} });

  it("names the two new kinds and a plan given free, each in its colour", () => {
    expect(NOTIFICATION_KINDS).toEqual(expect.arrayContaining(["comp_ending", "comp_ended"]));
    expect(kindLabel("comp_ending")).toBe("Free plan ending");
    expect(kindLabel("comp_ended")).toBe("Free plan ended");
    expect(kindTone("comp_ending")).toBe("grace");
    expect(kindTone("comp_ended")).toBe("ended");
    expect(alertLabel(ending)).toBe("Free plan ending");
    expect(alertLabel(ended)).toBe("Free plan ended");
    expect(displayKind(given)).toBe("free_plan_given");
    expect(alertLabel(given)).toBe("Free plan given · Growth");
    expect(alertLabel(item({ kind: "plan_assigned", data: { complimentary: true } }))).toBe("Free plan given");
    // A plan given at its price, and grace extended, read as before.
    expect(alertLabel(item({ kind: "plan_assigned", data: { complimentary: false, plan: "growth" } }))).toBe("Plan assigned");
    expect(alertLabel(item({ kind: "plan_assigned", data: { action: "extend_grace", complimentary: true } }))).toBe("Grace extended");
    // About a subscription: they lead to it.
    expect(notificationHref(ending)).toBe("/subscriptions?q=Drama");
    expect(notificationHref(given)).toBe("/subscriptions?q=Drama");
  });

  it("marks each with its own icon", () => {
    render(
      <ul>
        {[given, ending, ended, item({ id: 12, kind: "plan_assigned", data: { plan: "pro" } })].map((n) => (
          <NotificationRow key={n.id} n={notificationPageSchema.parse({ items: [n], total: 1, unread: 1 }).items[0]!} now={new Date(NOW)} onRead={() => {}} />
        ))}
      </ul>
    );
    expect(screen.getByRole("img", { name: "Free plan given" })).toHaveAttribute("data-tone", "change");
    expect(screen.getByRole("img", { name: "Free plan ending" })).toHaveAttribute("data-tone", "grace");
    expect(screen.getByRole("img", { name: "Free plan ended" })).toHaveAttribute("data-tone", "ended");
    expect(screen.getByRole("img", { name: "Plan assigned" })).toBeInTheDocument();
    expect(screen.getByText("Free plan given · Growth")).toBeInTheDocument();
  });

  it("can be filtered to on the page", async () => {
    render(<NotificationsPage />);
    const kind = await screen.findByRole("combobox", { name: "Kind" });
    expect(within(kind).getByRole("option", { name: "Free plan ending" })).toHaveValue("comp_ending");
    expect(within(kind).getByRole("option", { name: "Free plan ended" })).toHaveValue("comp_ended");
  });
});

// ─── A club's own domain ─────────────────────────────────────────────────

describe("a club's domain going live", () => {
  const live = item({ id: 31, kind: "club_domain_active", title: "Circuit's site is live at www.circuit.org", body: "circuit.myotherapp.in now forwards there.", subscription_id: null, data: { host: "www.circuit.org" } });

  it("has its own words and colour, and leads to the club rather than a subscription", () => {
    expect(NOTIFICATION_KINDS).toContain("club_domain_active");
    expect(kindLabel("club_domain_active")).toBe("Club domain live");
    expect(kindTone("club_domain_active")).toBe("change");
    expect(alertLabel(live)).toBe("Club domain live · www.circuit.org");
    expect(alertLabel(item({ kind: "club_domain_active", data: null }))).toBe("Club domain live");
    expect(notificationHref(live)).toBe("/clubs/5");
    // Even one that names a subscription: it is about the club's site, not its plan.
    expect(notificationHref(item({ kind: "club_domain_active", subscription_id: 11 }))).toBe("/clubs/5");
    expect(notificationHref(item({ kind: "club_domain_active", club: null }))).toBeNull();
  });

  it("shows in the bell with its globe, and can be picked out on the page", async () => {
    listItems = [live];
    const { unmount } = render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications: \d+ unread/ }));
    const list = await screen.findByRole("list", { name: "Latest notifications" });
    const mark = within(list).getByRole("img", { name: "Club domain live" });
    expect(mark).toHaveAttribute("data-tone", "change");
    expect(mark.querySelector("svg")).toHaveClass("lucide-globe");
    expect(within(list).getByRole("link", { name: "Circuit's site is live at www.circuit.org" })).toHaveAttribute("href", "/clubs/5");
    expect(within(list).getByText("Club domain live · www.circuit.org")).toBeInTheDocument();
    unmount();

    render(<NotificationsPage />);
    const kinds = await screen.findByRole("combobox", { name: "Kind" });
    expect(within(kinds).getByRole("option", { name: "Club domain live" })).toHaveValue("club_domain_active");
  });
});

// ─── App users' reports ──────────────────────────────────────────────────

describe("content reported", () => {
  const reported = item({
    id: 31,
    kind: "content_reported",
    title: "A comment in Circuit was reported",
    body: "Harassment: “Keeps replying to me like this”",
    subscription_id: null,
    data: { target_type: "comment", target_id: "7d1c0c8e-5b8f-4c55-9d7e-3f0c1d2e4a10", reason: "harassment", report_count: 3 },
  });

  it("has its label and colour, says what was reported and why, and leads to Reports rather than the club", () => {
    expect(NOTIFICATION_KINDS).toContain("content_reported");
    expect(kindLabel("content_reported")).toBe("Content reported");
    expect(kindTone("content_reported")).toBe("failure");
    expect(alertLabel(reported)).toBe("Content reported · comment · harassment · 3 reports");
    expect(alertLabel(item({ kind: "content_reported", data: { target_type: "user", reason: "spam", report_count: 1 } }))).toBe("Content reported · user · spam");
    expect(alertLabel(item({ kind: "content_reported", data: null }))).toBe("Content reported");
    // Even naming a club (or a subscription): a report is decided on the Reports page.
    expect(notificationHref(reported)).toBe("/reports");
    expect(notificationHref(item({ kind: "content_reported", club: null, subscription_id: null }))).toBe("/reports");
    expect(notificationHref(item({ kind: "content_reported", subscription_id: 11 }))).toBe("/reports");
  });

  it("shows in the bell with its icon, and opening it goes to Reports and marks it read", async () => {
    listItems = [reported];
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications: 3 unread/ }));
    const list = await screen.findByRole("list", { name: "Latest notifications" });
    expect(within(list).getByRole("img", { name: "Content reported" })).toHaveAttribute("data-tone", "failure");
    expect(within(list).getByText("Content reported · comment · harassment · 3 reports")).toBeInTheDocument();
    const link = within(list).getByRole("link", { name: "A comment in Circuit was reported" });
    expect(link).toHaveAttribute("href", "/reports");
    fireEvent.click(link);
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/alerts/31/read"]));
  });

  it("can be filtered to on the Notifications page", async () => {
    listItems = [reported];
    render(<NotificationsPage />);
    const page = await screen.findByRole("list", { name: "Notifications" });
    expect(within(page).getByRole("link", { name: "A comment in Circuit was reported" })).toHaveAttribute("href", "/reports");
    const kinds = screen.getByRole("combobox", { name: "Kind" });
    expect(within(kinds).getByRole("option", { name: "Content reported" })).toHaveValue("content_reported");
    fireEvent.change(kinds, { target: { value: "content_reported" } });
    expect(pushes.at(-1)).toBe("/notifications?kind=content_reported");
  });
});

// ─── Wave 1: money that needs a look, mail given up on ───────────────────

const WAVE1_ITEMS = [
  item({ id: 31, kind: "payment_unapplied", title: "Ananya paid (order order_N1) but the registration is still not paid", subscription_id: null, data: { order_id: "o1", razorpay_order_id: "order_N1", registration_id: "r1", repaired: false } }),
  item({ id: 32, kind: "payment_auto_refunded", title: "A payment for Build Night was refunded: the event was full", subscription_id: null, data: { payment_id: "pay_R1", reason: "event_full", amount: "499.00" } }),
  item({ id: 33, kind: "payment_refund_failed", title: "An automatic refund of ₹499 has not gone through yet", subscription_id: null, data: { payment_id: "pay_R2", reason: "duplicate", error: "BAD_REQUEST" } }),
  item({ id: 34, kind: "store_oversold", title: "A guest paid for store pieces that had sold out", subscription_id: null, data: { order_id: "s1", event_id: 37, total: "890" } }),
  item({ id: 35, kind: "subscription_orphan_charged", title: "Razorpay charged ₹999 on a subscription no club holds", subscription_id: null, data: { razorpay_subscription_id: "sub_X", payment_id: "pay_S", cancelled: true } }),
  item({ id: 36, kind: "email_dead_letter", title: "Emails for Build Night were given up on", subscription_id: null, data: { event_id: 37, what: "ticket", error: "Throttled" } }),
];

describe("the Wave-1 alerts", () => {
  it("are kinds of their own, each with a word and a colour", () => {
    expect(NOTIFICATION_KINDS).toEqual(expect.arrayContaining(["payment_unapplied", "payment_auto_refunded", "payment_refund_failed", "store_oversold", "subscription_orphan_charged", "email_dead_letter"]));
    expect(kindLabel("payment_unapplied")).toBe("Payment not applied");
    expect(kindLabel("payment_auto_refunded")).toBe("Refunded automatically");
    expect(kindLabel("payment_refund_failed")).toBe("Refund failed");
    expect(kindLabel("store_oversold")).toBe("Store oversold");
    expect(kindLabel("subscription_orphan_charged")).toBe("Charge on an unknown subscription");
    expect(kindLabel("email_dead_letter")).toBe("Emails failed after retries");
    for (const k of ["payment_unapplied", "payment_refund_failed", "store_oversold", "subscription_orphan_charged", "email_dead_letter"]) expect(kindTone(k)).toBe("failure");
    expect(kindTone("payment_auto_refunded")).toBe("change");
  });

  it("say what the data adds: repaired or not, and why a refund was made", () => {
    expect(alertLabel(WAVE1_ITEMS[0]!)).toBe("Payment not applied · still unpaid");
    expect(alertLabel(item({ kind: "payment_unapplied", data: { repaired: true } }))).toBe("Payment not applied · applied by the sweep");
    expect(alertLabel(WAVE1_ITEMS[1]!)).toBe("Refunded automatically · the event was full");
    expect(alertLabel(item({ kind: "payment_auto_refunded", data: { reason: "duplicate" } }))).toBe("Refunded automatically · paid twice");
    expect(alertLabel(item({ kind: "payment_auto_refunded", data: null }))).toBe("Refunded automatically");
  });

  it("lead a payment to the Payments page by its Razorpay id, and the rest to the club", () => {
    expect(notificationHref(WAVE1_ITEMS[0]!)).toBe("/payments?q=order_N1");
    expect(notificationHref(WAVE1_ITEMS[1]!)).toBe("/payments?q=pay_R1");
    expect(notificationHref(WAVE1_ITEMS[2]!)).toBe("/payments?q=pay_R2");
    expect(notificationHref(item({ kind: "payment_refund_failed", data: null, club: null }))).toBe("/payments");
    expect(notificationHref(WAVE1_ITEMS[3]!)).toBe("/clubs/5");
    expect(notificationHref(WAVE1_ITEMS[5]!)).toBe("/clubs/5");
    expect(notificationHref(item({ kind: "email_dead_letter", club: null }))).toBeNull();
    // A charge Razorpay made on a subscription: the club's subscriptions.
    expect(notificationHref(WAVE1_ITEMS[4]!)).toBe("/subscriptions?q=Circuit");
  });

  it("show in the bell and on the Notifications page with their marks", async () => {
    listItems = WAVE1_ITEMS;
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: /Notifications: 3 unread/ }));
    const list = await screen.findByRole("list", { name: "Latest notifications" });
    expect(within(list).getByRole("img", { name: "Emails failed after retries" })).toHaveAttribute("data-tone", "failure");
    expect(within(list).getByRole("link", { name: "Emails for Build Night were given up on" })).toHaveAttribute("href", "/clubs/5");
    expect(within(list).getByRole("link", { name: /An automatic refund/ })).toHaveAttribute("href", "/payments?q=pay_R2");
    cleanup();

    render(<NotificationsPage />);
    const page = await screen.findByRole("list", { name: "Notifications" });
    expect(within(page).getAllByRole("img").map((i) => i.getAttribute("aria-label"))).toEqual([
      "Payment not applied",
      "Refunded automatically",
      "Refund failed",
      "Store oversold",
      "Charge on an unknown subscription",
      "Emails failed after retries",
    ]);
    const kinds = screen.getByRole("combobox", { name: "Kind" });
    expect(within(kinds).getByRole("option", { name: "Emails failed after retries" })).toHaveValue("email_dead_letter");
  });
});
