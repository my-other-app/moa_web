import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

/**
 * Club domains against the backend's contract (built with fixtures while
 * the backend is written):
 * GET /admin/club-domains?status=&q=&offset=&limit= → {items: [{id, club
 * {id, name, slug}, host, status, ssl_status, last_error, verified_at,
 * created_at}], total}, POST /admin/club-domains/{id}/recheck, and
 * DELETE /admin/club-domains/{id}, the last for moderators and up.
 */
let role: string | null = "owner";
let search = "";
const pushes: string[] = [];
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];
const writes: Array<{ method: string; path: string }> = [];

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    club: { id: 5, name: "Circuit", slug: "circuit" },
    host: "www.circuit.org",
    status: "active",
    ssl_status: "active" as string | null,
    last_error: null as string | null,
    verified_at: ago(30 * MIN) as string | null,
    created_at: ago(2 * 1440 * MIN),
    ...over,
  };
}

let ROWS: Array<ReturnType<typeof row>> = [];
/** What a re-check makes of the row, when a test says. */
let recheckGives: Record<string, unknown> | null = null;
/** When set, the write is refused with it. */
let refusal: ApiError | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => pushes.push(url), replace: (url: string) => pushes.push(url), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/club-domains",
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
        if (path === "/api/v1/admin/club-domains") return { items: ROWS, total: ROWS.length };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string) => {
        writes.push({ method: "POST", path });
        if (refusal) throw refusal;
        const id = Number(path.split("/").at(-2));
        if (recheckGives) ROWS = ROWS.map((r) => (r.id === id ? { ...r, ...recheckGives } : r));
        return ROWS.find((r) => r.id === id)!;
      }),
      del: vi.fn(async (path: string) => {
        writes.push({ method: "DELETE", path });
        if (refusal) throw refusal;
        const id = Number(path.split("/").at(-1));
        ROWS = ROWS.map((r) => (r.id === id ? { ...r, status: "removed" } : r));
        return { ok: true };
      }),
      put: vi.fn(),
      patch: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubDomainsList, clubDomainPageSchema, statusLabel, sslLabel, canAct, recheckedMessage, DOMAIN_STATUSES } = await import("./index");
const { navItems, isActive } = await import("@/components/nav-items");

beforeEach(() => {
  vi.restoreAllMocks();
  role = "owner";
  search = "";
  recheckGives = null;
  refusal = null;
  pushes.length = 0;
  gets.length = 0;
  writes.length = 0;
  ROWS = [
    row(),
    row({ id: 2, club: { id: 6, name: "Robotics", slug: "robotics" }, host: "club.robotics.co.in", status: "pending", ssl_status: "pending_validation", verified_at: null }),
    row({ id: 3, club: { id: 7, name: "Drama", slug: "drama" }, host: "www.drama.in", status: "failed", ssl_status: null, verified_at: null, last_error: "No CNAME for www.drama.in." }),
    row({ id: 4, club: { id: 8, name: "Quiz", slug: "quiz" }, host: "www.quiz.org", status: "paused" }),
    row({ id: 5, club: { id: 9, name: "Chess", slug: "chess" }, host: "www.chess.org", status: "removed", ssl_status: null }),
  ];
});

const listCalls = () => gets.filter((g) => g.path === "/api/v1/admin/club-domains");
const rowOf = (club: string) => screen.getByRole("link", { name: club }).closest("tr")!;

