import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import fixture from "../__fixtures__/integrations.json";

/**
 * The club dashboard's integrations (feature-register/integrations-api-contract.md,
 * "Dashboards"): Settings → Integrations with its API keys (a key shown
 * once, scopes in groups, the DPDP tick before people's details), webhook
 * endpoints (a test, the delivery log and a replay), connected partner apps
 * and usage; the rail's item, there only for an allocated club's owner or
 * admin on an API that has integrations; and the consent page a partner
 * app sends the club to.
 */

type Role = "owner" | "admin" | "editor" | "door";
const CAN = { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: true, delete_events: false, door: true };
const me = (role: Role) => ({
  role,
  role_label: role.charAt(0).toUpperCase() + role.slice(1),
  role_description: "",
  can: role === "door" ? { ...CAN, edit_events: false } : role === "editor" ? CAN : { ...CAN, manage_access: role === "owner", see_access: true, money: true, club_profile: true, delete_events: true },
  club_id: 5,
  club_name: "GDG Trivandrum",
  member: null,
});

const notFound = () => new ApiError({ status: 404, message: "Not Found", routeMissing: true });
const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];

const USAGE_DAYS = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 9, 14 + i)).toISOString().slice(0, 10),
  requests: i === 29 ? 0 : 100 + i,
  errors: i % 10 === 0 ? 3 : 0,
}));

