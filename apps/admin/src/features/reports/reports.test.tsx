import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import { ApiError } from "@moa/api";

import { shownPicture, stubImageLoading } from "@/test/images";

/**
 * The Reports page against the backend's contract (moa_backend#68):
 * GET /admin/reports?status=open|resolved&target_type=&offset=&limit= → {items, total} (any admin),
 * POST /admin/reports/{id}/resolve {action, note?} → {resolved, report} (moderate and above).
 * Resolving one resolves every open report on the same thing. Refusals:
 * 404 REPORT_NOT_FOUND, 409 ALREADY_RESOLVED, 422 NOT_REMOVABLE / NO_AUTHOR /
 * CANNOT_SUSPEND_SELF, 403 INSUFFICIENT_ADMIN_ROLE.
 */
let role: string | null = "owner";
let search = "";
const pushes: string[] = [];
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];
const posts: Array<{ path: string; body: unknown }> = [];
/** What the list answers with; ITEMS unless a test says otherwise. */
let listItems: unknown[] | null = null;
let listTotal = 4;
/** What the open count (limit=1) answers with. */
let openTotal = 4;
/** The next resolve's refusal, if any. */
let refusal: ApiError | null = null;

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW - ms).toISOString();

function report(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    target_type: "comment",
    target_id: "7d1c0c8e-5b8f-4c55-9d7e-3f0c1d2e4a10",
    reason: "harassment",
    note: "Keeps replying to me like this",
    status: "open",
    reporter: { id: 21, name: "Asha Nair" },
    target_preview: "You lot are useless, quit the club",
    target_author: { id: 9, name: "Rahul K" },
    club: { id: 5, name: "Circuit", slug: "circuit" },
    report_count: 3,
    target_removed: false,
    created_at: iso(5 * 60_000),
    resolved_at: null,
    resolution: null,
    resolution_note: null,
    ...over,
  };
}

const ITEMS = [
  // A comment three people reported: hidden from users until decided.
  report(),
  // A thread: posted by the club's own account.
  report({ id: 2, target_type: "thread", target_id: "0b6f9a51-2c1e-4f0e-9a43-5d6c7b8a9e01", reason: "spam", note: null, target_preview: "Win a free iPhone, DM us", target_author: { id: 30, name: "Circuit" }, report_count: 1 }),
  // A person.
  report({ id: 3, target_type: "user", target_id: "44", reason: "other", note: "Fake account", target_preview: "Spam Bot 3000", target_author: { id: 44, name: "Spam Bot 3000" }, club: null, report_count: 2 }),
  // A club: its author is the club's account.
  report({ id: 4, target_type: "club", target_id: "6", reason: "misinformation", note: null, target_preview: "Robotics", target_author: { id: 31, name: "Robotics" }, club: { id: 6, name: "Robotics", slug: "robotics" }, report_count: 1 }),
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => pushes.push(url), replace: (url: string) => pushes.push(url), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/reports",
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
        if (path === "/api/v1/admin/reports") {
          const limit = Number(init?.query?.limit ?? 20);
          if (limit === 1 && init?.query?.status === "open") return { items: ITEMS.slice(0, 1), total: openTotal };
          return { items: (listItems ?? ITEMS).slice(0, limit), total: listTotal };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        posts.push({ path, body });
        if (refusal) throw refusal;
        const id = Number(path.split("/").at(-2));
        const found = (listItems ?? ITEMS).find((i) => (i as { id: number }).id === id) as ReturnType<typeof report>;
        const action = (body as { action: string }).action;
        const resolved = found.report_count || 1;
        openTotal = Math.max(0, openTotal - 1);
        return {
          resolved,
          report: { ...found, status: "resolved", resolution: action, resolved_at: new Date().toISOString(), resolution_note: (body as { note?: string }).note ?? null, report_count: 0 },
        };
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { toast } = await import("@moa/ui");
const { formatDateTime } = await import("@moa/app-kit");
const {
  ReportsPage,
  ReasonChip,
  OPEN_COUNT_POLL_MS,
  REPORTS_PAGE_SIZE,
  reportPageSchema,
  reasonLabel,
  reasonTone,
  targetLabel,
  resolutionLabel,
  canRemoveContent,
  canSuspendAuthor,
  hiddenFromUsers,
  suspendsClubAccount,
  REPORT_REASONS,
} = await import("./index");
const { SidebarNav } = await import("@/components/sidebar-nav");
const { navItems } = await import("@/components/nav-items");

/** jsdom cannot navigate; a link here is checked by its href. */
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
  listItems = null;
  listTotal = 4;
  openTotal = 4;
  refusal = null;
});