describe("the shapes", () => {
  it("reads a page, keeps what it does not know, and words statuses and certificates", () => {
    const page = clubDomainPageSchema.parse({ items: [row({ id: "d_7", status: "moving_house", ssl_status: "pending_issuance" })], total: 1 });
    expect(page.items[0]).toMatchObject({ id: "d_7", status: "moving_house", host: "www.circuit.org", club: { id: 5, name: "Circuit" } });
    expect(statusLabel("moving_house")).toBe("moving house");
    expect(statusLabel("pending")).toBe("Pending DNS");
    expect(DOMAIN_STATUSES).toEqual(["pending", "active", "failed", "paused", "removed"]);
    expect(sslLabel("active")).toEqual({ label: "Active", tone: "success" });
    expect(sslLabel("pending_issuance")).toEqual({ label: "Issuing", tone: "info" });
    expect(sslLabel("validation_timed_out")?.tone).toBe("destructive");
    expect(sslLabel(null)).toBeNull();
    expect(canAct({ status: "removed" })).toBe(false);
    for (const status of ["pending", "active", "failed", "paused"]) expect(canAct({ status })).toBe(true);
  });

  it("words what a re-check came to", () => {
    const parsed = (over: Record<string, unknown>) => clubDomainPageSchema.parse({ items: [row(over)], total: 1 }).items[0]!;
    const before = parsed({ status: "pending" });
    expect(recheckedMessage(before, parsed({ status: "active" }))).toEqual({ ok: true, text: "www.circuit.org is live." });
    expect(recheckedMessage(before, parsed({ status: "pending", last_error: "No CNAME yet." }))).toEqual({ ok: true, text: "Re-checked www.circuit.org. Pending DNS: No CNAME yet." });
    expect(recheckedMessage(before, parsed({ status: "failed", last_error: "Wrong target" }))).toEqual({ ok: false, text: "Re-checked www.circuit.org. Failed: Wrong target." });
    // A server that answers with nothing to read.
    expect(recheckedMessage(before, null)).toEqual({ ok: true, text: "Re-checked www.circuit.org." });
  });
});

