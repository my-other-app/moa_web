import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import fixture from "../__fixtures__/integrations.json";

/**
 * The admin portal's integrations (feature-register/integrations-api-contract.md,
 * "Dashboards"): clubs given API access (give, change, take away; usage;
 * the export), partner apps (register with redirect URIs and the scopes it
 * may ask for, the client secret shown once; suspend; connected clubs),
 * webhook health, the rail's item only on an API that has them, and what
 * a role that may only look is offered.
 */
let role: string | null = "owner";
let search = "";
/** "old": every integrations route answers FastAPI's bare 404, an API from before them. */
let server: "new" | "old" = "new";
const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];
const notFound = () => new ApiError({ status: 404, message: "Not Found", routeMissing: true });

const USAGE = Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 14 + i)).toISOString().slice(0, 10), requests: 600 + i, errors: i % 7 === 0 ? 4 : 0 }));

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
        if (path === "/api/v1/admin/integrations/usage") return { days: USAGE };
        if (/\/admin\/integrations\/clubs\/\d+\/usage$/.test(path)) return { days: USAGE.slice(0, 5) };
        if (path === "/api/v1/admin/integrations/partner-apps") return fixture.partner_apps;
        if (/\/partner-apps\/\w+\/clubs$/.test(path)) return fixture.partner_clubs;
        if (path === "/api/v1/admin/integrations/webhooks/health") return fixture.health;
        if (path === "/api/v1/clubs/admin/list")
          return { items: [{ id: 12, name: "Robotics Club", slug: "robotics", logo: null, is_verified: true }], total: 1, limit: 8, offset: 0 };
        throw notFound();
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/admin/integrations/partner-apps") return fixture.partner_created;
        if (/\/partner-apps\/p1\/suspend$/.test(path)) return { ...fixture.partner_apps.items[0], status: "suspended" };
        if (/\/partner-apps\/p2\/resume$/.test(path)) return { ...fixture.partner_apps.items[1], status: "active" };
        if (/\/partner-apps\/\w+\/rotate-secret$/.test(path)) return { app: fixture.partner_apps.items[0], client_secret: "moa_cs_rotatedrotatedrotated" };
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        const id = Number(path.split("/").at(-1));
        const row = fixture.allocations.items.find((r) => r.club.id === id) ?? { ...fixture.allocations.items[0], club: { id, name: "Robotics Club", slug: "robotics" } };
        return { ...row, ...(body as object) };
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return { ...fixture.partner_apps.items[0], ...(body as object) };
      }),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { pickExport } = await import("@/test/export-menu");
const { downloadXlsx } = await import("@moa/app-kit");
const { toast } = await import("@moa/ui");
const mod = await import("./index");
const { ClubsAccessPage, PartnerAppsPage, WebhookHealthPage, IntegrationsGate } = mod;
const { visibleNavItems, navItems } = await import("@/components/nav-items");

const writeText = vi.fn(async (_t: string) => {});
beforeEach(() => {
  vi.restoreAllMocks();
  role = "owner";
  search = "";
  server = "new";
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
    expect(mod.redirectProblem("com.example.app:/oauth")).toBeNull();
    expect(mod.redirectProblem("http://app.example/cb")).toMatch(/must use https/);
    expect(mod.redirectProblem("https://app.example/cb#x")).toMatch(/# part/);
    expect(mod.redirectProblem("javascript:alert(1)")).toMatch(/can't be a redirect/);
    expect(mod.redirectProblem("myapp:/cb")).toMatch(/com\.example\.app/);
    const p = mod.partnerProblems({ ...mod.EMPTY_PARTNER_FORM, website: "http://x.example" });
    expect(Object.keys(p).sort()).toEqual(["name", "redirects", "scopes", "website"]);
    const body = mod.partnerBody({ name: " Sheet Sync ", logoUrl: "", website: "https://sheetsync.example", redirects: "https://sheetsync.example/oauth\ncom.sheetsync.app:/oauth\n", scopes: ["clubs:create", "registrations:read", "events:read"] });
    expect(body).toEqual({
      name: "Sheet Sync",
      logo_url: null,
      website: "https://sheetsync.example",
      redirect_uris: ["https://sheetsync.example/oauth", "com.sheetsync.app:/oauth"],
      allowed_scopes: ["events:read", "registrations:read", "clubs:create"],
    });
    expect(mod.allocationProblems({ tier: "standard", maxKeys: "0", notes: "" }).maxKeys).toBe("A whole number from 1 to 50.");
    expect(mod.allocationProblems({ tier: "high", maxKeys: "10", notes: "" })).toEqual({});
  });
});

