import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import fixture from "../__fixtures__/integrations.json";

/**
 * The admin portal's integrations (feature-register/integrations-api-contract.md,
 * "Dashboards"): clubs given API access (give, change, take away; usage;
 * the export), partner apps (register with redirect URIs and the scopes it
 * may ask for, the client secret shown once; suspend; connected clubs),
 * webhook health, the developer docs (the header's "Open developer docs", a
 * partner app's docs link shown once, the Docs links tab with its filters
 * and revoke; feature-register/private-dev-docs-contract.md), the rail's
 * item only on an API that has them, and what a role that may only look is
 * offered. The fixture is in the backend's own shapes (feat/partner-api
 * app/api/partner/admin_router.py, feat/api-webhooks
 * app/api/webhooks_out/router.py, feat/private-dev-docs
 * app/api/partner/docs_links.py).
 */
let role: string | null = "owner";
let search = "";
/** "old": every integrations route answers FastAPI's bare 404, an API from before them. */
let server: "new" | "old" = "new";
/** "old": the docs links' routes answer FastAPI's bare 404 (an API with integrations, from before docs links). */
let docsRoute: "ok" | "old" = "ok";
const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];
const notFound = () => new ApiError({ status: 404, message: "Not Found", routeMissing: true });

const USAGE = Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.UTC(2026, 9, 14 + i)).toISOString().slice(0, 10), requests: 600 + i, writes: 0, errors: i % 7 === 0 ? 4 : 0, rate_limited: 0, attendee_reads: 0 }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/integrations",
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    downloadXlsx: vi.fn(async () => {}),
    downloadCsv: vi.fn(),
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: role } }),
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: init?.query });
        if (path.startsWith("/api/v1/admin/integrations") && server === "old") throw notFound();
        if (path === "/api/v1/admin/integrations/clubs") return fixture.allocations;
        if (path === "/api/v1/admin/integrations/usage") return { days: USAGE, clients: [] };
        if (/\/admin\/integrations\/clubs\/\d+$/.test(path)) return fixture.club_detail;
        if (path === "/api/v1/admin/integrations/partner-apps") return fixture.partner_apps;
        if (/\/partner-apps\/p1$/.test(path)) return fixture.partner_detail;
        if (path === "/api/v1/admin/integrations/webhooks/health") return fixture.health;
        if (path === "/api/v1/admin/integrations/docs-links") {
          if (docsRoute === "old") throw notFound();
          // The server refuses a role that may not manage content, reading included.
          if (role === "viewer") throw new ApiError({ status: 403, message: "Your role can't do this.", errorCode: "ADMIN_ROLE_FORBIDDEN" });
          const app = init?.query?.partner_app_id;
          return app ? { links: fixture.docs_links.links.filter((l) => l.partner_app?.id === app) } : fixture.docs_links;
        }
        if (path === "/api/v1/clubs/admin/list")
          return { items: [{ id: 12, name: "Robotics Club", slug: "robotics", logo: null, is_verified: true }], total: 1, limit: 8, offset: 0 };
        throw notFound();
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/admin/integrations/partner-apps") return fixture.partner_created;
        if (/\/partner-apps\/p1\/suspend$/.test(path)) return { ...fixture.partner_apps.apps[0], status: "suspended" };
        if (/\/partner-apps\/p2\/resume$/.test(path)) return { ...fixture.partner_apps.apps[1], status: "active" };
        if (/\/partner-apps\/\w+\/rotate-secret$/.test(path)) return { ...fixture.partner_apps.apps[0], client_secret: "moa_cs_rotatedrotatedrotated" };
        if (path === "/api/v1/admin/integrations/docs-links") return (body as { partner_app_id?: string }).partner_app_id ? fixture.docs_app : fixture.docs_self;
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        const id = Number(path.split("/").at(-1));
        const row = fixture.allocations.clubs.find((r) => r.club.id === id) ?? { ...fixture.allocations.clubs[0], club: { id, name: "Robotics Club", slug: "robotics", verified: true } };
        return { ...row, ...(body as object) };
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        if (path.includes("/webhooks/endpoints/")) return { ...fixture.health.failing_endpoints[0], ...(body as object) };
        return { ...fixture.partner_apps.apps[0], ...(body as object) };
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return { disconnected: true };
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { pickExport } = await import("@/test/export-menu");
const { downloadXlsx } = await import("@moa/app-kit");
const { toast } = await import("@moa/ui");
const mod = await import("./index");
const { ClubsAccessPage, PartnerAppsPage, WebhookHealthPage, IntegrationsGate, DocsLinksPage, OpenDocsButton, docsTab } = mod;
const { visibleNavItems, navItems } = await import("@/components/nav-items");