afterEach(() => {
  document.removeEventListener("click", stayPut);
  vi.useRealTimers();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});

const listCalls = () => gets.filter((g) => g.path === "/api/v1/admin/reports" && g.query?.limit !== 1);
const countCalls = () => gets.filter((g) => g.path === "/api/v1/admin/reports" && g.query?.limit === 1);
const rowOf = (id: number) => document.querySelector<HTMLElement>(`[data-report="${id}"]`)!;
const openList = () => screen.findByRole("list", { name: "Open reports" });
/** The text a reader gets: without what is hidden from them (a picture's initials, beside the name they stand for). */
const visibleText = (el: Element) => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ");
};

async function openDialog(id: number, button: string) {
  await openList();
  fireEvent.click(within(rowOf(id)).getByRole("button", { name: button }));
  return screen.findByRole("dialog");
}

describe("the shapes", () => {
  it("reads a page, keeps a reason or type it does not know, and says each in words and colour", () => {
    const page = reportPageSchema.parse({ items: [report({ id: "8", target_id: 44, reason: "self_harm", target_type: "event" })], total: 1 });
    expect(page.items[0]).toMatchObject({ id: 8, target_id: "44", reason: "self_harm", target_type: "event", club: { id: 5 } });
    expect(reasonLabel("self_harm")).toBe("self harm");
    expect(reasonTone("self_harm")).toBe("neutral");
    expect(targetLabel("event")).toBe("event");
    expect(REPORT_REASONS.map(reasonLabel)).toEqual(["Spam", "Harassment", "Hate", "Sexual content", "Violence", "Misinformation", "Other"]);
    expect(REPORT_REASONS.map(reasonTone)).toEqual(["caution", "refuse", "refuse", "refuse", "refuse", "info", "neutral"]);
    expect(resolutionLabel("dismiss")).toBe("Dismissed");
    expect(resolutionLabel("remove_content")).toBe("Content removed");
    expect(resolutionLabel("suspend_author")).toBe("Author suspended");
  });

  it("offers Remove for a thread or a comment still up, Suspend only with an author, and warns for a club's account", () => {
    expect(canRemoveContent({ target_type: "thread", target_removed: false })).toBe(true);
    expect(canRemoveContent({ target_type: "comment", target_removed: false })).toBe(true);
    expect(canRemoveContent({ target_type: "comment", target_removed: true })).toBe(false);
    expect(canRemoveContent({ target_type: "user", target_removed: false })).toBe(false);
    expect(canRemoveContent({ target_type: "club", target_removed: false })).toBe(false);
    expect(canSuspendAuthor({ target_author: null })).toBe(false);
    expect(canSuspendAuthor({ target_author: { id: 9, name: "Rahul" } })).toBe(true);
    expect(suspendsClubAccount({ target_type: "thread" })).toBe(true);
    expect(suspendsClubAccount({ target_type: "club" })).toBe(true);
    expect(suspendsClubAccount({ target_type: "comment" })).toBe(false);
    expect(suspendsClubAccount({ target_type: "user" })).toBe(false);
  });

  it("hides a comment from users at three reports, and nothing else", () => {
    expect(hiddenFromUsers({ target_type: "comment", report_count: 3 })).toBe(true);
    expect(hiddenFromUsers({ target_type: "comment", report_count: 7 })).toBe(true);
    expect(hiddenFromUsers({ target_type: "comment", report_count: 2 })).toBe(false);
    expect(hiddenFromUsers({ target_type: "thread", report_count: 5 })).toBe(false);
    expect(hiddenFromUsers({ target_type: "user", report_count: 5 })).toBe(false);
  });

  it("colours each reason's chip", () => {
    render(
      <div>
        {REPORT_REASONS.map((r) => (
          <ReasonChip key={r} reason={r} />
        ))}
      </div>
    );
    expect(screen.getByText("Harassment")).toHaveAttribute("data-tone", "refuse");
    expect(screen.getByText("Spam")).toHaveAttribute("data-tone", "caution");
    expect(screen.getByText("Misinformation")).toHaveAttribute("data-tone", "info");
    expect(screen.getByText("Other")).toHaveAttribute("data-tone", "neutral");
  });
});

