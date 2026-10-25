import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, isRouteMissing, nullIfRouteMissing, toApiError } from "@moa/api";
import { TooltipProvider } from "@moa/ui";

/**
 * The dashboard deployed ahead of its backend. Against an API from before
 * clubs' own WhatsApp (backend #106) and message quotas (#105), every new
 * route answers FastAPI's own `{"detail": "Not Found"}`: nothing of those
 * features is shown, nothing says it failed, and nothing spins. A 404 the
 * backend raises itself (an ErrorResponse, always with a `message`) is not
 * read as a missing feature. Once the backend has the routes, it all
 * appears on the next read, with no dashboard deploy.
 */

type Server = "old" | "new";
let server: Server = "old";
/** GET /clubs/access/me; null: it fails, so the page assumes the club's own account (OWNER_CAN). */
let me: unknown = null;
/** Per-path answers that win over the server's: an Error is thrown. */
let override: Record<string, unknown> = {};
const calls: string[] = [];

const NEW_ROUTES = /^\/api\/v1\/clubs\/(whatsapp|messages|alerts|mailbox)(\/|$)/;

/** What the API answers, as the gateway passes it on, made into the error the client throws. */
function answered(status: number, body: unknown) {
  return toApiError(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}
const routeMissing = () => answered(404, { detail: "Not Found" });

const ACCOUNT = {
  available: true,
  plan_allows: true,
  connected: true,
  status: "active",
  display_phone_number: "+91 98470 12345",
  verified_name: "Circuit Society",
  quality_rating: "GREEN",
  can_manage: true,
  can_inbox: true,
};

function channel(over: Record<string, unknown> = {}) {
  return { used: 120, limit: 1000, extra: 0, blocked: 0, rate_paise: 10, extra_paise: 0, percent: 12, state: "ok", kinds: {}, warned: [], ...over };
}
const USAGE = {
  period: "2026-10",
  period_label: "October 2026",
  plan_key: "growth",
  plan_name: "Growth",
  billing: "razorpay",
  blocks_past_limit: false,
  custom: false,
  trial: null,
  channels: { email: channel(), whatsapp: channel({ limit: 250, rate_paise: 100 }) },
  estimated_extra_paise: 0,
  upgrade: null,
};

/** The new backend's answers to the new routes. */
const NEW: Record<string, unknown> = {
  "/api/v1/clubs/whatsapp/account": ACCOUNT,
  "/api/v1/clubs/whatsapp/overview": { account: ACCOUNT, stats: null, quality_history: [] },
  "/api/v1/clubs/messages/usage": USAGE,
  "/api/v1/clubs/messages/history": { items: [] },
  "/api/v1/clubs/alerts": { items: [], unread: 0 },
  "/api/v1/clubs/mailbox": {
    available: true, domain: "mail.myotherapp.in", plan_allows: true, set_up: true, address: "circuit@mail.myotherapp.in",
    state: "open", can_manage: true, can_mail: true, is_owner: true,
  },
  "/api/v1/clubs/mailbox/summary": { unread_total: 0, unread_threads: 0, spam_unread: 0, archive_unread: 0 },
};

/** Who is signed in, from a backend before #106: its caps don't mention WhatsApp at all. */
const OLD_OWNER = {
  role: "owner",
  role_label: "Owner",
  role_description: "Everything.",
  can: {
    manage_access: true, see_access: true, money: true, club_profile: true, edit_events: true, club_store: true,
    delete_events: true, door: true, payment_gateway: true, site_domain: true, ai_key: true, connected_apps: true, approve_actions: true,
  },
  club_id: 5,
  club_name: "Circuit Society",
  member: null,
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push(path);
        if (path in override) {
          const a = override[path];
          if (a instanceof Error) throw a;
          return a;
        }
        if (path === "/api/v1/clubs/access/me") {
          if (me) return me;
          throw new ApiError({ message: "Not signed in", status: 401 });
        }
        if (path === "/api/v1/clubs/entitlements") return {};
        if (path === "/api/v1/clubs/access") {
          return {
            owner_email: "circuit@example.com",
            members: [{ id: 7, email: "priya@example.com", full_name: "Priya Nair", role: "editor", role_label: "Editor", status: "active", invite_expired: false, invited_at: null, accepted_at: null, last_seen_at: null }],
            roles: [{ key: "editor", label: "Editor", description: "Events." }],
            can_manage: true,
          };
        }
        if (NEW_ROUTES.test(path)) {
          if (server === "old") throw await routeMissing();
          if (path in NEW) return NEW[path];
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { SidebarNav } = await import("./sidebar-nav");
const { WhatsAppOverviewCard, WhatsAppSettingsPage, WhatsAppInboxPage, WhatsAppTemplatesPage } = await import("@/features/whatsapp");
const { AccessPage, blockedBy } = await import("@/features/access");
const { meSchema } = await import("@/features/access/schemas");
const { MessageUsageCard } = await import("@/features/message-usage");
const { ClubBell, CLUB_ALERTS_KEY, NO_BELL_EVERY, ALERTS_EVERY } = await import("@/features/club-alerts");
const { MailboxPage, MailSettingsPage } = await import("@/features/mailbox");

function render(ui: React.ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const view = rtlRender(
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

/** Every query the tree started has answered (or failed). */
async function settled(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
}

const whatsappLink = () => screen.queryByRole("link", { name: /^WhatsApp/ });
const mailLink = () => screen.queryByRole("link", { name: /^Mail/ });

beforeEach(() => {
  server = "old";
  me = null;
  override = {};
  calls.length = 0;
});

describe("telling a missing route from the backend's own 404", () => {
  it("reads only FastAPI's bare 404 as a route that isn't there", async () => {
    expect(isRouteMissing(await routeMissing())).toBe(true);
    // The backend's own 404s are ErrorResponses: a message, with or without a code.
    expect(isRouteMissing(await answered(404, { message: "No such template.", errors: null, error_code: "TEMPLATE_NOT_FOUND", track_id: null }))).toBe(false);
    expect(isRouteMissing(await answered(404, { message: "Club not found", errors: null, error_code: null, track_id: null }))).toBe(false);
    // A route that is there and raised a plain HTTPException with words of its own.
    expect(isRouteMissing(await answered(404, { detail: "Event not found" }))).toBe(false);
    // Only a 404 can be a missing route; a proxy's HTML is not the API's word.
    expect(isRouteMissing(await answered(405, { detail: "Not Found" }))).toBe(false);
    expect(isRouteMissing(await toApiError(new Response("<html>404</html>", { status: 404 })))).toBe(false);
    expect(isRouteMissing(new Error("Not Found"))).toBe(false);
    expect(isRouteMissing(new ApiError({ message: "Not Found", status: 404 }))).toBe(false);
  });

  it("turns a missing route into an answer of null, and lets every other failure through", async () => {
    const missing = await routeMissing();
    await expect(nullIfRouteMissing(async () => Promise.reject(missing))).resolves.toBeNull();
    await expect(nullIfRouteMissing(async () => ({ ok: 1 }))).resolves.toEqual({ ok: 1 });
    const coded = await answered(404, { message: "No such template.", errors: null, error_code: "TEMPLATE_NOT_FOUND", track_id: null });
    await expect(nullIfRouteMissing(async () => Promise.reject(coded))).rejects.toBe(coded);
  });
});

describe("before clubs' own WhatsApp (backend #106)", () => {
  it("leaves WhatsApp out of the rail, even while the page still assumes the club's own account", async () => {
    const { client } = render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Events" })).toBeInTheDocument();
    await settled(client);
    expect(calls).toContain("/api/v1/clubs/whatsapp/account");
    expect(whatsappLink()).toBeNull();
  });

  it("leaves it out with the old server's caps too, which don't mention WhatsApp", async () => {
    me = OLD_OWNER;
    const { client } = render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Events" })).toBeInTheDocument();
    await settled(client);
    expect(whatsappLink()).toBeNull();
  });

  it("shows it once the backend has it", async () => {
    server = "new";
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: /^WhatsApp/ })).toHaveAttribute("href", "/whatsapp");
  });

  it("doesn't hide it over a 404 the backend raised itself", async () => {
    override["/api/v1/clubs/whatsapp/account"] = await answered(404, { message: "Club not found", errors: null, error_code: null, track_id: null });
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: /^WhatsApp/ })).toBeInTheDocument();
  });

  it("puts no WhatsApp card on the dashboard, and stops asking for its overview", async () => {
    const { container, client } = render(<WhatsAppOverviewCard />);
    await settled(client);
    expect(container).toBeEmptyDOMElement();
    const asked = calls.filter((p) => p.endsWith("/whatsapp/overview")).length;
    await act(() => client.refetchQueries());
    expect(calls.filter((p) => p.endsWith("/whatsapp/overview")).length).toBe(asked);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["the inbox", WhatsAppInboxPage],
    ["templates", WhatsAppTemplatesPage],
    ["settings", WhatsAppSettingsPage],
  ])("says calmly that %s isn't available yet when someone opens the address", async (_, Page) => {
    render(<Page />);
    const panel = await screen.findByRole("region", { name: "WhatsApp" });
    expect(within(panel).getByText("Not available yet")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Back to the dashboard" })).toHaveAttribute("href", "/");
    // No tabs to pages that wouldn't open, no lock, no talk of permissions or failures.
    expect(screen.queryByRole("navigation", { name: "WhatsApp sections" })).toBeNull();
    expect(screen.queryByText(/permission|Could not load|isn't open to you/i)).toBeNull();
  });

  it("doesn't tell the owner their role can't open WhatsApp: an old server's caps lock nothing there", () => {
    const old = meSchema.parse(OLD_OWNER).can;
    expect(old).toMatchObject({ whatsapp: false, whatsapp_known: false });
    expect(blockedBy("/whatsapp", old)).toBeNull();
    expect(blockedBy("/whatsapp/settings", old)).toBeNull();
    // A server that has it still holds a role without it to its limits.
    const editor = meSchema.parse({ ...OLD_OWNER, role: "editor", can: { ...OLD_OWNER.can, whatsapp_account: false, whatsapp_inbox: false } }).can;
    expect(editor).toMatchObject({ whatsapp: false, whatsapp_known: true });
    expect(blockedBy("/whatsapp", editor)?.what).toBe("WhatsApp");
    // Its other rules are untouched.
    expect(blockedBy("/finance", { ...old, money: false })?.what).toBe("Finance");
  });

  it("offers no WhatsApp permission on Access, with nothing to give it on", async () => {
    me = OLD_OWNER;
    const { client } = render(<AccessPage />);
    expect(await screen.findByRole("combobox", { name: "Role for Priya Nair" })).toBeInTheDocument();
    await settled(client);
    expect(screen.queryByRole("switch", { name: /WhatsApp permission/ })).toBeNull();
    expect(screen.queryByText(/reads and answers the club's WhatsApp messages/)).toBeNull();
  });
});

describe("before club mailboxes", () => {
  it("leaves Mail out of the rail, and asks for no summary", async () => {
    const { client } = render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Events" })).toBeInTheDocument();
    await settled(client);
    expect(calls).toContain("/api/v1/clubs/mailbox");
    expect(mailLink()).toBeNull();
    expect(calls).not.toContain("/api/v1/clubs/mailbox/summary");
  });

  it("leaves it out of a backend that has them but has them switched off", async () => {
    server = "new";
    override["/api/v1/clubs/mailbox"] = { ...(NEW["/api/v1/clubs/mailbox"] as object), available: false };
    const { client } = render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: /^WhatsApp/ })).toBeInTheDocument();
    await settled(client);
    expect(mailLink()).toBeNull();
  });

  it.each([
    ["Mail", MailboxPage],
    ["Mail settings", MailSettingsPage],
  ])("says calmly that %s isn't available yet", async (_, Page) => {
    render(<Page />);
    const panel = await screen.findByRole("region", { name: "Mail" });
    expect(within(panel).getByText("Not available yet")).toBeInTheDocument();
    expect(screen.queryByText(/permission|Could not load/i)).toBeNull();
  });

  it("refuses no role at /mail on a server whose caps don't mention it", () => {
    const old = meSchema.parse(OLD_OWNER).can;
    expect(old).toMatchObject({ mail: false, mail_known: false });
    expect(blockedBy("/mail", old)).toBeNull();
  });

  it("offers no Mail permission on Access", async () => {
    me = OLD_OWNER;
    const { client } = render(<AccessPage />);
    expect(await screen.findByRole("combobox", { name: "Role for Priya Nair" })).toBeInTheDocument();
    await settled(client);
    expect(screen.queryByRole("switch", { name: /Mail permission/ })).toBeNull();
  });
});

describe("before message quotas (backend #105)", () => {
  it("leaves the usage card off the overview, with no skeleton left behind", async () => {
    const { container, client } = render(<MessageUsageCard />);
    await settled(client);
    expect(container).toBeEmptyDOMElement();
  });

  it("leaves it off Billing too, rather than saying it couldn't load", async () => {
    const { container, client } = render(<MessageUsageCard variant="billing" />);
    await settled(client);
    expect(container).toBeEmptyDOMElement();
    expect(calls).toEqual(expect.arrayContaining(["/api/v1/clubs/messages/usage", "/api/v1/clubs/messages/history"]));
  });

  it("still says so on Billing when a backend that has it fails", async () => {
    server = "new";
    override["/api/v1/clubs/messages/usage"] = await answered(500, { message: "Internal Server Error", errors: { error: "x" }, error_code: null, track_id: "t" });
    render(<MessageUsageCard variant="billing" />);
    expect(await screen.findByText(/Could not load this month's messages/)).toBeInTheDocument();
  });

  it("shows no bell, and asks for one only now and then", async () => {
    const { container, client } = render(<ClubBell />);
    await settled(client);
    expect(container).toBeEmptyDOMElement();
    const query = client.getQueryCache().find({ queryKey: CLUB_ALERTS_KEY })!;
    expect(query.state.data).toBeNull();
    const every = query.observers[0]!.options.refetchInterval as (q: typeof query) => number;
    expect(every(query)).toBe(NO_BELL_EVERY);
  });
});

describe("the day the backend is deployed", () => {
  it("shows the rail's WhatsApp, the bell and the month's messages on their next read, with no dashboard deploy", async () => {
    const { client } = render(
      <>
        <SidebarNav />
        <ClubBell />
        <MessageUsageCard />
        <WhatsAppOverviewCard />
      </>,
    );
    expect(await screen.findByRole("link", { name: "Events" })).toBeInTheDocument();
    await settled(client);
    expect(whatsappLink()).toBeNull();
    expect(mailLink()).toBeNull();
    expect(screen.queryByRole("button", { name: /Notifications/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Messages this month" })).toBeNull();
    expect(screen.queryByRole("region", { name: "WhatsApp overview" })).toBeNull();

    // What a refocused tab, or the bell's own timer, does.
    server = "new";
    await act(() => client.refetchQueries());

    expect(await screen.findByRole("link", { name: /^WhatsApp/ })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /^Mail/ })).toHaveAttribute("href", "/mail");
    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Messages this month" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "WhatsApp overview" })).toBeInTheDocument();
    const bell = client.getQueryCache().find({ queryKey: CLUB_ALERTS_KEY })!;
    expect((bell.observers[0]!.options.refetchInterval as (q: typeof bell) => number)(bell)).toBe(ALERTS_EVERY);
  });
});
