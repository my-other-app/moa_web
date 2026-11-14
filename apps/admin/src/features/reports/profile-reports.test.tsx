import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * Reported profiles in the reports queue (profiles-networking contract,
 * "Admin moderation — exact routes"):
 * GET /admin/reports?target_type=profile → each AdminReport for a profile has
 *   target_preview "<full_name> (@<handle>) — <headline>", target_author the
 *   owner, target_removed = hidden, and profile {user_id, handle, suspended,
 *   links:[{id,type,url,label}], projects:[{id,title,url}]};
 * POST /admin/reports/{id}/resolve: dismiss, remove_content (hide profile), suspend_author;
 * DELETE /admin/profiles/{user_id}/links/{link_id} and …/projects/{project_id} → 204;
 * POST /admin/profiles/{user_id}/unhide → 204. All writes: moderate and above.
 */
let role: string | null = "owner";
let search = "";
const pushes: string[] = [];
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];
const posts: Array<{ path: string; body: unknown }> = [];
const dels: string[] = [];
let listItems: unknown[] = [];
let refusal: ApiError | null = null;

const NOW = Date.now();

function profileReport(over: Record<string, unknown> = {}) {
  return {
    id: 31,
    target_type: "profile",
    target_id: "44",
    reason: "spam",
    note: "Links to a scam",
    status: "open",
    reporter: { id: 21, name: "Asha Nair" },
    target_preview: "Ravi Kumar (@ravi.k) — Crypto mentor",
    target_author: { id: 44, name: "Ravi Kumar" },
    club: null,
    report_count: 2,
    target_removed: false,
    created_at: new Date(NOW - 10 * 60_000).toISOString(),
    resolved_at: null,
    resolution: null,
    resolution_note: null,
    profile: {
      user_id: 44,
      handle: "ravi.k",
      suspended: false,
      links: [
        { id: 3, type: "website", url: "https://free-coins.example/claim", label: "Claim now" },
        { id: 4, type: "github", url: "https://github.com/ravik", label: null },
      ],
      projects: [{ id: 9, title: "Coin doubler", url: "https://free-coins.example/double" }],
    },
    ...over,
  };
}

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
          if (Number(init?.query?.limit) === 1) return { items: [], total: listItems.length };
          return { items: listItems, total: listItems.length };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        posts.push({ path, body });
        if (refusal) throw refusal;
        if (path.endsWith("/unhide")) return null;
        const found = listItems.find((i) => (i as { id: number }).id === Number(path.split("/").at(-2))) as ReturnType<typeof profileReport>;
        const action = (body as { action: string }).action;
        return { resolved: found.report_count, report: { ...found, status: "resolved", resolution: action, resolved_at: new Date().toISOString(), target_removed: action === "remove_content" } };
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        dels.push(path);
        if (refusal) throw refusal;
        return null;
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { toast } = await import("@moa/ui");
const { ReportsPage, reportSchema, reportPageSchema, canRemoveContent, resolutionLabelFor, linkTypeLabel } = await import("./index");

const rowOf = (id: number) => document.querySelector<HTMLElement>(`[data-report="${id}"]`)!;
const panelOf = (id: number) => within(rowOf(id)).getByRole("group", { name: "Reported profile" });

beforeEach(() => {
  role = "owner";
  search = "";
  pushes.length = 0;
  gets.length = 0;
  posts.length = 0;
  dels.length = 0;
  listItems = [profileReport()];
  refusal = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the shape", () => {
  it("reads a profile report with its profile", () => {
    const r = reportSchema.parse(profileReport());
    expect(r.target_type).toBe("profile");
    expect(r.profile).toEqual({
      user_id: 44,
      handle: "ravi.k",
      suspended: false,
      links: [
        { id: 3, type: "website", url: "https://free-coins.example/claim", label: "Claim now" },
        { id: 4, type: "github", url: "https://github.com/ravik", label: null },
      ],
      projects: [{ id: 9, title: "Coin doubler", url: "https://free-coins.example/double" }],
    });
  });

  it("reads a report without the field (an older server) or with a broken one as no profile, and drops a link it cannot read", () => {
    const { profile: _, ...older } = profileReport();
    expect(reportSchema.parse(older).profile).toBeNull();
    expect(reportSchema.parse(profileReport({ profile: "nope" })).profile).toBeNull();
    expect(reportSchema.parse(profileReport({ target_type: "comment", profile: null })).profile).toBeNull();
    const odd = reportSchema.parse(profileReport({ profile: { user_id: "44", handle: "ravi.k", links: [{ id: 3, url: "https://a.example" }, { url: "no id" }], projects: "none" } }));
    expect(odd.profile).toEqual({ user_id: 44, handle: "ravi.k", suspended: false, links: [{ id: 3, type: "other", url: "https://a.example", label: null }], projects: [] });
    // The page keeps parsing with profiles among the rest.
    expect(reportPageSchema.parse({ items: [profileReport(), older], total: 2 }).items).toHaveLength(2);
  });

  it("hides a profile that is up, and says so on the record", () => {
    expect(canRemoveContent({ target_type: "profile", target_removed: false })).toBe(true);
    expect(canRemoveContent({ target_type: "profile", target_removed: true })).toBe(false);
    expect(resolutionLabelFor({ target_type: "profile" }, "remove_content")).toBe("Profile hidden");
    expect(resolutionLabelFor({ target_type: "profile" }, "suspend_author")).toBe("Account suspended");
    expect(resolutionLabelFor({ target_type: "comment" }, "remove_content")).toBe("Content removed");
    expect(linkTypeLabel("github")).toBe("GitHub");
    expect(linkTypeLabel("mastodon")).toBe("mastodon");
  });
});