describe("the list", () => {
  it("asks for the open reports, twenty at a time, and shows each one whole", async () => {
    render(<ReportsPage />);
    const list = await openList();
    expect(REPORTS_PAGE_SIZE).toBe(20);
    expect(listCalls()[0]!.query).toEqual({ status: "open", target_type: undefined, offset: 0, limit: 20 });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);

    const row = rowOf(1);
    expect(within(row).getByText("Harassment")).toHaveAttribute("data-tone", "refuse");
    expect(within(row).getByText("Comment")).toBeInTheDocument();
    expect(within(row).getByText("“You lot are useless, quit the club”")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Rahul K" })).toHaveAttribute("href", "/users/9");
    expect(within(row).getByRole("link", { name: "Circuit" })).toHaveAttribute("href", "/clubs/5");
    expect(within(row).getByRole("link", { name: "Asha Nair" })).toHaveAttribute("href", "/users/21");
    expect(within(row).getByText("Keeps replying to me like this")).toBeInTheDocument();
    expect(within(row).getByText("3 reports")).toBeInTheDocument();
    expect(within(row).getByText("5 min ago")).toHaveAttribute("dateTime", ITEMS[0]!.created_at);

    // A thread, a person and a club: their kind, and the name rather than a quote for the last two.
    expect(within(rowOf(2)).getByText("Thread")).toBeInTheDocument();
    expect(within(rowOf(2)).getByText("1 report")).toBeInTheDocument();
    expect(within(rowOf(2)).getByText("Spam")).toHaveAttribute("data-tone", "caution");
    expect(within(rowOf(3)).getByText("User")).toBeInTheDocument();
    expect(within(rowOf(3)).getByText("Spam Bot 3000", { selector: "blockquote" })).toBeInTheDocument();
    expect(within(rowOf(3)).queryByRole("link", { name: /Circuit|Robotics/ })).not.toBeInTheDocument();
    expect(within(rowOf(4)).getByText("Club", { selector: ".tag" })).toBeInTheDocument();
    // A club's author is its own account: the account's user page, then the club.
    expect(within(rowOf(4)).getAllByRole("link", { name: "Robotics" }).map((a) => a.getAttribute("href"))).toEqual(["/users/31", "/clubs/6"]);
    expect(visibleText(rowOf(2))).toContain("Posted by Circuit");
    expect(visibleText(rowOf(3))).toContain("Account Spam Bot 3000");
    expect(within(rowOf(4)).getByText("Misinformation")).toHaveAttribute("data-tone", "info");
  });

  it("shows each person's picture beside their name, and initials for someone without one", async () => {
    const photo = { thumbnail: "https://cdn.test/users/profile_pic/asha.thumbnail.png" };
    const fox = { thumbnail: "https://cdn.test/avatars/fox.thumbnail.png" };
    listItems = [report({ reporter: { id: 21, name: "Asha Nair", avatar: photo }, target_author: { id: 9, name: "Rahul K", avatar: fox } }), report({ id: 2, reporter: { id: 22, name: "No Picture" } })];
    stubImageLoading();
    try {
      render(<ReportsPage />);
      await openList();
      const reporter = within(rowOf(1)).getByRole("link", { name: "Asha Nair" });
      const author = within(rowOf(1)).getByRole("link", { name: "Rahul K" });
      await waitFor(() => expect(shownPicture(reporter)).toBe(photo.thumbnail));
      await waitFor(() => expect(shownPicture(author)).toBe(fox.thumbnail));
      const plain = within(rowOf(2)).getByRole("link", { name: "No Picture" });
      expect(shownPicture(plain)).toBeNull();
      expect(within(plain).getByText("NP")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("switches to Resolved and filters by the kind of thing through the URL", async () => {
    render(<ReportsPage />);
    await openList();
    expect(screen.getByRole("tab", { name: /Open/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Everything" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("tab", { name: "Resolved" }));
    expect(pushes.at(-1)).toBe("/reports?status=resolved");
    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    expect(pushes.at(-1)).toBe("/reports?type=comment");
    fireEvent.click(screen.getByRole("button", { name: "Clubs" }));
    expect(pushes.at(-1)).toBe("/reports?type=club");
  });

  it("reads the tab, the kind and the page from the URL", async () => {
    search = "status=resolved&type=comment&page=2";
    listTotal = 45;
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Resolved reports" });
    expect(listCalls()[0]!.query).toEqual({ status: "resolved", target_type: "comment", offset: 20, limit: 20 });
    expect(screen.getByRole("tab", { name: "Resolved" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Comments" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/21–40 of 45 reports/)).toBeInTheDocument();
  });

  it("ignores a kind it does not know", async () => {
    search = "type=event";
    render(<ReportsPage />);
    await openList();
    expect(listCalls()[0]!.query).toMatchObject({ target_type: undefined });
    expect(screen.getByRole("button", { name: "Everything" })).toHaveAttribute("aria-pressed", "true");
  });

  it("pages forward and back, keeping the filters", async () => {
    search = "type=thread";
    listTotal = 45;
    render(<ReportsPage />);
    await openList();
    expect(screen.getByText(/1–20 of 45 reports/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(pushes.at(-1)).toBe("/reports?type=thread&page=2");
  });

  it("pages back to the first page", async () => {
    search = "page=3";
    listTotal = 45;
    render(<ReportsPage />);
    await openList();
    expect(listCalls()[0]!.query).toMatchObject({ offset: 40, limit: 20 });
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(pushes.at(-1)).toBe("/reports?page=2");
  });

  it("says when there is nothing to review, and when a filter matches nothing", async () => {
    listItems = [];
    listTotal = 0;
    const { unmount } = render(<ReportsPage />);
    expect(await screen.findByText("Nothing to review")).toBeInTheDocument();
    unmount();
    search = "type=user";
    render(<ReportsPage />);
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
  });
});

describe("the badges", () => {
  it("marks a comment three people reported as hidden from users, and nothing below three or that is not a comment", async () => {
    listItems = [
      report({ id: 1, report_count: 3 }),
      report({ id: 2, report_count: 2 }),
      report({ id: 3, target_type: "thread", report_count: 5 }),
    ];
    render(<ReportsPage />);
    await openList();
    expect(within(rowOf(1)).getByText("Hidden from users")).toBeInTheDocument();
    expect(within(rowOf(2)).queryByText("Hidden from users")).not.toBeInTheDocument();
    expect(within(rowOf(2)).getByText("2 reports")).toBeInTheDocument();
    expect(within(rowOf(3)).queryByText("Hidden from users")).not.toBeInTheDocument();
  });

  it("marks what is already gone as Removed, and offers no Remove for it", async () => {
    listItems = [report({ id: 1, target_removed: true, report_count: 1 }), report({ id: 2, target_removed: false, report_count: 1 })];
    render(<ReportsPage />);
    await openList();
    expect(within(rowOf(1)).getByText("Removed")).toBeInTheDocument();
    expect(within(rowOf(1)).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(within(rowOf(1)).getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(within(rowOf(2)).queryByText("Removed")).not.toBeInTheDocument();
  });
});

describe("the actions", () => {
  it("offers Remove for threads and comments only, and Suspend only where there is an author", async () => {
    listItems = [...ITEMS, report({ id: 5, target_author: null, report_count: 1 })];
    render(<ReportsPage />);
    await openList();
    for (const id of [1, 2]) expect(within(rowOf(id)).getByRole("button", { name: "Remove" })).toBeInTheDocument();
    for (const id of [3, 4]) expect(within(rowOf(id)).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    for (const id of [1, 2, 3, 4]) expect(within(rowOf(id)).getByRole("button", { name: "Suspend author" })).toBeInTheDocument();
    expect(within(rowOf(5)).queryByRole("button", { name: "Suspend author" })).not.toBeInTheDocument();
    for (const id of [1, 2, 3, 4, 5]) expect(within(rowOf(id)).getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("dismisses with a note, says how many went with it, and reads the list and the count again", async () => {
    const said = vi.spyOn(toast, "success");
    render(<ReportsPage />);
    const dialog = await openDialog(1, "Dismiss");
    expect(within(dialog).getByRole("heading", { name: "Dismiss this report?" })).toBeInTheDocument();
    // Three reports hid the comment: dismissing shows it again, and closes all three.
    expect(dialog).toHaveTextContent("Nothing is taken down. The comment shows to everyone again. All 3 reports on it are resolved with this one.");
    const lists = listCalls().length;
    const counts = countCalls().length;

    fireEvent.change(within(dialog).getByRole("textbox", { name: /Note/ }), { target: { value: "  Banter between friends " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/v1/admin/reports/1/resolve", body: { action: "dismiss", note: "Banter between friends" } }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(said).toHaveBeenCalledWith("Dismissed 3 reports on this comment.");
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(lists));
    await waitFor(() => expect(countCalls().length).toBeGreaterThan(counts));
  });

  it("removes a comment, sending no note when none is written", async () => {
    const said = vi.spyOn(toast, "success");
    render(<ReportsPage />);
    const dialog = await openDialog(1, "Remove");
    expect(within(dialog).getByRole("heading", { name: "Remove this comment?" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("It is taken down for everyone in the app.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/v1/admin/reports/1/resolve", body: { action: "remove_content" } }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(said).toHaveBeenCalledWith("The comment was removed. 3 reports resolved.");
  });

  it("removes a thread", async () => {
    render(<ReportsPage />);
    const dialog = await openDialog(2, "Remove");
    expect(within(dialog).getByRole("heading", { name: "Remove this thread?" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(posts[0]).toEqual({ path: "/api/v1/admin/reports/2/resolve", body: { action: "remove_content" } }));
  });

  it("asks before suspending a comment's author: signed out, and the comment removed", async () => {
    const said = vi.spyOn(toast, "success");
    render(<ReportsPage />);
    const dialog = await openDialog(1, "Suspend author");
    expect(within(dialog).getByRole("heading", { name: "Suspend Rahul K?" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Rahul K is signed out everywhere and cannot sign back in, and this comment is removed.");
    // A person's comment: no club account involved.
    expect(dialog).not.toHaveTextContent(/dashboard/);
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Note/ }), { target: { value: "Third strike" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend author" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/v1/admin/reports/1/resolve", body: { action: "suspend_author", note: "Third strike" } }]));
    await waitFor(() => expect(said).toHaveBeenCalledWith("Rahul K was suspended and signed out. 3 reports resolved."));
  });

  it("warns that suspending a thread's author closes the club's dashboard", async () => {
    render(<ReportsPage />);
    const dialog = await openDialog(2, "Suspend author");
    expect(within(dialog).getByRole("heading", { name: "Suspend Circuit?" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("this thread is removed");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Threads are posted by the club's own account. Suspending it closes Circuit's dashboard for its whole team until it is reinstated.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend author" }));
    await waitFor(() => expect(posts[0]).toEqual({ path: "/api/v1/admin/reports/2/resolve", body: { action: "suspend_author" } }));
  });

  it("warns that suspending a reported club's account closes its dashboard, and removes nothing else", async () => {
    render(<ReportsPage />);
    const dialog = await openDialog(4, "Suspend author");
    expect(within(dialog).getByRole("heading", { name: "Suspend Robotics?" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("is removed");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Suspending it closes Robotics's dashboard");
  });

  it("suspends a reported person without a club warning", async () => {
    render(<ReportsPage />);
    const dialog = await openDialog(3, "Suspend author");
    expect(dialog).toHaveTextContent("Spam Bot 3000 is signed out everywhere and cannot sign back in.");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does nothing when cancelled", async () => {
    render(<ReportsPage />);
    const dialog = await openDialog(1, "Suspend author");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(posts).toHaveLength(0);
  });
});

describe("permissions", () => {
  it("lets a viewer read every row but take no action", async () => {
    role = "viewer";
    render(<ReportsPage />);
    const list = await openList();
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(rowOf(1)).getByText("“You lot are useless, quit the club”")).toBeInTheDocument();
    for (const name of ["Dismiss", "Remove", "Suspend author"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });

  it("lets support decide them, as with the other moderation writes", async () => {
    role = "support";
    render(<ReportsPage />);
    const dialog = await openDialog(1, "Dismiss");
    fireEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(posts).toHaveLength(1));
  });
});

describe("refusals", () => {
  const cases: Array<[string, number, string, string, string]> = [
    ["NOT_REMOVABLE", 422, "Only a thread or a comment can be removed. Suspend the account instead.", "Remove", "Only a thread or a comment can be removed. Suspend the account instead. Nothing was changed."],
    ["NO_AUTHOR", 422, "There is no account to suspend for this report.", "Suspend author", "There is no account to suspend for this report. Nothing was changed."],
    ["CANNOT_SUSPEND_SELF", 422, "You cannot suspend your own account", "Suspend author", "You cannot suspend your own account. Nothing was changed."],
    ["INSUFFICIENT_ADMIN_ROLE", 403, "Your admin role does not allow this.", "Dismiss", "Your admin role does not allow this. Nothing was changed."],
  ];

  for (const [code, status, message, button, shown] of cases) {
    it(`shows the server's words for ${status} ${code} and keeps the dialog open`, async () => {
      refusal = new ApiError({ status, message, errorCode: code });
      const said = vi.spyOn(toast, "success");
      render(<ReportsPage />);
      const dialog = await openDialog(1, button);
      fireEvent.click(within(dialog).getByRole("button", { name: button }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(shown);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(said).not.toHaveBeenCalled();
    });
  }

  it("shows 404 REPORT_NOT_FOUND and reads the list again", async () => {
    refusal = new ApiError({ status: 404, message: "Report not found", errorCode: "REPORT_NOT_FOUND" });
    render(<ReportsPage />);
    const dialog = await openDialog(1, "Dismiss");
    const lists = listCalls().length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Report not found. Nothing was changed.");
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(lists));
  });

  it("on 409 ALREADY_RESOLVED says nothing: it closes and reads the list and the count again", async () => {
    refusal = new ApiError({ status: 409, message: "This report is already resolved.", errorCode: "ALREADY_RESOLVED" });
    const ok = vi.spyOn(toast, "success");
    const bad = vi.spyOn(toast, "error");
    render(<ReportsPage />);
    const dialog = await openDialog(1, "Remove");
    const lists = listCalls().length;
    const counts = countCalls().length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(lists));
    await waitFor(() => expect(countCalls().length).toBeGreaterThan(counts));
    expect(screen.queryByText(/already resolved/)).not.toBeInTheDocument();
    expect(ok).not.toHaveBeenCalled();
    expect(bad).not.toHaveBeenCalled();
  });

  it("clears the refusal once the note is changed", async () => {
    refusal = new ApiError({ status: 422, message: "There is no account to suspend for this report.", errorCode: "NO_AUTHOR" });
    render(<ReportsPage />);
    const dialog = await openDialog(1, "Suspend author");
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend author" }));
    await within(dialog).findByRole("alert");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Note/ }), { target: { value: "x" } });
    await waitFor(() => expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("the Resolved tab", () => {
  const RESOLVED = [
    report({ id: 11, status: "resolved", report_count: 0, resolution: "dismiss", resolved_at: "2026-10-17T09:30:00Z", resolution_note: "Banter between friends" }),
    report({ id: 12, status: "resolved", target_type: "thread", report_count: 0, target_removed: true, resolution: "remove_content", resolved_at: "2026-10-16T12:00:00Z", resolution_note: null }),
    report({ id: 13, status: "resolved", target_type: "user", club: null, report_count: 0, target_removed: true, resolution: "suspend_author", resolved_at: "2026-10-15T08:15:00Z", resolution_note: "Spam account" }),
  ];

  it("shows the decision, when it was made and its note, and no actions", async () => {
    search = "status=resolved";
    listItems = RESOLVED;
    listTotal = 3;
    render(<ReportsPage />);
    const list = await screen.findByRole("list", { name: "Resolved reports" });
    expect(listCalls()[0]!.query).toMatchObject({ status: "resolved" });
    expect(within(rowOf(11)).getByText("Dismissed")).toBeInTheDocument();
    expect(within(rowOf(11)).getByText(formatDateTime("2026-10-17T09:30:00Z"))).toHaveAttribute("dateTime", "2026-10-17T09:30:00Z");
    expect(within(rowOf(11)).getByText("Banter between friends")).toBeInTheDocument();
    expect(within(rowOf(12)).getByText("Content removed")).toBeInTheDocument();
    expect(within(rowOf(12)).getByText("Removed")).toBeInTheDocument();
    expect(within(rowOf(13)).getByText("Author suspended")).toBeInTheDocument();
    expect(within(rowOf(13)).getByText("Spam account")).toBeInTheDocument();
    // No open reports left on them: no count, and nothing to act on, even for an owner.
    expect(within(list).queryByText(/\d reports?$/)).not.toBeInTheDocument();
    for (const name of ["Dismiss", "Remove", "Suspend author"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });
});

describe("the nav count", () => {
  it("sits beside Notifications in the rail", () => {
    const hrefs = navItems.map((n) => n.href);
    expect(hrefs.indexOf("/reports")).toBe(hrefs.indexOf("/notifications") + 1);
  });

  it("shows how many are open, from the total of a one-row page", async () => {
    openTotal = 7;
    render(<SidebarNav />);
    const link = await screen.findByRole("link", { name: "Reports, 7 open" });
    expect(link).toHaveAttribute("href", "/reports");
    expect(countCalls()[0]!.query).toEqual({ status: "open", offset: 0, limit: 1 });
  });

  it("shows nothing when none are open", async () => {
    openTotal = 0;
    render(<SidebarNav />);
    await waitFor(() => expect(countCalls()).toHaveLength(1));
    expect(screen.getByRole("link", { name: "Reports" })).toHaveTextContent(/^Reports$/);
  });

  it("asks again every minute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidebarNav />);
    await screen.findByRole("link", { name: "Reports, 4 open" });
    openTotal = 9;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OPEN_COUNT_POLL_MS);
    });
    await waitFor(() => expect(countCalls()).toHaveLength(2));
    expect(await screen.findByRole("link", { name: "Reports, 9 open" })).toBeInTheDocument();
  });

  it("asks again when the admin comes back to the tab", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidebarNav />);
    await screen.findByRole("link", { name: "Reports, 4 open" });
    openTotal = 2;
    await act(async () => {
      focusManager.setFocused(false);
      await vi.advanceTimersByTimeAsync(OPEN_COUNT_POLL_MS / 2 + 1_000);
    });
    const before = countCalls().length;
    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(countCalls().length).toBeGreaterThan(before));
    expect(await screen.findByRole("link", { name: "Reports, 2 open" })).toBeInTheDocument();
  });

  it("drops once a report is decided", async () => {
    render(
      <>
        <SidebarNav />
        <ReportsPage />
      </>
    );
    await screen.findByRole("link", { name: "Reports, 4 open" });
    const dialog = await openDialog(2, "Dismiss");
    fireEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    expect(await screen.findByRole("link", { name: "Reports, 3 open" })).toBeInTheDocument();
  });
});