describe("Integrations → Clubs with access", () => {
  it("lists each club's access, tier, keys and use, with the platform's 30 days", async () => {
    render(<ClubsAccessPage />);
    expect(await screen.findByRole("link", { name: "GDG Trivandrum" })).toHaveAttribute("href", "/clubs/5");
    const gdg = within(rowOf("GDG Trivandrum"));
    expect(gdg.getByText("On")).toBeInTheDocument();
    expect(gdg.getByText("Standard · 2/5 keys")).toBeInTheDocument();
    expect(gdg.getByText("112 errors")).toBeInTheDocument();
    expect(within(rowOf("Quiz Society")).getByText("Taken away")).toBeInTheDocument();
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
    expect(sent("PUT", /clubs\/12$/)[0]!.body).toEqual({ allocated: true, rate_tier: "high", max_keys: 8, notes: "Asked on 12 Nov" });
    await waitFor(() => expect(success).toHaveBeenCalledWith("Robotics Club has API access. Its owner and admins make keys under Settings → Integrations."));
  });

  it("takes access away only after saying what stops", async () => {
    render(<ClubsAccessPage />);
    await screen.findByRole("link", { name: "GDG Trivandrum" });
    fireEvent.click(screen.getByRole("button", { name: "Change GDG Trivandrum's API access" }));
    const dialog = await screen.findByRole("dialog", { name: "GDG Trivandrum's API access" });
    expect(within(dialog).getByLabelText(/Notes/)).toHaveValue("Syncs with the college ERP");
    fireEvent.click(within(dialog).getByRole("switch", { name: "API access" }));
    expect(within(dialog).getByText(/Every key GDG Trivandrum made stops working at once/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Take access away" }));
    await waitFor(() => expect(sent("PUT", /clubs\/5$/)[0]?.body).toEqual({ allocated: false, rate_tier: "standard", max_keys: 5, notes: "Syncs with the college ERP" }));
  });

  it("shows a club's own usage", async () => {
    render(<ClubsAccessPage />);
    await screen.findByRole("link", { name: "GDG Trivandrum" });
    fireEvent.click(screen.getByRole("button", { name: "Usage of GDG Trivandrum" }));
    const sheet = await screen.findByRole("dialog", { name: "GDG Trivandrum: API usage" });
    expect(await within(sheet).findByRole("img", { name: /API requests per day/ })).toBeInTheDocument();
    expect(sent("GET", /\/clubs\/5\/usage$/)[0]!.query).toEqual({ days: 30 });
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
    expect(screen.getByRole("button", { name: "Usage of GDG Trivandrum" })).toBeInTheDocument();
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
    fireEvent.change(within(dialog).getByLabelText("Redirect URIs"), { target: { value: "https://sheetsync.example/oauth\ncom.sheetsync.app:/oauth" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /See registrations/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /See events/ }));
    expect(within(dialog).getByRole("group", { name: "The platform" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Register" }));
    await waitFor(() => expect(sent("POST", /\/admin\/integrations\/partner-apps$/)).toHaveLength(1));
    expect(sent("POST", /partner-apps$/)[0]!.body).toEqual({
      name: "Sheet Sync",
      logo_url: null,
      website: "https://sheetsync.example",
      redirect_uris: ["https://sheetsync.example/oauth", "com.sheetsync.app:/oauth"],
      allowed_scopes: ["events:read", "registrations:read"],
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
    fireEvent.click(within(ask).getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(sent("POST", /\/partner-apps\/p1\/suspend$/)).toHaveLength(1));

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

  it("lists the clubs connected to an app", async () => {
    render(<PartnerAppsPage />);
    await screen.findByText("EventHub");
    fireEvent.click(screen.getByRole("button", { name: "Clubs connected to EventHub" }));
    const sheet = await screen.findByRole("dialog", { name: "Clubs connected to EventHub" });
    const gdg = await within(sheet).findByRole("listitem", { name: "GDG Trivandrum" });
    expect(within(gdg).getByText("Create and edit events")).toBeInTheDocument();
    expect(within(gdg).getByText(/by Asha Nair/)).toBeInTheDocument();
  });

  it("a viewer can't register, change or suspend", async () => {
    role = "viewer";
    render(<PartnerAppsPage />);
    await screen.findByText("EventHub");
    expect(screen.queryByRole("button", { name: /Register an app/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Suspend|Change|New secret/ })).toBeNull();
  });
});

describe("Integrations → Webhook health", () => {
  it("counts the week's deliveries and lists the failing endpoints, whose they are and what they answer", async () => {
    render(<WebhookHealthPage />);
    expect(await screen.findByText("4,210")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Webhook deliveries per day/ })).toBeInTheDocument();
    const hook = screen.getByRole("listitem", { name: "https://hooks.eventhub.example/moa/club-5" });
    expect(within(hook).getByRole("link", { name: "GDG Trivandrum" })).toHaveAttribute("href", "/clubs/5");
    expect(within(hook).getByText(/via EventHub · failing since .* · 31 in a row · answered 503/)).toBeInTheDocument();
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