describe("club domains", () => {
  it("lists each club's domain: club, domain, status, SSL, error and when it was verified", async () => {
    render(<ClubDomainsList />);
    expect(await screen.findByRole("link", { name: "Circuit" })).toHaveAttribute("href", "/clubs/5");
    for (const h of ["Club", "Domain", "Status", "SSL", "Error", "Verified"]) expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();

    const circuit = within(rowOf("Circuit"));
    expect(circuit.getByText("www.circuit.org")).toBeInTheDocument();
    expect(circuit.getByRole("link", { name: "Open www.circuit.org" })).toHaveAttribute("href", "https://www.circuit.org");
    expect(circuit.getAllByText("Active")).toHaveLength(2);
    expect(circuit.getByText("30 min ago")).toBeInTheDocument();

    const robotics = within(rowOf("Robotics"));
    expect(robotics.getByText("Pending DNS")).toBeInTheDocument();
    expect(robotics.getByText("Issuing")).toBeInTheDocument();
    expect(robotics.getByText("Not yet")).toBeInTheDocument();
    // Only a live one has an address to open.
    expect(robotics.queryByRole("link", { name: /^Open / })).not.toBeInTheDocument();

    const drama = within(rowOf("Drama"));
    expect(drama.getByText("Failed")).toBeInTheDocument();
    expect(drama.getByText("No CNAME for www.drama.in.")).toBeInTheDocument();
    expect(within(rowOf("Quiz")).getByText("Paused")).toBeInTheDocument();
    expect(within(rowOf("Chess")).getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText("5 total")).toBeInTheDocument();
  });

  it("asks the server with the status, search and page from the URL", async () => {
    render(<ClubDomainsList />);
    await screen.findByRole("link", { name: "Circuit" });
    expect(listCalls()[0]!.query).toEqual({ status: undefined, q: undefined, offset: 0, limit: 20 });
    expect(screen.getByRole("searchbox", { name: "Club, slug or domain…" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Status" }), { key: "ArrowDown" });
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(expect.arrayContaining(["Pending DNS", "Active", "Failed", "Paused", "Removed"]));
  });

  it("reads the filters from the URL", async () => {
    search = "status=pending&q=robo&page=3";
    render(<ClubDomainsList />);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    expect(listCalls()[0]!.query).toEqual({ status: "pending", q: "robo", offset: 40, limit: 20 });
  });

  it("re-checks one and says what it came to", async () => {
    recheckGives = { status: "active", ssl_status: "active", verified_at: ago(0) };
    const ok = vi.spyOn(toast, "success");
    render(<ClubDomainsList />);
    await screen.findByRole("link", { name: "Robotics" });
    // Every live row has it; a removed one has nothing to check.
    expect(screen.getAllByRole("button", { name: /^Re-check / }).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Re-check www.circuit.org",
      "Re-check club.robotics.co.in",
      "Re-check www.drama.in",
      "Re-check www.quiz.org",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Re-check club.robotics.co.in" }));
    await waitFor(() => expect(writes).toEqual([{ method: "POST", path: "/api/v1/admin/club-domains/2/recheck" }]));
    await waitFor(() => expect(ok).toHaveBeenCalledWith("club.robotics.co.in is live."));
    // Read again: live, with its certificate.
    await waitFor(() => expect(within(rowOf("Robotics")).getAllByText("Active")).toHaveLength(2));
  });

  it("warns when a re-check finds it failed, and toasts a refusal in the server's words", async () => {
    recheckGives = { status: "failed", last_error: "CNAME points elsewhere" };
    const warned = vi.spyOn(toast, "warning");
    const said = vi.spyOn(toast, "error");
    const { unmount } = render(<ClubDomainsList />);
    fireEvent.click(await screen.findByRole("button", { name: "Re-check www.drama.in" }));
    await waitFor(() => expect(warned).toHaveBeenCalledWith("Re-checked www.drama.in. Failed: CNAME points elsewhere."));
    unmount();

    refusal = new ApiError({ status: 502, message: "Cloudflare did not answer.", errorCode: "CLOUDFLARE_ERROR" });
    render(<ClubDomainsList />);
    fireEvent.click(await screen.findByRole("button", { name: "Re-check www.drama.in" }));
    await waitFor(() => expect(said).toHaveBeenCalledWith("Cloudflare did not answer."));
  });

  it("removes one after saying where the club's visitors go", async () => {
    const ok = vi.spyOn(toast, "success");
    render(<ClubDomainsList />);
    await screen.findByRole("link", { name: "Circuit" });
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: "Remove www.circuit.org" }));
    let dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Remove www.circuit.org?")).toBeInTheDocument();
    expect(within(dialog).getByText(/Circuit's website stops answering at www\.circuit\.org and goes back to its MyOtherApp address \(circuit\.myotherapp\.in\)/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(writes).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Remove www.circuit.org" }));
    dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(writes).toEqual([{ method: "DELETE", path: "/api/v1/admin/club-domains/1" }]));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(ok).toHaveBeenCalledWith("Removed www.circuit.org. Circuit's site is at its MyOtherApp address again."));
    // Read again: removed, with nothing left to do.
    await waitFor(() => expect(within(rowOf("Circuit")).getByText("Removed")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Remove www.circuit.org" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-check www.circuit.org" })).not.toBeInTheDocument();
  });

  it("offers support Remove, and viewers only Re-check", async () => {
    role = "support";
    const r = render(<ClubDomainsList />);
    await screen.findByRole("link", { name: "Circuit" });
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(4);
    r.unmount();

    role = "viewer";
    render(<ClubDomainsList />);
    await screen.findByRole("link", { name: "Circuit" });
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Re-check / })).toHaveLength(4);
  });

  it("says when no club has its own domain yet", async () => {
    ROWS = [];
    render(<ClubDomainsList />);
    expect(await screen.findByText("No club has its own domain yet")).toBeInTheDocument();
  });

  it("sits in the rail under Platform, next to Clubs, without lighting Clubs", () => {
    const i = navItems.findIndex((n) => n.href === "/club-domains");
    expect(navItems[i]!.label).toBe("Club domains");
    expect(navItems[i - 1]!.href).toBe("/clubs");
    const clubs = navItems.find((n) => n.href === "/clubs")!;
    expect(isActive("/club-domains", clubs)).toBe(false);
    expect(isActive("/club-domains", navItems[i]!)).toBe(true);
  });
});
