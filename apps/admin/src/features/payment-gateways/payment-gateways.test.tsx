import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

/**
 * Club gateways against the backend's contract:
 * GET /admin/payment-gateways?status=&q=&offset=&limit= → {items: [{club,
 * status, key_id, verified_at, last_webhook_at, last_error, created_at}],
 * total}, POST /admin/payment-gateways/{club_id}/disable → the item, and
 * POST …/enable → the item, active if the stored keys still work or failed
 * with last_error if not. Both are for roles that handle money.
 */
let role: string | null = "owner";
let search = "";
const pushes: string[] = [];
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];
const posts: string[] = [];

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

function row(over: Record<string, unknown> = {}) {
  return {
    club: { id: 5, name: "Circuit", slug: "circuit" },
    status: "active",
    key_id: "rzp_live_Circ1",
    mode: "keys",
    verified_at: ago(120 * MIN),
    last_webhook_at: ago(10 * MIN),
    last_error: null as string | null,
    created_at: ago(5 * 1440 * MIN),
    ended_at: null as string | null,
    ...over,
  };
}

let ROWS: Array<ReturnType<typeof row>> = [];
/** What Razorpay makes of the stored keys when one is enabled again. */
let enableGives: { status: string; last_error: string | null } = { status: "active", last_error: null };
/** When set, enabling is refused with it (409 NOT_DISABLED, 404 NO_GATEWAY). */
let enableRefusal: ApiError | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => pushes.push(url), replace: (url: string) => pushes.push(url), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/payment-gateways",
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
        if (path === "/api/v1/admin/payment-gateways") return { items: ROWS, total: ROWS.length };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string) => {
        posts.push(path);
        const id = Number(path.split("/").at(-2));
        if (path.endsWith("/enable") && enableRefusal) throw enableRefusal;
        const next = path.endsWith("/enable") ? enableGives : { status: "disabled" };
        ROWS = ROWS.map((r) => (r.club.id === id ? { ...r, ...next } : r));
        return ROWS.find((r) => r.club.id === id)!;
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { GatewaysList, gatewayPageSchema, canDisable, canEnable, statusLabel, enabledMessage, GATEWAY_STATUSES } = await import("./index");
const { navItems } = await import("@/components/nav-items");

beforeEach(() => {
  vi.restoreAllMocks();
  enableGives = { status: "active", last_error: null };
  enableRefusal = null;
  role = "owner";
  search = "";
  pushes.length = 0;
  gets.length = 0;
  posts.length = 0;
  ROWS = [
    row(),
    row({ club: { id: 6, name: "Robotics", slug: "robotics" }, status: "failed", key_id: "rzp_live_Robo2", last_webhook_at: null, last_error: "Authentication failed" }),
    row({ club: { id: 7, name: "Drama", slug: "drama" }, status: "disabled", key_id: "rzp_live_Dram3", ended_at: "2026-10-15T10:00:00+05:30" }),
    row({ club: { id: 8, name: "Quiz", slug: "quiz" }, status: "disconnected", key_id: "rzp_live_Quiz4", verified_at: null, last_webhook_at: null }),
  ];
});

const listCalls = () => gets.filter((g) => g.path === "/api/v1/admin/payment-gateways");
const rowOf = (club: string) => screen.getByRole("link", { name: club }).closest("tr")!;

describe("the shapes", () => {
  it("reads a page, keeps a status it does not know, and offers Disable only where a payment could still land", () => {
    const page = gatewayPageSchema.parse({ items: [row({ status: "paused_by_razorpay", ended_at: "2026-10-15T10:00:00+05:30" })], total: 1 });
    expect(page.items[0]).toMatchObject({ status: "paused_by_razorpay", club: { id: 5, name: "Circuit" }, mode: "keys", ended_at: "2026-10-15T10:00:00+05:30" });
    // Replaced keys are hidden by the server unless the filter asks for them.
    expect(GATEWAY_STATUSES).toContain("replaced");
    expect(statusLabel("replaced")).toBe("Replaced");
    expect(canDisable({ status: "replaced" })).toBe(false);
    expect(canEnable({ status: "replaced" })).toBe(false);
    expect(statusLabel("paused_by_razorpay")).toBe("paused by razorpay");
    expect(statusLabel("disabled")).toBe("Disabled");
    expect(canDisable({ status: "active" })).toBe(true);
    expect(canDisable({ status: "failed" })).toBe(true);
    expect(canDisable({ status: "disabled" })).toBe(false);
    expect(canDisable({ status: "disconnected" })).toBe(false);
    expect(canEnable({ status: "disabled" })).toBe(true);
    for (const status of ["active", "failed", "disconnected"]) expect(canEnable({ status })).toBe(false);
  });

  it("words what enabling came to: the keys still work, or Razorpay's refusal", () => {
    const parsed = (over: Record<string, unknown>) => gatewayPageSchema.parse({ items: [row(over)], total: 1 }).items[0]!;
    expect(enabledMessage(parsed({ status: "active" }))).toEqual({ ok: true, text: "Enabled. Razorpay accepted Circuit's keys, so its new payments go to its own account again." });
    expect(enabledMessage(parsed({ status: "failed", last_error: "Authentication failed." }))).toEqual({
      ok: false,
      text: "Enabled, but Razorpay refused Circuit's stored keys: Authentication failed. Its payments stay with MyOtherApp until the club replaces them.",
    });
  });
});

describe("club gateways", () => {
  it("lists each club's gateway: club, status, key, verified, last webhook and error", async () => {
    render(<GatewaysList />);
    expect(await screen.findByRole("link", { name: "Circuit" })).toHaveAttribute("href", "/clubs/5");
    for (const h of ["Club", "Status", "Key", "Verified", "Last webhook", "Error"]) expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();

    const circuit = within(rowOf("Circuit"));
    expect(circuit.getByText("Active")).toBeInTheDocument();
    expect(circuit.getByText("rzp_live_Circ1")).toBeInTheDocument();
    expect(circuit.getByText("10 min ago")).toBeInTheDocument();

    const robotics = within(rowOf("Robotics"));
    expect(robotics.getByText("Failed")).toBeInTheDocument();
    expect(robotics.getByText("None yet")).toBeInTheDocument();
    expect(robotics.getByText("Authentication failed")).toBeInTheDocument();

    expect(within(rowOf("Drama")).getByText("Disabled")).toBeInTheDocument();
    expect(within(rowOf("Drama")).getByText(/^Ended /)).toBeInTheDocument();
    expect(circuit.queryByText(/^Ended /)).not.toBeInTheDocument();
    expect(circuit.getByText("API keys")).toBeInTheDocument();
    expect(within(rowOf("Quiz")).getByText("Disconnected")).toBeInTheDocument();
    expect(screen.getByText("4 total")).toBeInTheDocument();
  });

  it("filters by status, searches and pages through the URL, and asks the server with them", async () => {
    render(<GatewaysList />);
    await screen.findByRole("link", { name: "Circuit" });
    expect(listCalls()[0]!.query).toEqual({ status: undefined, q: undefined, offset: 0, limit: 20 });
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Club name or slug…" })).toBeInTheDocument();
  });

  it("reads the status, search and page from the URL", async () => {
    search = "status=failed&q=robo&page=2";
    render(<GatewaysList />);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    expect(listCalls()[0]!.query).toEqual({ status: "failed", q: "robo", offset: 20, limit: 20 });
  });

  it("disables an active or a failed one after saying where the club's payments go", async () => {
    render(<GatewaysList />);
    await screen.findByRole("link", { name: "Circuit" });
    expect(screen.getAllByRole("button", { name: /^Disable Razorpay for / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Disable Razorpay for Circuit", "Disable Razorpay for Robotics"]);

    fireEvent.click(screen.getByRole("button", { name: "Disable Razorpay for Circuit" }));
    let dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Disable Circuit's Razorpay?")).toBeInTheDocument();
    expect(within(dialog).getByText(/The club's new payments go to MyOtherApp's account\./)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep it on" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(posts).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Disable Razorpay for Circuit" }));
    dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Disable" }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/payment-gateways/5/disable"]));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    // The list is asked again, and the row no longer offers it.
    await waitFor(() => expect(within(rowOf("Circuit")).getByText("Disabled")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Disable Razorpay for Circuit" })).not.toBeInTheDocument();
  });

  it("enables a disabled one after saying what happens, and says Razorpay took the keys", async () => {
    const ok = vi.spyOn(toast, "success");
    render(<GatewaysList />);
    await screen.findByRole("link", { name: "Drama" });
    // Only the one an admin turned off; a club that disconnected connects again itself.
    expect(screen.getAllByRole("button", { name: /^Enable Razorpay for / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Enable Razorpay for Drama"]);

    fireEvent.click(screen.getByRole("button", { name: "Enable Razorpay for Drama" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Enable Drama's Razorpay again?")).toBeInTheDocument();
    expect(within(dialog).getByText(/stored keys are checked with Razorpay first/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/admin/payment-gateways/7/enable"]));
    await waitFor(() => expect(ok).toHaveBeenCalledWith("Enabled. Razorpay accepted Drama's keys, so its new payments go to its own account again."));
    await waitFor(() => expect(within(rowOf("Drama")).getByText("Active")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Disable Razorpay for Drama" })).toBeInTheDocument();
  });

  it("says so when Razorpay no longer takes the stored keys", async () => {
    enableGives = { status: "failed", last_error: "Authentication failed" };
    const warned = vi.spyOn(toast, "warning");
    const ok = vi.spyOn(toast, "success");
    render(<GatewaysList />);
    fireEvent.click(await screen.findByRole("button", { name: "Enable Razorpay for Drama" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(warned).toHaveBeenCalledWith("Enabled, but Razorpay refused Drama's stored keys: Authentication failed. Its payments stay with MyOtherApp until the club replaces them."));
    expect(ok).not.toHaveBeenCalled();
    await waitFor(() => expect(within(rowOf("Drama")).getByText("Failed")).toBeInTheDocument());
  });

  it("shows the server's words when enabling is refused (409 NOT_DISABLED, 404 NO_GATEWAY), and reads the list again", async () => {
    for (const [status, code, message] of [
      [409, "NOT_DISABLED", "This gateway isn't disabled."],
      [404, "NO_GATEWAY", "This club has no Razorpay gateway."],
    ] as const) {
      enableRefusal = new ApiError({ message, status, errorCode: code });
      const said = vi.spyOn(toast, "error");
      const { unmount } = render(<GatewaysList />);
      fireEvent.click(await screen.findByRole("button", { name: "Enable Razorpay for Drama" }));
      const before = listCalls().length;
      fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Enable" }));
      await waitFor(() => expect(said).toHaveBeenCalledWith(message));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
      unmount();
      said.mockRestore();
    }
  });

  it("offers support and viewers the list without Disable or Enable", async () => {
    for (const r of ["support", "viewer"]) {
      role = r;
      const { unmount } = render(<GatewaysList />);
      await screen.findByRole("link", { name: "Circuit" });
      expect(screen.queryByRole("button", { name: /^Disable Razorpay for / })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Enable Razorpay for / })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("says when no club has its own yet", async () => {
    ROWS = [];
    render(<GatewaysList />);
    expect(await screen.findByText("No club has its own Razorpay yet")).toBeInTheDocument();
  });

  it("sits in the rail under Money, next to Payments, without lighting Payments", () => {
    const i = navItems.findIndex((n) => n.href === "/payment-gateways");
    expect(navItems[i]!.label).toBe("Club gateways");
    expect(navItems[i - 1]!.href).toBe("/payments");
    expect("/payment-gateways".startsWith("/payments")).toBe(false);
  });
});
