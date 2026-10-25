import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender } from "@testing-library/react";
import { NextRequest } from "next/server";

import type { FakeState } from "@/test/fake-api";

/**
 * The operator tools ride on GET /admin/ops/me: a backend without it (the
 * route-level 404) shows none of them -- no rail item, no page, no banner --
 * and one with it shows what it lists. The two-factor rule is read from the
 * same probe, on the server (the dashboard layout sends a blocked admin to
 * /setup-2fa) and in the browser (the grace banner; a refused call).
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));
const server = vi.hoisted(() => ({
  session: { user: { id: 1, user_type: "admin", admin_role: "owner", username: "o", email: "o@x", full_name: "Owner" } as unknown, allowed: true },
  probe: null as unknown,
  probeError: null as Error | null,
}));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  })
);

vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirect(to),
  unstable_rethrow: () => undefined,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/auth/server", () => ({
  getSessionWithRole: vi.fn(async () => ({ ...server.session, refusal: null })),
  createServerApiClient: () => ({
    get: vi.fn(async () => {
      if (server.probeError) throw server.probeError;
      return server.probe;
    }),
  }),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: state.role } }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, refusal } = await import("@/test/fake-api");
const { OpsGate, OpsBanners, graceNotice, hasFeature, TwoFactorWatch, isTwoFactorRequired } = await import("./index");
const { readOpsMeOnServer } = await import("./server");
const { SidebarNav } = await import("@/components/sidebar-nav");
const { visibleNavItems, navItems } = await import("@/components/nav-items");
const { default: DashboardLayout } = await import("@/app/(dashboard)/layout");
const { proxy, config } = await import("@/proxy");

const TOOL_LINKS = ["Payouts", "Disputes", "Push", "Mail suppressions", "WhatsApp templates", "Admins", "Settings", "Jobs"];

beforeEach(() => {
  freshState(state);
  state.handlers["GET /api/v1/admin/reports"] = () => ({ items: [], total: 0 });
  redirect.mockClear();
  server.probe = null;
  server.probeError = null;
  server.session = { user: { id: 1, user_type: "admin", admin_role: "owner", username: "o", email: "o@x", full_name: "Owner" }, allowed: true };
});

describe("a backend without the operator tools", () => {
  it("shows a quiet note on a tool's page, never the tool", async () => {
    state.ops = null;
    render(
      <OpsGate feature="payouts">
        <p>the payouts tool</p>
      </OpsGate>
    );
    expect(await screen.findByText("Not available on this server yet")).toBeInTheDocument();
    expect(screen.queryByText("the payouts tool")).toBeNull();
  });

  it("keeps every tool out of the rail, and the rest of it as it was", async () => {
    state.ops = null;
    render(<SidebarNav />);
    await screen.findByRole("link", { name: "Payments" });
    await waitFor(() => expect(state.calls.some((c) => c.path === "/api/v1/admin/ops/me")).toBe(true));
    for (const name of TOOL_LINKS) expect(screen.queryByRole("link", { name })).toBeNull();
    expect(visibleNavItems(null).length).toBe(navItems.filter((n) => !n.feature).length);
  });

  it("draws no banner", async () => {
    state.ops = null;
    const { container } = render(<OpsBanners />);
    await waitFor(() => expect(state.calls.length).toBeGreaterThan(0));
    expect(container).toBeEmptyDOMElement();
  });

  it("is the same when the probe fails some other way: the tools stay hidden", async () => {
    state.handlers["GET /api/v1/admin/ops/me"] = () => {
      throw refusal(500, "Internal Server Error");
    };
    render(
      <OpsGate feature="jobs">
        <p>the jobs tool</p>
      </OpsGate>
    );
    expect(await screen.findByText("Not available on this server yet")).toBeInTheDocument();
  });
});

describe("a backend with them", () => {
  it("opens the tool it lists", async () => {
    render(
      <OpsGate feature="payouts">
        <p>the payouts tool</p>
      </OpsGate>
    );
    expect(await screen.findByText("the payouts tool")).toBeInTheDocument();
  });

  it("puts each listed tool in the rail, in its group", async () => {
    render(<SidebarNav />);
    for (const name of TOOL_LINKS) expect(await screen.findByRole("link", { name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Payouts" })).toHaveAttribute("href", "/payouts");
    expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", "/jobs");
    const hrefs = navItems.map((n) => n.href);
    expect(hrefs.indexOf("/payouts")).toBe(hrefs.indexOf("/revenue") + 1);
    expect(hrefs.indexOf("/reports")).toBe(hrefs.indexOf("/notifications") + 1);
  });

  it("leaves out a tool it does not list", async () => {
    state.ops = { features: ["payouts"] };
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Payouts" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Disputes" })).toBeNull();
    expect(hasFeature({ features: ["payouts"] }, "disputes")).toBe(false);
  });

  it("shows the maintenance line an owner set", async () => {
    state.ops = { features: [], maintenance_banner: "Payments pause at 11 pm for 10 minutes" };
    render(<OpsBanners />);
    expect(await screen.findByText("Payments pause at 11 pm for 10 minutes")).toBeInTheDocument();
  });

  it("tells an admin without two-factor the day their grace ends, with a way to set it up", async () => {
    state.ops = { features: [], two_factor: { required: true, enabled: false, grace_ends_at: "2026-11-01T10:00:00+00:00", blocked: false } };
    render(<OpsBanners />);
    expect(await screen.findByText(/Turn on two-factor sign-in by 1 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set it up" })).toHaveAttribute("href", "/security");
  });

  it("says nothing of a grace to an admin who has two-factor, or one already blocked", () => {
    expect(graceNotice({ required: true, enabled: true, grace_ends_at: "2026-11-01T00:00:00Z", blocked: false })).toBeNull();
    expect(graceNotice({ required: true, enabled: false, grace_ends_at: "2026-11-01T00:00:00Z", blocked: true })).toBeNull();
    expect(graceNotice({ required: false, enabled: false, grace_ends_at: null, blocked: false })).toBeNull();
  });
});

describe("two-factor, required", () => {
  it("sends a blocked admin from the dashboard to /setup-2fa", async () => {
    server.probe = { features: [], two_factor: { required: true, enabled: false, grace_ends_at: null, blocked: true } };
    await expect(DashboardLayout({ children: null })).rejects.toThrow("redirect /setup-2fa");
  });

  it("lets everyone else in, and a backend without the probe changes nothing", async () => {
    server.probe = { features: [], two_factor: { required: true, enabled: false, grace_ends_at: "2026-11-01T00:00:00Z", blocked: false } };
    await expect(DashboardLayout({ children: null })).resolves.toBeTruthy();
    server.probeError = refusal(404, "Not Found");
    await expect(DashboardLayout({ children: null })).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reads the probe as nothing when it cannot be read", async () => {
    server.probeError = new TypeError("fetch failed");
    expect(await readOpsMeOnServer()).toBeNull();
  });

  it("sends the admin to set it up the moment an admin call is refused for it", async () => {
    const go = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rtlRender(
      <QueryClientProvider client={client}>
        <TwoFactorWatch go={go} />
      </QueryClientProvider>
    );
    await act(async () => {
      await client
        .fetchQuery({
          queryKey: ["x"],
          queryFn: () => {
            throw refusal(403, "Turn on two-factor sign-in to keep using the admin portal.", "ADMIN_2FA_REQUIRED");
          },
        })
        .catch(() => undefined);
    });
    expect(go).toHaveBeenCalledWith("/setup-2fa");
    expect(isTwoFactorRequired(refusal(403, "Your admin role cannot destroy", "INSUFFICIENT_ADMIN_ROLE"))).toBe(false);
  });

  it("leaves the set-password page of an invited admin unguarded (they have no session yet)", () => {
    const guarded = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
    expect(guarded("/accept-invite")).toBe(false);
    expect(guarded("/setup-2fa")).toBe(true);
    const response = proxy(new NextRequest("https://main-portal.myotherapp.in/setup-2fa"));
    expect(response.headers.get("location")).toContain("/login?next=");
  });
});