const writeText = vi.fn(async (_t: string) => {});
/** The tab "Open developer docs" opens in the click, and sends on once the link is made. */
const docsWindow = { go: vi.fn((_url: string) => {}), close: vi.fn(() => {}) };
beforeEach(() => {
  vi.restoreAllMocks();
  role = "owner";
  search = "";
  server = "new";
  docsRoute = "ok";
  docsWindow.go.mockClear();
  docsWindow.close.mockClear();
  docsTab.open = vi.fn(() => docsWindow);
  calls.length = 0;
  vi.mocked(downloadXlsx).mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

const sent = (method: string, re: RegExp) => calls.filter((c) => c.method === method && re.test(c.path));
const rowOf = (name: string) => screen.getByText(name, { selector: "a, p" }).closest("tr")!;

describe("the rules", () => {
  it("takes https redirects, http only on this computer, and an app's own scheme; never a fragment or script", () => {
    expect(mod.redirectProblem("https://app.example/cb")).toBeNull();
    expect(mod.redirectProblem("http://localhost:3000/cb")).toBeNull();
    expect(mod.redirectProblem("http://127.0.0.1:8080/cb")).toBeNull();
    // As the server takes them: no app schemes, no fragments, http only back to this computer.
    expect(mod.redirectProblem("com.example.app:/oauth")).toMatch(/must use https/);
    expect(mod.redirectProblem("http://app.example/cb")).toMatch(/must use https/);
    expect(mod.redirectProblem("https://app.example/cb#x")).toMatch(/# part/);
    expect(mod.redirectProblem("javascript:alert(1)")).toMatch(/must use https/);
    const p = mod.partnerProblems({ ...mod.EMPTY_PARTNER_FORM, website: "http://x.example", contactEmail: "nope" });
    expect(Object.keys(p).sort()).toEqual(["contactEmail", "name", "redirects", "scopes", "website"]);
    const body = mod.partnerBody({ ...mod.EMPTY_PARTNER_FORM, name: " Sheet Sync ", website: "https://sheetsync.example", redirects: "https://sheetsync.example/oauth\nhttp://localhost:3000/cb\n", scopes: ["clubs:create", "registrations:read", "events:read"], tier: "high" });
    expect(body).toEqual({
      name: "Sheet Sync",
      description: null,
      logo_url: null,
      website: "https://sheetsync.example",
      contact_email: null,
      redirect_uris: ["https://sheetsync.example/oauth", "http://localhost:3000/cb"],
      allowed_scopes: ["events:read", "registrations:read", "clubs:create"],
      rate_tier: "high",
    });
    expect(mod.allocationProblems({ tier: "standard", maxKeys: "101", notes: "" }).maxKeys).toBe("A whole number from 0 to 100.");
    expect(mod.allocationProblems({ tier: "standard", maxKeys: "0", notes: "" })).toEqual({});
    expect(mod.allocationProblems({ tier: "high", maxKeys: "10", notes: "" })).toEqual({});
  });
});

describe("Integrations → Clubs with access", () => {
  it("lists each club's access, tier and keys, with the platform's 30 days", async () => {
    render(<ClubsAccessPage />);
    expect(await screen.findByRole("link", { name: "GDG Trivandrum" })).toHaveAttribute("href", "/clubs/5");
    const gdg = within(rowOf("GDG Trivandrum"));
    expect(gdg.getByText("On")).toBeInTheDocument();
    expect(gdg.getByText("Standard · 2/5 keys")).toBeInTheDocument();
    expect(gdg.getByText("Given here")).toBeInTheDocument();
    expect(within(rowOf("Quiz Society")).getByText("Off")).toBeInTheDocument();
    expect(within(rowOf("Quiz Society")).getByText("High · 0/10 keys")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: /API requests per day/ })).toBeInTheDocument();
  });

  it("gives a club access with a tier, a key limit and notes", async () => {
    const success = vi.spyOn(toast, "success");
    render(<ClubsAccessPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Give a club access/ }));
    const dialog = await screen.findByRole("dialog", { name: "Give a club API access" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Give access" }));
    expect(await within(dialog).findByText("Choose the club.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Club" }), { target: { value: "Robo" } });
    fireEvent.click(await within(dialog).findByRole("button", { name: /Robotics Club/ }));
    fireEvent.change(within(dialog).getByLabelText("Rate"), { target: { value: "high" } });
    fireEvent.change(within(dialog).getByLabelText("Most keys"), { target: { value: "8" } });
    fireEvent.change(within(dialog).getByLabelText(/Notes/), { target: { value: "Asked on 12 Nov" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Give access" }));
    await waitFor(() => expect(sent("PUT", /\/admin\/integrations\/clubs\/12$/)).toHaveLength(1));
    expect(sent("PUT", /clubs\/12$/)[0]!.body).toEqual({ enabled: true, rate_tier: "high", max_keys: 8, notes: "Asked on 12 Nov" });
    await waitFor(() => expect(success).toHaveBeenCalledWith("Robotics Club has API access. Its owner and admins make keys under Settings → Integrations."));
  });

  it("takes access away only after saying what stops", async () => {
    render(<ClubsAccessPage />);
    await screen.findByRole("link", { name: "GDG Trivandrum" });
    fireEvent.click(screen.getByRole("button", { name: "Change GDG Trivandrum's API access" }));
    const dialog = await screen.findByRole("dialog", { name: "GDG Trivandrum's API access" });
    expect(within(dialog).getByLabelText(/Notes/)).toHaveValue("Syncs with the college ERP");
    fireEvent.click(within(dialog).getByRole("switch", { name: "API access" }));
    expect(within(dialog).getByText(/API keys and the partner apps it connected are refused from that moment/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Take access away" }));
    await waitFor(() => expect(sent("PUT", /clubs\/5$/)[0]?.body).toEqual({ enabled: false, rate_tier: "standard", max_keys: 5, notes: "Syncs with the college ERP" }));
  });

  it("shows a club's usage, keys and connected apps, and revokes a key after asking", async () => {
    render(<ClubsAccessPage />);
    await screen.findByRole("link", { name: "GDG Trivandrum" });
    fireEvent.click(screen.getByRole("button", { name: "Keys and usage of GDG Trivandrum" }));
    const sheet = await screen.findByRole("dialog", { name: "GDG Trivandrum: API access" });
    expect(await within(sheet).findByRole("img", { name: /API requests per day/ })).toBeInTheDocument();
    expect(sent("GET", /\/admin\/integrations\/clubs\/5$/)).toHaveLength(1);
    const erp = within(sheet).getByRole("listitem", { name: "College ERP" });
    expect(within(erp).getByText("See people's details")).toBeInTheDocument();
    expect(within(erp).getByText(/made by Asha Nair/)).toBeInTheDocument();
    const old = within(sheet).getByRole("listitem", { name: "Old sheet script" });
    expect(within(old).getByText("Revoked")).toBeInTheDocument();
    expect(within(old).queryByRole("button", { name: /Revoke/ })).toBeNull();
    expect(within(sheet).getByText("EventHub")).toBeInTheDocument();
    fireEvent.click(within(erp).getByRole("button", { name: "Revoke College ERP" }));
    expect(sent("DELETE", /keys/)).toHaveLength(0);
    fireEvent.click(within(erp).getByRole("button", { name: "Revoke it" }));
    await waitFor(() => expect(sent("DELETE", /\/admin\/integrations\/keys\/k1$/)).toHaveLength(1));
  });

  it("exports the list as Excel", async () => {
    render(<ClubsAccessPage />);
    await screen.findByRole("link", { name: "GDG Trivandrum" });
    await pickExport(/Export/, "xlsx");
    await waitFor(() => expect(downloadXlsx).toHaveBeenCalled());
    const [name, rows, columns] = vi.mocked(downloadXlsx).mock.calls[0]!;
    expect(name).toMatch(/^api-access.*\.xlsx$/);
    expect((rows as unknown[]).length).toBe(2);
    expect((columns as readonly { header: string }[]).map((c) => c.header)).toContain("Notes");
  });

  it("a viewer reads it, with nothing to give or change", async () => {
    role = "viewer";
    render(<ClubsAccessPage />);
    await screen.findByRole("link", { name: "GDG Trivandrum" });
    expect(screen.queryByRole("button", { name: /Give a club access/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Change GDG/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Keys and usage of GDG Trivandrum" })).toBeInTheDocument();
  });
});

describe("Integrations → Partner apps", () => {
  it("lists apps with their client ID, what they may ask for, status and clubs", async () => {
    render(<PartnerAppsPage />);
    expect(await screen.findByText("EventHub")).toBeInTheDocument();
    const hub = within(rowOf("EventHub"));
    expect(hub.getByText("moa_client_7Hk2pQ")).toBeInTheDocument();
    expect(hub.getByText("See people's details")).toBeInTheDocument();
    expect(hub.getByText("Active")).toBeInTheDocument();
    const campus = within(rowOf("CampusOS"));
    expect(campus.getByText("Suspended")).toBeInTheDocument();
    expect(campus.getByText("Sent too many requests")).toBeInTheDocument();
    expect(campus.getByText("Create clubs")).toBeInTheDocument();
    expect(campus.getByRole("button", { name: "Resume CampusOS" })).toBeInTheDocument();
  });

  it("registers an app and shows its client secret once", async () => {
    render(<PartnerAppsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Register an app/ }));
    const dialog = await screen.findByRole("dialog", { name: "Register a partner app" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Sheet Sync" } });
    fireEvent.change(within(dialog).getByLabelText("Website"), { target: { value: "https://sheetsync.example" } });
    fireEvent.change(within(dialog).getByLabelText("Redirect URIs"), { target: { value: "http://sheetsync.example/oauth" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Register" }));
    expect(await within(dialog).findByText(/must use https/)).toBeInTheDocument();
    expect(within(dialog).getByText("Choose at least one thing it may ask clubs for.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Redirect URIs"), { target: { value: "https://sheetsync.example/oauth\nhttp://localhost:3000/cb" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /See registrations/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /See events/ }));
    expect(within(dialog).getByRole("group", { name: "The platform" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Register" }));
    await waitFor(() => expect(sent("POST", /\/admin\/integrations\/partner-apps$/)).toHaveLength(1));
    expect(sent("POST", /partner-apps$/)[0]!.body).toEqual({
      name: "Sheet Sync",
      description: null,
      logo_url: null,
      website: "https://sheetsync.example",
      contact_email: null,
      redirect_uris: ["https://sheetsync.example/oauth", "http://localhost:3000/cb"],
      allowed_scopes: ["events:read", "registrations:read"],
      rate_tier: "standard",
    });

    const shown = await screen.findByRole("dialog", { name: "Sheet Sync is registered" });
    expect(within(shown).getByTestId("client-id")).toHaveTextContent("moa_client_Nw9LxT");
    expect(within(shown).getByTestId("secret")).toHaveTextContent(fixture.partner_created.client_secret);
    expect(within(shown).getByText("Copy the secret now. It won't be shown again.")).toBeInTheDocument();
    fireEvent.click(within(shown).getByRole("button", { name: "Copy client secret" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(fixture.partner_created.client_secret));
    fireEvent.click(within(shown).getByRole("button", { name: "I've copied it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.textContent).not.toContain(fixture.partner_created.client_secret);
  });

  it("suspends only after asking, and a new secret is shown once", async () => {
    render(<PartnerAppsPage />);
    await screen.findByText("EventHub");
    fireEvent.click(screen.getByRole("button", { name: "Suspend EventHub" }));
    const ask = await screen.findByRole("alertdialog");
    expect(within(ask).getByText(/Its tokens stop working at once, for every club connected to it \(3\)/)).toBeInTheDocument();
    expect(sent("POST", /suspend/)).toHaveLength(0);
    fireEvent.change(within(ask).getByLabelText(/Why/), { target: { value: "Leaked secret" } });
    fireEvent.click(within(ask).getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(sent("POST", /\/partner-apps\/p1\/suspend$/)[0]?.body).toEqual({ reason: "Leaked secret" }));

    fireEvent.click(screen.getByRole("button", { name: "New secret for EventHub" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Make a new secret" }));
    const shown = await screen.findByRole("dialog", { name: "New secret for EventHub" });
    expect(within(shown).getByTestId("secret")).toHaveTextContent("moa_cs_rotatedrotatedrotated");
  });

  it("changes an app and warns when a scope is taken from connected clubs", async () => {
    render(<PartnerAppsPage />);
    await screen.findByText("EventHub");
    fireEvent.click(screen.getByRole("button", { name: "Change EventHub" }));
    const dialog = await screen.findByRole("dialog", { name: "Change EventHub" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /See people's details/ }));
    expect(within(dialog).getByText("Clubs that allowed See people's details lose it at once.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect((sent("PATCH", /\/partner-apps\/p1$/)[0]?.body as { allowed_scopes: string[] }).allowed_scopes).toEqual(["events:read", "events:write", "registrations:write"]));
  });

  it("lists the clubs connected to an app, and disconnects one after asking", async () => {
    render(<PartnerAppsPage />);
    await screen.findByText("EventHub");
    fireEvent.click(screen.getByRole("button", { name: "Clubs connected to EventHub" }));
    const sheet = await screen.findByRole("dialog", { name: "EventHub" });
    expect(within(sheet).getByRole("heading", { name: "Clubs connected to EventHub" })).toBeInTheDocument();
    const gdg = await within(sheet).findByRole("listitem", { name: "GDG Trivandrum" });
    expect(within(gdg).getByText("Create and edit events")).toBeInTheDocument();
    expect(within(gdg).getByText(/by Asha Nair/)).toBeInTheDocument();
    fireEvent.click(within(gdg).getByRole("button", { name: "Disconnect GDG Trivandrum" }));
    expect(sent("DELETE", /connections/)).toHaveLength(0);
    fireEvent.click(within(gdg).getByRole("button", { name: "Disconnect it" }));
    await waitFor(() => expect(sent("DELETE", /\/partner-apps\/p1\/connections\/c1$/)).toHaveLength(1));
  });

  it("a viewer can't register, change or suspend", async () => {
    role = "viewer";
    render(<PartnerAppsPage />);
    await screen.findByText("EventHub");
    expect(screen.queryByRole("button", { name: /Register an app/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Suspend|Change|New secret/ })).toBeNull();
  });
});

describe("Integrations → developer docs", () => {
  // The links' dates are the fixture's: "now" is the day they were made.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T12:00:00+05:30"));
  });
  afterEach(() => vi.useRealTimers());

  it("'Open developer docs' in the header makes the admin's own link and opens it in a new tab", async () => {
    render(<OpenDocsButton />);
    fireEvent.click(await screen.findByRole("button", { name: /Open developer docs/ }));
    expect(docsTab.open).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(docsWindow.go).toHaveBeenCalledWith(fixture.docs_self.url));
    expect(sent("POST", /\/admin\/integrations\/docs-links$/)[0]!.body).toEqual({ purpose: "self" });
    expect(document.body.textContent).not.toContain(fixture.docs_self.url);
  });

  it("offers no docs to a viewer, or on an API without docs links", async () => {
    role = "viewer";
    const a = render(<OpenDocsButton />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("button", { name: /Open developer docs/ })).toBeNull();
    expect(sent("GET", /docs-links/)).toHaveLength(0);
    a.unmount();

    role = "owner";
    docsRoute = "old";
    render(
      <IntegrationsGate>
        <OpenDocsButton />
      </IntegrationsGate>,
    );
    expect(await screen.findByRole("link", { name: "Partner apps" })).toBeInTheDocument();
    await waitFor(() => expect(sent("GET", /docs-links$/).length).toBeGreaterThan(0));
    expect(screen.queryByRole("link", { name: "Docs links" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Open developer docs/ })).toBeNull();
  });

  it("has a Docs links tab for an admin who may manage content", async () => {
    const a = render(
      <IntegrationsGate>
        <p>inside</p>
      </IntegrationsGate>,
    );
    expect(await screen.findByRole("link", { name: "Docs links" })).toHaveAttribute("href", "/integrations/docs-links");
    a.unmount();

    role = "viewer";
    render(
      <IntegrationsGate>
        <p>inside</p>
      </IntegrationsGate>,
    );
    expect(await screen.findByText("inside")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Docs links" })).toBeNull();
  });

  it("makes a docs link for a partner app's developers on its sheet, shown once", async () => {
    render(<PartnerAppsPage />);
    await screen.findByText("EventHub");
    fireEvent.click(await screen.findByRole("button", { name: "Docs link for EventHub's developers" }));
    const sheet = await screen.findByRole("dialog", { name: "EventHub" });
    const section = within(sheet).getByRole("region", { name: "Docs link for this app's developers" });
    // Its links so far, asked for by the app.
    expect(await within(section).findByText(/1 link for it works now/)).toBeInTheDocument();
    expect(sent("GET", /\/admin\/integrations\/docs-links$/).some((c) => c.query?.partner_app_id === "p1")).toBe(true);
    expect(within(section).getByRole("link", { name: "See them in Docs links" })).toHaveAttribute("href", "/integrations/docs-links?kind=partner_app&q=EventHub");

    fireEvent.change(within(section).getByLabelText(/Who it's for/), { target: { value: " EventHub dev team " } });
    fireEvent.click(within(section).getByRole("button", { name: "Make link" }));
    await waitFor(() => expect(sent("POST", /\/admin\/integrations\/docs-links$/)).toHaveLength(1));
    expect(sent("POST", /docs-links$/)[0]!.body).toEqual({ partner_app_id: "p1", label: "EventHub dev team" });

    expect(await within(section).findByTestId("docs-link")).toHaveTextContent(fixture.docs_app.url);
    expect(within(section).getByText("Copy it now. It won't be shown again.")).toBeInTheDocument();
    expect(within(section).getByText(/Anyone with this link can read the docs until it expires \(30 days\) or you revoke it\./)).toBeInTheDocument();
    fireEvent.click(within(section).getByRole("button", { name: "Copy docs link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(fixture.docs_app.url));
    fireEvent.click(within(section).getByRole("button", { name: "I've copied it" }));
    await waitFor(() => expect(document.body.textContent).not.toContain(fixture.docs_app.url));
    expect(within(section).getByRole("button", { name: "Make link" })).toBeInTheDocument();
  });

  it("makes none for a suspended app", async () => {
    render(<PartnerAppsPage />);
    await screen.findByText("CampusOS");
    fireEvent.click(screen.getByRole("button", { name: "Docs link for CampusOS's developers" }));
    const sheet = await screen.findByRole("dialog", { name: "CampusOS" });
    expect(within(sheet).getByText("Resume the app to make a docs link for it.")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Make link" })).toBeNull();
  });

  it("lists every link, whose it is and when it was used, and revokes one only after asking", async () => {
    render(<DocsLinksPage />);
    const ravi = within((await screen.findByText("Ravi, our web agency", { selector: "p" })).closest("tr")!);
    expect(ravi.getByRole("link", { name: "GDG Trivandrum" })).toHaveAttribute("href", "/clubs/5");
    expect(ravi.getByText("Working")).toBeInTheDocument();
    expect(ravi.getByText(/by Asha Nair/)).toBeInTheDocument();
    expect(within(rowOf("For the app's developers")).getByText("EventHub (partner app)")).toBeInTheDocument();
    expect(within(rowOf("Opened from the dashboard")).getByText("Admin")).toBeInTheDocument();
    const old = within(rowOf("Old agency"));
    expect(old.getByText("Revoked")).toBeInTheDocument();
    expect(old.queryByRole("button", { name: /Revoke/ })).toBeNull();
    // A link the club's owner made is the club account's, as on keys.
    expect(mod.byName({ name: "The club's own account" })).toBe("the club account");

    fireEvent.click(ravi.getByRole("button", { name: "Revoke Ravi, our web agency" }));
    const ask = await screen.findByRole("alertdialog", { name: "Revoke “Ravi, our web agency”?" });
    expect(within(ask).getByText(/GDG Trivandrum: anyone using this link loses the docs within 5 minutes/)).toBeInTheDocument();
    expect(sent("DELETE", /docs-links/)).toHaveLength(0);
    fireEvent.click(within(ask).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(sent("DELETE", /\/admin\/integrations\/docs-links\/a1$/)).toHaveLength(1));
  });

  it("filters by whose, by status and by a search", async () => {
    search = "kind=partner_app";
    const a = render(<DocsLinksPage />);
    expect(await screen.findByText("For the app's developers", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText("Ravi, our web agency")).toBeNull();
    a.unmount();

    search = "status=revoked";
    const b = render(<DocsLinksPage />);
    expect(await screen.findByText("Old agency", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText("Ravi, our web agency")).toBeNull();
    b.unmount();

    search = "q=vivek";
    render(<DocsLinksPage />);
    expect(await screen.findByText("Old agency", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText("For the app's developers")).toBeNull();
  });

  it("is for admins who manage content only", async () => {
    role = "viewer";
    render(<DocsLinksPage />);
    expect(await screen.findByText("Only admins who manage content can see and revoke docs links.")).toBeInTheDocument();
    expect(sent("GET", /docs-links/)).toHaveLength(0);
  });
});

describe("Integrations → Webhook health", () => {
  it("counts the week's deliveries and lists the failing endpoints, whose they are and what they answer", async () => {
    render(<WebhookHealthPage />);
    const delivered = fixture.health.per_day.reduce((n, d) => n + d.succeeded, 0);
    expect(await screen.findByText(delivered.toLocaleString("en-IN"))).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Webhook deliveries per day/ })).toBeInTheDocument();
    const hook = screen.getByRole("listitem", { name: "https://hooks.eventhub.example/moa/club-5" });
    expect(within(hook).getByRole("link", { name: "GDG Trivandrum" })).toHaveAttribute("href", "/clubs/5");
    expect(within(hook).getByText(/made by a partner app · failing since .* · 31 in a row · HTTP 503/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Busiest clubs" })).toHaveTextContent("3,100 sent");
    fireEvent.click(within(hook).getByRole("button", { name: "Turn off https://hooks.eventhub.example/moa/club-5" }));
    await waitFor(() => expect(sent("PATCH", /\/webhooks\/endpoints\/w2$/)[0]?.body).toEqual({ enabled: false }));
    await pickExport(/Export/, "xlsx");
    await waitFor(() => expect(downloadXlsx).toHaveBeenCalled());
    expect(vi.mocked(downloadXlsx).mock.calls[0]![0]).toMatch(/^failing-webhooks.*\.xlsx$/);
  });
});

describe("on an API from before integrations", () => {
  it("leaves the rail's item out and says so on the page", async () => {
    expect(visibleNavItems([], { integrations: false }).some((i) => i.href === "/integrations")).toBe(false);
    expect(visibleNavItems([], { integrations: true }).some((i) => i.href === "/integrations")).toBe(true);
    expect(navItems.find((i) => i.href === "/integrations")?.probe).toBe("integrations");

    server = "old";
    render(
      <IntegrationsGate>
        <p>inside</p>
      </IntegrationsGate>,
    );
    expect(await screen.findByText("Not available on this server yet")).toBeInTheDocument();
    expect(screen.queryByText("inside")).toBeNull();
  });

  it("shows the sections once the API has them", async () => {
    render(
      <IntegrationsGate>
        <p>inside</p>
      </IntegrationsGate>,
    );
    expect(await screen.findByText("inside")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Partner apps" })).toHaveAttribute("href", "/integrations/partner-apps");
  });
});