describe("a reported profile in the queue", () => {
  it("shows the preview, the owner, the handle, its links as text and its projects", async () => {
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    const row = rowOf(31);
    expect(within(row).getByText("Profile", { selector: ".tag" })).toBeInTheDocument();
    expect(within(row).getByText("Ravi Kumar (@ravi.k) — Crypto mentor", { selector: "blockquote" })).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Ravi Kumar" })).toHaveAttribute("href", "/users/44");
    expect(row).toHaveTextContent("Profile of");
    const panel = panelOf(31);
    expect(within(panel).getByText("@ravi.k")).toBeInTheDocument();
    const links = within(panel).getByRole("list", { name: "Links" });
    expect(within(links).getAllByRole("listitem")).toHaveLength(2);
    expect(within(links).getByText("Website")).toBeInTheDocument();
    expect(within(links).getByText("GitHub")).toBeInTheDocument();
    expect(links).toHaveTextContent("Claim now · https://free-coins.example/claim");
    // A reported address is shown, never linked.
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
    const projects = within(panel).getByRole("list", { name: "Projects" });
    expect(projects).toHaveTextContent("Coin doubler · https://free-coins.example/double");
    expect(within(row).queryByText("Profile hidden")).not.toBeInTheDocument();
  });

  it("filters to profiles through the URL and asks the server for them", async () => {
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    fireEvent.click(screen.getByRole("button", { name: "Profiles" }));
    expect(pushes.at(-1)).toBe("/reports?type=profile");
  });

  it("reads ?type=profile", async () => {
    search = "type=profile";
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    expect(gets.find((g) => g.query?.limit === 20)!.query).toMatchObject({ target_type: "profile" });
    expect(screen.getByRole("button", { name: "Profiles" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows only the preview when an older server sends no profile", async () => {
    const { profile: _, ...older } = profileReport();
    listItems = [older];
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    expect(within(rowOf(31)).getByText("Ravi Kumar (@ravi.k) — Crypto mentor")).toBeInTheDocument();
    expect(within(rowOf(31)).queryByRole("group", { name: "Reported profile" })).not.toBeInTheDocument();
    expect(within(rowOf(31)).getByRole("button", { name: "Hide profile" })).toBeInTheDocument();
  });
});

describe("deciding it", () => {
  it("offers Dismiss, Hide profile and Suspend account", async () => {
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    const row = rowOf(31);
    for (const name of ["Dismiss", "Hide profile", "Suspend account"]) expect(within(row).getByRole("button", { name })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Suspend author" })).not.toBeInTheDocument();
  });

  it("asks before hiding the profile, then hides it", async () => {
    const said = vi.spyOn(toast, "success");
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    fireEvent.click(within(rowOf(31)).getByRole("button", { name: "Hide profile" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Hide this profile?" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("The profile, its vCard and its personal QR code answer “not found” for everyone until an admin unhides it. Nothing is deleted. All 2 reports on it are resolved with this one.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Hide profile" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/v1/admin/reports/31/resolve", body: { action: "remove_content" } }]));
    await waitFor(() => expect(said).toHaveBeenCalledWith("The profile was hidden. 2 reports resolved."));
  });

  it("asks before suspending the owner's account", async () => {
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    fireEvent.click(within(rowOf(31)).getByRole("button", { name: "Suspend account" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Suspend Ravi Kumar?" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Ravi Kumar is signed out everywhere and cannot sign back in.");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend account" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/v1/admin/reports/31/resolve", body: { action: "suspend_author" } }]));
  });
});

describe("a link or a project", () => {
  it("asks before removing a link, then removes that one and reads the queue again", async () => {
    const said = vi.spyOn(toast, "success");
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    const lists = gets.length;
    fireEvent.click(within(panelOf(31)).getByRole("button", { name: "Remove link Claim now" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Remove this link?" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("https://free-coins.example/claim comes off @ravi.k's profile for everyone.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove link" }));
    await waitFor(() => expect(dels).toEqual(["/api/v1/admin/profiles/44/links/3"]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(said).toHaveBeenCalledWith("The link was removed from @ravi.k's profile.");
    await waitFor(() => expect(gets.length).toBeGreaterThan(lists));
    // Removing a link decides nothing about the report.
    expect(posts).toHaveLength(0);
  });

  it("asks before removing a project, then removes it", async () => {
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    fireEvent.click(within(panelOf(31)).getByRole("button", { name: "Remove project Coin doubler" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Remove this project?" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("“Coin doubler” comes off @ravi.k's profile for everyone.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove project" }));
    await waitFor(() => expect(dels).toEqual(["/api/v1/admin/profiles/44/projects/9"]));
  });

  it("does nothing when cancelled", async () => {
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    fireEvent.click(within(panelOf(31)).getByRole("button", { name: "Remove link https://github.com/ravik" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(dels).toHaveLength(0);
  });

  it("shows the server's words when it refuses, and keeps the dialog open", async () => {
    refusal = new ApiError({ status: 403, message: "Your admin role does not allow this.", errorCode: "INSUFFICIENT_ADMIN_ROLE" });
    const said = vi.spyOn(toast, "success");
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    fireEvent.click(within(panelOf(31)).getByRole("button", { name: "Remove link Claim now" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove link" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Your admin role does not allow this. Nothing was changed.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(said).not.toHaveBeenCalled();
  });
});

describe("a hidden profile", () => {
  const hidden = () =>
    profileReport({
      id: 32,
      status: "resolved",
      report_count: 0,
      target_removed: true,
      resolution: "remove_content",
      resolved_at: "2026-11-14T09:30:00Z",
      profile: { ...profileReport().profile, suspended: true },
    });

  it("says it is hidden and what was decided, and offers Unhide after asking", async () => {
    search = "status=resolved";
    listItems = [hidden()];
    const said = vi.spyOn(toast, "success");
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Resolved reports" });
    const row = rowOf(32);
    expect(within(row).getByText("Profile hidden", { selector: ".tag" })).toBeInTheDocument();
    expect(within(row).getByText("Profile hidden", { selector: ".font-semibold" })).toBeInTheDocument();
    expect(within(panelOf(32)).getByText("Hidden")).toBeInTheDocument();
    // Decided: no resolve actions, but the profile itself can still be moderated.
    for (const name of ["Dismiss", "Hide profile", "Suspend account"]) expect(within(row).queryByRole("button", { name })).not.toBeInTheDocument();
    fireEvent.click(within(panelOf(32)).getByRole("button", { name: "Unhide" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Unhide this profile?" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("@ravi.k's profile, its vCard and its personal QR code work again for everyone.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Unhide" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/v1/admin/profiles/44/unhide", body: undefined }]));
    await waitFor(() => expect(said).toHaveBeenCalledWith("@ravi.k shows again."));
  });

  it("offers no Unhide for a profile that is up", async () => {
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    expect(within(panelOf(31)).queryByRole("button", { name: "Unhide" })).not.toBeInTheDocument();
  });

  it("calls a deleted account's profile removed, not hidden, and offers no Unhide", async () => {
    // The server's target_removed is "hidden or the account deleted"; profile.suspended is hidden alone.
    listItems = [profileReport({ target_removed: true })];
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    expect(within(rowOf(31)).getByText("Removed")).toBeInTheDocument();
    expect(within(rowOf(31)).queryByText("Profile hidden")).not.toBeInTheDocument();
    expect(within(panelOf(31)).queryByRole("button", { name: "Unhide" })).not.toBeInTheDocument();
    expect(within(rowOf(31)).queryByRole("button", { name: "Hide profile" })).not.toBeInTheDocument();
  });

  it("offers no Hide profile once it is hidden", async () => {
    listItems = [profileReport({ target_removed: true, profile: { ...profileReport().profile, suspended: true } })];
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    expect(within(rowOf(31)).queryByRole("button", { name: "Hide profile" })).not.toBeInTheDocument();
    expect(within(rowOf(31)).getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });
});

describe("permissions", () => {
  it("lets a viewer read the profile but change nothing", async () => {
    role = "viewer";
    listItems = [profileReport({ target_removed: true, profile: { ...profileReport().profile, suspended: true } })];
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    const panel = panelOf(31);
    expect(within(panel).getByText("@ravi.k")).toBeInTheDocument();
    expect(within(panel).getByRole("list", { name: "Links" })).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /Remove|Unhide|Hide profile|Suspend|Dismiss/ })).toHaveLength(0);
  });

  it("lets support moderate it, as with the other report actions", async () => {
    role = "support";
    render(<ReportsPage />);
    await screen.findByRole("list", { name: "Open reports" });
    expect(within(panelOf(31)).getAllByRole("button", { name: /^Remove (link|project)/ })).toHaveLength(3);
    expect(within(rowOf(31)).getByRole("button", { name: "Hide profile" })).toBeInTheDocument();
  });
});