const state = {
  role: "owner" as Role,
  /** GET /clubs/integrations: "old" answers FastAPI's bare 404 (an API from before integrations). */
  status: fixture.status as unknown,
  statusRoute: "ok" as "ok" | "old" | "not_allocated",
  keys: fixture.keys.items as unknown[],
  consent: fixture.consent as unknown,
  consentError: null as ApiError | null,
  decideError: null as ApiError | null,
  testAnswer: { id: "t1", event_id: "evt_t1", type: "event.updated", status: "succeeded", attempts: 1, response_status: 200, test: true } as unknown,
};

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/settings/integrations",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: init?.query });
        if (path === "/api/v1/clubs/access/me") return me(state.role);
        if (path === "/api/v1/clubs/integrations") {
          if (state.statusRoute === "old") throw notFound();
          if (state.statusRoute === "not_allocated") throw new ApiError({ status: 403, message: "API access isn't on for this club.", errorCode: "NOT_ALLOCATED" });
          return state.status;
        }
        if (path === "/api/v1/clubs/integrations/keys") return { items: state.keys };
        if (path === "/api/v1/clubs/integrations/webhooks") return fixture.webhooks;
        if (/\/webhooks\/\w+\/deliveries$/.test(path)) return fixture.deliveries;
        if (path === "/api/v1/clubs/integrations/apps") return fixture.apps;
        if (path === "/api/v1/clubs/integrations/usage") return { days: USAGE_DAYS };
        if (path.startsWith("/api/v1/clubs/integrations/consent/")) {
          if (state.consentError) throw state.consentError;
          return state.consent;
        }
        // The plan and everything else of the rail: an older API, nothing locked.
        throw notFound();
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/clubs/integrations/keys") return fixture.created;
        if (/\/keys\/\w+\/rotate$/.test(path)) return { key: fixture.keys.items[0], secret: "moa_live_Qx7pNEWNEWNEWNEWNEWNEWNEWNEWNEWNEWNEWN" };
        if (path === "/api/v1/clubs/integrations/webhooks") return fixture.endpoint_created;
        if (/\/webhooks\/\w+\/test$/.test(path)) return state.testAnswer;
        if (/\/webhooks\/deliveries\/\w+\/retry$/.test(path)) return { ...fixture.deliveries.items[0], attempts: 8 };
        if (/\/webhooks\/\w+\/rotate-secret$/.test(path)) return { endpoint: fixture.webhooks.items[0], secret: "whsec_rotated" };
        if (path.startsWith("/api/v1/clubs/integrations/consent/")) {
          if (state.decideError) throw state.decideError;
          const b = body as { decision: string };
          return { redirect_to: b.decision === "allow" ? "https://app.eventhub.example/callback?code=abc&state=xyz" : "https://app.eventhub.example/callback?error=access_denied&state=xyz" };
        }
        throw new Error(`unstubbed POST ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        const e = fixture.webhooks.items.find((w) => path.endsWith(`/${w.id}`))!;
        return { ...e, ...(body as object) };
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return undefined;
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { IntegrationsPage, ConsentPage, integrationsBrowser } = await import("./index");
const schemas = await import("./schemas");
const { SidebarNav } = await import("@/components/sidebar-nav");
const { blockedBy } = await import("@/features/access");

const writeText = vi.fn(async (_text: string) => {});
beforeEach(() => {
  calls.length = 0;
  Object.assign(state, {
    role: "owner",
    status: fixture.status,
    statusRoute: "ok",
    keys: fixture.keys.items,
    consent: fixture.consent,
    consentError: null,
    decideError: null,
    testAnswer: { id: "t1", event_id: "evt_t1", type: "event.updated", status: "succeeded", attempts: 1, response_status: 200, test: true },
  });
  Object.values(router).forEach((f) => f.mockClear());
  vi.restoreAllMocks();
  integrationsBrowser.go = vi.fn();
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

const sent = (method: string, re: RegExp) => calls.filter((c) => c.method === method && re.test(c.path));
const tab = async (name: string) => fireEvent.click(await screen.findByRole("tab", { name }));

// ─── The rules ───────────────────────────────────────────────────────────

describe("scopes, keys and webhooks, as rules", () => {
  it("groups scopes in the catalogue's order, and keeps one this build doesn't know", () => {
    expect(schemas.groupScopes(["checkins:write", "events:read", "club:read", "attendees:read", "registrations:read", "events:publish"])).toEqual([
      { key: "club", label: "The club", scopes: ["club:read"] },
      { key: "events", label: "Events", scopes: ["events:read", "events:publish"] },
      { key: "people", label: "Registrations and people", scopes: ["registrations:read", "attendees:read"] },
      { key: "door", label: "At the door", scopes: ["checkins:write"] },
    ]);
    expect(schemas.groupScopes(["events:read", "tickets:read"]).at(-1)).toEqual({ key: "other", label: "Other", scopes: ["tickets:read"] });
    // Every scope of the contract has words, and sits in exactly one group.
    const grouped = schemas.SCOPE_GROUPS.flatMap((g) => g.scopes);
    expect([...grouped].sort()).toEqual([...schemas.SCOPES].sort());
    for (const s of schemas.SCOPES) expect(schemas.SCOPE_INFO[s].description.length).toBeGreaterThan(10);
  });

  it("won't give people's details without the club's DPDP tick", () => {
    const base = { ...schemas.EMPTY_KEY_FORM, name: "Gate scanner", scopes: ["checkins:write", "attendees:read"] };
    expect(schemas.needsNoticeTick(base.scopes)).toBe(true);
    expect(schemas.keyFormProblems(base).notice).toMatch(/Tick this/);
    expect(schemas.keyFormProblems({ ...base, noticeTicked: true })).toEqual({});
    expect(schemas.keyBody({ ...base, noticeTicked: true }).attendees_notice_ack).toBe(true);
    // Without the scope, the tick is neither asked for nor sent.
    expect(schemas.keyFormProblems({ ...base, scopes: ["checkins:write"] })).toEqual({});
    expect(schemas.keyBody({ ...base, scopes: ["checkins:write"], noticeTicked: true }).attendees_notice_ack).toBe(false);
    expect(schemas.noticeText("College ERP")).toBe("Our registration form tells people their details are shared with College ERP.");
  });

  it("checks the rest of a key: a name, a scope, a future date, real addresses", () => {
    const p = schemas.keyFormProblems({ ...schemas.EMPTY_KEY_FORM, expiry: "date", expiryDate: "2026-01-01", allowlist: "203.0.113.10\n10.0.0.0/33, nonsense" }, "2026-11-12");
    expect(Object.keys(p).sort()).toEqual(["allowlist", "expiry", "name", "scopes"]);
    expect(p.allowlist).toBe("Not an IP address or range: 10.0.0.0/33, nonsense");
    expect(schemas.parseAllowlist("203.0.113.10, 198.51.100.0/24\n2001:db8::1\n2001:db8::/32").bad).toEqual([]);
    expect(schemas.expiryAt("30", "", new Date("2026-11-12T00:00:00Z"))).toBe("2026-12-12T00:00:00.000Z");
    expect(schemas.expiryAt("date", "2027-03-31")).toBe("2027-03-31T23:59:59+05:30");
    expect(schemas.expiryAt("never", "")).toBeNull();
    const now = new Date("2026-11-12T00:00:00Z");
    expect(schemas.keyStatus({ revoked_at: null, expires_at: "2026-11-01T00:00:00Z" }, now)).toBe("expired");
    expect(schemas.keyStatus({ revoked_at: "2026-10-01T00:00:00Z", expires_at: null }, now)).toBe("revoked");
  });

  it("takes only a public https address for a webhook", () => {
    expect(schemas.webhookUrlProblem("http://erp.example.edu/hook")).toBe("It must start with https://.");
    expect(schemas.webhookUrlProblem("https://localhost:8000/hook")).toBe("Use a public address with a domain name.");
    expect(schemas.webhookUrlProblem("https://10.0.0.5/hook")).toBe("Use a public address with a domain name.");
    expect(schemas.webhookUrlProblem("not a url")).toBe("That isn't a web address.");
    expect(schemas.webhookUrlProblem("https://erp.example.edu/hook")).toBeNull();
    expect(schemas.endpointBody({ ...schemas.EMPTY_ENDPOINT_FORM, url: " https://a.example/h ", all: false, events: ["checkin.created", "event.created"] }).events).toEqual(["event.created", "checkin.created"]);
  });

  it("says what a test or a replay came to", () => {
    const d = (over: object) => schemas.deliverySchema.parse({ id: "1", type: "event.updated", status: "succeeded", attempts: 1, response_status: 200, ...over });
    expect(schemas.deliveryOutcome(d({}))).toEqual({ ok: true, text: "Delivered: your endpoint answered 200." });
    expect(schemas.deliveryOutcome(d({ status: "failed", response_status: 500 })).text).toBe("Your endpoint answered 500. Anything but a 2xx counts as failed.");
    expect(schemas.deliveryOutcome(d({ status: "failed", response_status: null, error: "Timed out after 10 s." })).text).toBe("Couldn't reach your endpoint: Timed out after 10 s.");
  });

  it("shows the section to an allocated club, or one with a partner app to disconnect", () => {
    const s = schemas.statusSchema.parse(fixture.status);
    expect(schemas.integrationsVisible(s)).toBe(true);
    expect(schemas.integrationsVisible({ ...s, allocated: false, apps_connected: 0 })).toBe(false);
    expect(schemas.integrationsVisible({ ...s, allocated: false, apps_connected: 1 })).toBe(true);
    expect(schemas.integrationsVisible(null)).toBe(false);
    expect(schemas.safeRedirect("javascript:alert(1)")).toBeNull();
    expect(schemas.safeRedirect("com.eventhub.app:/oauth?code=1")).toBe("com.eventhub.app:/oauth?code=1");
  });
});

// ─── Settings → Integrations ─────────────────────────────────────────────

describe("Settings → Integrations: API keys", () => {
  it("lists each key by its first characters, scopes and last use, never the key itself", async () => {
    render(<IntegrationsPage />);
    const keys = await screen.findByRole("region", { name: "API keys" });
    const erp = await within(keys).findByRole("listitem", { name: "College ERP" });
    expect(within(erp).getByText("moa_live_Qx7p…")).toBeInTheDocument();
    expect(within(erp).getByText("See people's details")).toBeInTheDocument();
    expect(within(erp).getByText("Check people in")).toBeInTheDocument();
    expect(within(erp).getByText(/Last used .* from/)).toBeInTheDocument();
    expect(within(erp).getByText(/only from 203\.0\.113\.10/)).toBeInTheDocument();
    expect(within(keys).getByText(/API keys · 2 of 5/)).toBeInTheDocument();
    const old = within(keys).getByRole("listitem", { name: "Old sheet script" });
    expect(within(old).getByText("Revoked")).toBeInTheDocument();
    expect(within(old).queryByRole("button", { name: /Revoke|Rotate/ })).toBeNull();
    expect(screen.getByText(/Standard rate: 600 reads and 120 changes a minute/)).toBeInTheDocument();
  });

  it("makes a key with the DPDP tick, and shows the key once", async () => {
    render(<IntegrationsPage />);
    await screen.findByRole("listitem", { name: "College ERP" });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    const dialog = await screen.findByRole("dialog", { name: "Create an API key" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Gate scanner" } });
    // Scopes in their groups, each in plain words.
    expect(within(dialog).getByRole("group", { name: "At the door" })).toBeInTheDocument();
    expect(within(dialog).getByText("Mark someone as arrived, and undo it.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Check people in/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /See people's details/ }));
    // People's details: the club's word that its form says so, or no key.
    const tick = within(dialog).getByRole("checkbox", { name: "Our registration form tells people their details are shared with Gate scanner." });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    expect(await within(dialog).findByText("Tick this to give it people's details.")).toBeInTheDocument();
    expect(sent("POST", /\/integrations\/keys$/)).toHaveLength(0);

    fireEvent.click(tick);
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(sent("POST", /\/integrations\/keys$/)).toHaveLength(1));
    expect(sent("POST", /\/integrations\/keys$/)[0]!.body).toEqual({
      name: "Gate scanner",
      mode: "live",
      scopes: ["attendees:read", "checkins:write"],
      expires_at: null,
      ip_allowlist: [],
      attendees_notice_ack: true,
    });

    const shown = await screen.findByRole("dialog", { name: "“Gate scanner” is ready" });
    expect(within(shown).getByTestId("secret")).toHaveTextContent(fixture.created.secret);
    expect(within(shown).getByText("Copy it now. It won't be shown again.")).toBeInTheDocument();
    fireEvent.click(within(shown).getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(fixture.created.secret));
    fireEvent.click(within(shown).getByRole("button", { name: "I've copied it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Gone for good: nothing on the page holds it any more.
    expect(document.body.textContent).not.toContain(fixture.created.secret);
  });

  it("revokes only after asking, and a rotation shows the new key once", async () => {
    render(<IntegrationsPage />);
    const erp = await screen.findByRole("listitem", { name: "College ERP" });
    fireEvent.click(within(erp).getByRole("button", { name: "Revoke" }));
    const ask = await screen.findByRole("alertdialog");
    expect(within(ask).getByText(/refused from that moment/)).toBeInTheDocument();
    expect(sent("DELETE", /keys/)).toHaveLength(0);
    fireEvent.click(within(ask).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(sent("DELETE", /\/integrations\/keys\/k1$/)).toHaveLength(1));

    fireEvent.click(within(erp).getByRole("button", { name: "Rotate" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Rotate" }));
    const shown = await screen.findByRole("dialog", { name: "New key for “College ERP”" });
    expect(within(shown).getByText("The old key has stopped working. Put this one in your system now.")).toBeInTheDocument();
    expect(within(shown).getByTestId("secret")).toHaveTextContent("moa_live_Qx7pNEW");
    expect(sent("POST", /\/keys\/k1\/rotate$/)).toHaveLength(1);
  });

  it("stops at the club's most keys", async () => {
    state.status = { ...fixture.status, max_keys: 2 };
    render(<IntegrationsPage />);
    expect(await screen.findByText(/Your club has 2 active keys, the most it may have/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create key" })).toBeDisabled();
  });
});

describe("Settings → Integrations: webhooks", () => {
  it("sends a test and says what the endpoint answered", async () => {
    const success = vi.spyOn(toast, "success");
    render(<IntegrationsPage />);
    await tab("Webhooks");
    const erp = await screen.findByRole("listitem", { name: "https://erp.example.edu/moa/webhooks" });
    expect(within(erp).getByText("Working")).toBeInTheDocument();
    expect(within(erp).getByText(/Everything/)).toBeInTheDocument();
    fireEvent.click(within(erp).getByRole("button", { name: "Send test" }));
    await waitFor(() => expect(sent("POST", /\/webhooks\/w1\/test$/)).toHaveLength(1));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Test sent. Delivered: your endpoint answered 200."));
  });

  it("says a test failed, in the endpoint's answer", async () => {
    const error = vi.spyOn(toast, "error");
    state.testAnswer = { id: "t2", type: "event.updated", status: "failed", attempts: 1, response_status: 401, test: true };
    render(<IntegrationsPage />);
    await tab("Webhooks");
    const erp = await screen.findByRole("listitem", { name: "https://erp.example.edu/moa/webhooks" });
    fireEvent.click(within(erp).getByRole("button", { name: "Send test" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Test sent. Your endpoint answered 401. Anything but a 2xx counts as failed."));
  });

  it("shows a failing endpoint, a partner's own, and replays a delivery from the log", async () => {
    const error = vi.spyOn(toast, "error");
    render(<IntegrationsPage />);
    await tab("Webhooks");
    const hub = await screen.findByRole("listitem", { name: "https://hooks.eventhub.example/moa/club-5" });
    expect(within(hub).getByText("Failing")).toBeInTheDocument();
    expect(within(hub).getByText(/after three days of failures it is turned off/)).toBeInTheDocument();
    expect(within(hub).getByText(/added by EventHub/)).toBeInTheDocument();
    // The partner app's endpoint: it changes it, not the club (which may still turn it off).
    expect(within(hub).queryByRole("button", { name: "Remove" })).toBeNull();
    expect(within(hub).getByRole("switch")).toBeInTheDocument();

    fireEvent.click(within(hub).getByRole("button", { name: "Delivery log" }));
    const log = await screen.findByRole("dialog", { name: "Delivery log" });
    const failed = await within(log).findByRole("listitem", { name: "Someone registers, Failed" });
    expect(within(failed).getByText(/7 attempts · answered 500/)).toBeInTheDocument();
    expect(within(log).getByRole("listitem", { name: "Someone is checked in, Delivered" })).toBeInTheDocument();
    fireEvent.click(within(failed).getByRole("button", { name: "Send again" }));
    await waitFor(() => expect(sent("POST", /\/webhooks\/deliveries\/d2\/retry$/)).toHaveLength(1));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Sent again. Your endpoint answered 500. Anything but a 2xx counts as failed."));

    fireEvent.click(within(log).getByRole("button", { name: "Failed" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/webhooks/w2/deliveries") && c.query?.status === "failed")).toBe(true));
  });

  it("turns an endpoint off and on", async () => {
    render(<IntegrationsPage />);
    await tab("Webhooks");
    const erp = await screen.findByRole("listitem", { name: "https://erp.example.edu/moa/webhooks" });
    fireEvent.click(within(erp).getByRole("switch", { name: "Turn off https://erp.example.edu/moa/webhooks" }));
    await waitFor(() => expect(sent("PATCH", /\/webhooks\/w1$/)[0]?.body).toEqual({ enabled: false }));
  });

  it("adds an https endpoint for some changes, and shows its secret once", async () => {
    render(<IntegrationsPage />);
    await tab("Webhooks");
    fireEvent.click(await screen.findByRole("button", { name: "Add endpoint" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a webhook endpoint" });
    fireEvent.change(within(dialog).getByLabelText("Address"), { target: { value: "http://sheet.example.org/hook" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add endpoint" }));
    expect(await within(dialog).findByText("It must start with https://.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Address"), { target: { value: "https://sheet.example.org/hook" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Only some" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add endpoint" }));
    expect(await within(dialog).findByText("Choose at least one kind of change, or All.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Someone registers" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Also send changes made with your own API keys" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add endpoint" }));
    await waitFor(() => expect(sent("POST", /\/integrations\/webhooks$/)).toHaveLength(1));
    expect(sent("POST", /\/integrations\/webhooks$/)[0]!.body).toEqual({ url: "https://sheet.example.org/hook", description: null, events: ["registration.created"], include_own_changes: true });
    const shown = await screen.findByRole("dialog", { name: "Endpoint added" });
    expect(within(shown).getByTestId("secret")).toHaveTextContent(fixture.endpoint_created.secret);
    fireEvent.click(within(shown).getByRole("button", { name: "I've copied it" }));
    await waitFor(() => expect(document.body.textContent).not.toContain(fixture.endpoint_created.secret));
  });
});

describe("Settings → Integrations: connected apps and usage", () => {
  it("disconnects a partner app only after asking", async () => {
    render(<IntegrationsPage />);
    await tab("Connected apps");
    const hub = await screen.findByRole("listitem", { name: "EventHub" });
    expect(within(hub).getByText("eventhub.example")).toBeInTheDocument();
    expect(within(hub).getByText(/by Asha Nair \(admin\)/)).toBeInTheDocument();
    expect(within(hub).getByText("Create and edit events")).toBeInTheDocument();
    fireEvent.click(within(hub).getByRole("button", { name: "Disconnect" }));
    const ask = await screen.findByRole("alertdialog");
    expect(within(ask).getByText(/loses access to your club at once/)).toBeInTheDocument();
    expect(sent("DELETE", /apps/)).toHaveLength(0);
    fireEvent.click(within(ask).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(sent("DELETE", /\/integrations\/apps\/c1$/)).toHaveLength(1));
  });

  it("draws 30 days of requests and errors", async () => {
    render(<IntegrationsPage />);
    await tab("Usage");
    const chart = await screen.findByRole("img", { name: /API requests per day/ });
    const totals = schemas.usageTotals(USAGE_DAYS);
    expect(chart).toHaveAccessibleName(expect.stringContaining(`${totals.requests.toLocaleString("en-IN")} in all, ${totals.errors} of them errors`));
    expect(sent("GET", /\/integrations\/usage$/)[0]!.query).toEqual({ days: 30 });
    expect(screen.getByText(/Your club may make 600 reads and 120 changes a minute/)).toBeInTheDocument();
  });
});

describe("Settings → Integrations: who sees it, and when", () => {
  it("is the owner's and admins': an editor is told, and nothing is asked", async () => {
    state.role = "editor";
    render(<IntegrationsPage />);
    expect(await screen.findByText("Only the club's owner or an admin can see and change integrations.")).toBeInTheDocument();
    expect(sent("GET", /\/clubs\/integrations/)).toHaveLength(0);
    expect(blockedBy("/settings/integrations", { integrations: false })?.what).toBe("integrations");
    expect(blockedBy("/settings/integrations", { integrations: true })).toBeNull();
  });

  it("says it isn't on for a club the team hasn't allocated, or on an older API", async () => {
    state.statusRoute = "not_allocated";
    const a = render(<IntegrationsPage />);
    expect(await screen.findByText(/API access isn't on for your club/)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    a.unmount();

    state.statusRoute = "old";
    render(<IntegrationsPage />);
    expect(await screen.findByText(/API access isn't on for your club/)).toBeInTheDocument();
    expect(sent("GET", /\/integrations\/keys$/)).toHaveLength(0);
  });

  it("keeps Connected apps for a club with a partner app but no API access", async () => {
    state.status = { ...fixture.status, allocated: false, keys_active: 0, apps_connected: 1 };
    render(<IntegrationsPage />);
    expect(await screen.findByRole("listitem", { name: "EventHub" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "API keys" })).toBeNull();
    expect(screen.getByText(/API keys and webhooks of your own come with API access/)).toBeInTheDocument();
    expect(sent("GET", /\/integrations\/keys$/)).toHaveLength(0);
  });
});

describe("the rail's Integrations item", () => {
  it("shows for an allocated club's owner or admin, and hides on an older API, an unallocated club and other roles", async () => {
    const a = render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: /Integrations/ })).toHaveAttribute("href", "/settings/integrations");
    a.unmount();

    calls.length = 0;
    state.statusRoute = "old";
    const b = render(<SidebarNav />);
    await waitFor(() => expect(sent("GET", /\/clubs\/integrations$/).length).toBeGreaterThan(0));
    expect(screen.getByRole("link", { name: /Club profile/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Integrations/ })).toBeNull();
    b.unmount();

    calls.length = 0;
    state.statusRoute = "ok";
    state.status = { ...fixture.status, allocated: false, apps_connected: 0 };
    const c = render(<SidebarNav />);
    await waitFor(() => expect(sent("GET", /\/clubs\/integrations$/).length).toBeGreaterThan(0));
    expect(screen.queryByRole("link", { name: /Integrations/ })).toBeNull();
    c.unmount();

    calls.length = 0;
    state.status = fixture.status;
    state.role = "editor";
    render(<SidebarNav />);
    await waitFor(() => expect(screen.queryByRole("link", { name: /Club profile/ })).toBeNull());
    expect(screen.queryByRole("link", { name: /Integrations/ })).toBeNull();
    expect(sent("GET", /\/clubs\/integrations$/)).toHaveLength(0);
  });
});

// ─── The consent page ────────────────────────────────────────────────────

describe("a partner app asking to connect", () => {
  it("names the app, the club and each thing it asks for, and needs the DPDP tick for people's details", async () => {
    render(<ConsentPage requestId="req_8Kq2" />);
    expect(await screen.findByRole("heading", { name: "EventHub wants to connect to GDG Trivandrum" })).toBeInTheDocument();
    expect(screen.getByText("eventhub.example")).toBeInTheDocument();
    // Only what it asked for, all ticked to start with.
    expect(screen.getByRole("checkbox", { name: /Create and edit events/ })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Check people in/ })).toBeNull();
    expect(screen.getByText("Either way, you go back to app.eventhub.example.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(await screen.findByText(/Tick this to give it people's details/)).toBeInTheDocument();
    expect(sent("POST", /consent/)).toHaveLength(0);

    fireEvent.click(screen.getByRole("checkbox", { name: "Our registration form tells people their details are shared with EventHub." }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Create and edit events/ }));
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(sent("POST", /\/integrations\/consent\/req_8Kq2$/)).toHaveLength(1));
    expect(sent("POST", /consent/)[0]!.body).toEqual({ decision: "allow", scopes: ["events:read", "registrations:read", "attendees:read"], attendees_notice_ack: true });
    await waitFor(() => expect(integrationsBrowser.go).toHaveBeenCalledWith("https://app.eventhub.example/callback?code=abc&state=xyz"));
  });

  it("asks no tick when people's details are taken off", async () => {
    render(<ConsentPage requestId="req_8Kq2" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /See people's details/ }));
    expect(screen.queryByRole("checkbox", { name: /Our registration form tells people/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(sent("POST", /consent/)[0]?.body).toEqual({ decision: "allow", scopes: ["events:read", "events:write", "registrations:read"], attendees_notice_ack: false }));
  });

  it("Cancel goes back to the app with a refusal", async () => {
    render(<ConsentPage requestId="req_8Kq2" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(sent("POST", /consent/)[0]?.body).toEqual({ decision: "deny", scopes: [], attendees_notice_ack: false }));
    await waitFor(() => expect(integrationsBrowser.go).toHaveBeenCalledWith("https://app.eventhub.example/callback?error=access_denied&state=xyz"));
  });

  it("an editor can't allow it, and is told who can", async () => {
    state.consent = { ...fixture.consent, can_decide: false, cannot_decide_reason: null };
    render(<ConsentPage requestId="req_8Kq2" />);
    expect(await screen.findByText(/Only the club's owner or an admin can connect an app/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("says a used or old link has run out, and sends a signed-out person to sign in and back", async () => {
    state.consentError = new ApiError({ status: 410, message: "Gone", errorCode: "CONSENT_EXPIRED" });
    const a = render(<ConsentPage requestId="req_8Kq2" />);
    expect(await screen.findByRole("heading", { name: "This link has run out" })).toBeInTheDocument();
    a.unmount();

    state.consentError = new ApiError({ status: 401, message: "Not signed in" });
    render(<ConsentPage requestId="req_8Kq2" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?next=%2Fconnect%2Freq_8Kq2"));
  });

  it("says when the API can't connect apps yet", async () => {
    state.consentError = notFound();
    render(<ConsentPage requestId="req_8Kq2" />);
    expect(await screen.findByRole("heading", { name: "Connecting apps isn't available yet" })).toBeInTheDocument();
  });

  it("is marked when the app asks for a test connection, or is already connected", async () => {
    state.consent = { ...fixture.consent, livemode: false, already: { scopes: ["events:read"], connected_at: "2026-11-01T10:00:00+05:30" } };
    render(<ConsentPage requestId="req_8Kq2" />);
    expect(await screen.findByText(/A test connection: it sees and changes only test events/)).toBeInTheDocument();
    expect(screen.getByText(/EventHub is already connected to your club/)).toBeInTheDocument();
  });
});
