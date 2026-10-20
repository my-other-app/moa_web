import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toApiError } from "@moa/api";

import securityFixture from "../__fixtures__/security-overview.json";

/**
 * Connected apps on the Security page, against docs/MCP.md section 7.2:
 * GET /clubs/connected-apps → {can_manage_all, apps}, DELETE
 * /clubs/connected-apps/{id} → {disconnected, id}. Owners and admins see
 * every app, anyone else their own (the server decides; the page says
 * which). Off (404 or 503 MCP_DISABLED), the section is not there. The plan
 * gate is `mcp`, Growth and up.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/security" }));

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

const CLAUDE = {
  id: "1d0c0000-1111-2222-3333-444455556666",
  app: { name: "Claude", client_id: "mcp_abc", uri: "https://claude.ai", logo_uri: null, registration: "dcr" },
  connected_by: { type: "member", member_id: 7, name: "Eddie Editor", email: "editor@example.com", role: "editor" },
  scopes: [
    { key: "events:read", label: "Read your events" },
    { key: "events:write", label: "Draft events" },
    { key: "comms:write", label: "Draft announcements" },
  ],
  connected_at: ago(3 * 60 * MIN),
  last_used_at: ago(2 * MIN),
  pending_actions: 1,
};
const CURSOR = {
  id: "2e0d0000-1111-2222-3333-444455556666",
  app: { name: "Cursor", client_id: "mcp_def", uri: null, logo_uri: null, registration: "dcr" },
  connected_by: { type: "owner" },
  scopes: [{ key: "events:read", label: "Read your events" }],
  connected_at: ago(26 * 60 * MIN),
  last_used_at: null,
  pending_actions: 0,
};

const ACCESS_OWNER = {
  role: "owner",
  role_label: "Owner",
  role_description: "",
  can: { manage_access: true, see_access: true, money: true, club_profile: true, edit_events: true, delete_events: true, door: true, connected_apps: true, approve_actions: true },
  club_id: 1,
  club_name: "Circuit Society",
  member: null,
};
const MEMBER_ROW = {
  id: 7,
  email: "editor@example.com",
  full_name: "Eddie Editor",
  role: "editor",
  role_label: "Editor",
  status: "active",
  invite_expired: false,
  invited_at: null,
  accepted_at: null,
  last_seen_at: null,
};
const ACCESS_EDITOR = {
  ...ACCESS_OWNER,
  role: "editor",
  role_label: "Editor",
  can: { ...ACCESS_OWNER.can, manage_access: false, see_access: false, money: false, club_profile: false, delete_events: false, connected_apps: false },
  member: MEMBER_ROW,
};

const CATALOG = {
  currency: "INR",
  yearly_months_free: 2,
  plans: [
    {
      id: 1,
      key: "free",
      name: "Free",
      tagline: null,
      price_monthly_paise: 0,
      price_yearly_paise: 0,
      trial_days: 0,
      contact_sales: false,
      featured: false,
      limits: {},
      features: [{ key: "mcp", label: "Connecting AI assistants", included: false }],
    },
    {
      id: 2,
      key: "growth",
      name: "Growth",
      tagline: null,
      price_monthly_paise: 99900,
      price_yearly_paise: 999000,
      trial_days: 0,
      contact_sales: false,
      featured: true,
      limits: {},
      features: [{ key: "mcp", label: "Connecting AI assistants", included: true }],
    },
  ],
};
const ENT_FREE = { plan_key: "free", plan_name: "Free", limits: {}, features: { mcp: false }, usage: {}, enforced: true, configured: true };

type Answer = unknown | (() => unknown);
const state: { apps: Answer; me: Answer; ent: Answer; del: Answer } = { apps: {}, me: ACCESS_OWNER, ent: {}, del: {} };
const calls: Array<{ method: string; path: string }> = [];

async function answer(value: Answer) {
  const v = typeof value === "function" ? await (value as () => unknown)() : value;
  if (v instanceof Error) throw v;
  return v;
}
const refusal = (status: number, error_code: string | null, message = "No.") =>
  toApiError(new Response(JSON.stringify(error_code ? { message, error_code } : { detail: "Not Found" }), { status, headers: { "Content-Type": "application/json" } }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/connected-apps") return answer(state.apps);
        if (path === "/api/v1/clubs/access/me") return answer(state.me);
        if (path === "/api/v1/clubs/entitlements") return answer(state.ent);
        if (path === "/api/v1/plans") return CATALOG;
        if (path === "/api/v1/auth/security/overview") return securityFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return answer(state.del);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ConnectedAppsSection, appHost, connectedByLabel } = await import("./index");
const { SecurityPage } = await import("@/features/security");

beforeEach(() => {
  calls.length = 0;
  Object.assign(state, { apps: { can_manage_all: true, apps: [CLAUDE, CURSOR] }, me: ACCESS_OWNER, ent: {}, del: { disconnected: true, id: CLAUDE.id } });
});

const asked = (path: string) => calls.some((c) => c.path === path);

describe("Connected apps", () => {
  it("lists every app: who connected it, what it may do, when, and what it is waiting on", async () => {
    render(<ConnectedAppsSection />);
    const list = await screen.findByRole("list", { name: "Connected apps" });
    expect(list.children).toHaveLength(2);
    const claude = within(list).getByRole("region", { name: "Claude" });
    expect(claude).toHaveTextContent("claude.ai");
    expect(claude).toHaveTextContent("Connected by Eddie Editor (editor)");
    expect(within(claude).getByRole("list", { name: "What Claude may do" })).toHaveTextContent("Read your eventsDraft eventsDraft announcements");
    expect(claude).toHaveTextContent("1 request waiting");
    expect(claude).toHaveTextContent("Connected 3 h ago · Last used 2 min ago");
    const cursor = within(list).getByRole("region", { name: "Cursor" });
    expect(cursor).toHaveTextContent("Connected by the club account");
    expect(cursor).toHaveTextContent("Last used never");
    expect(cursor).not.toHaveTextContent("waiting");
    expect(screen.getByText(/AI assistants that can read your events and draft for you/)).toBeInTheDocument();
  });

  it("asks before disconnecting, says what it ends, then disconnects", async () => {
    let gone = false;
    state.apps = () => ({ can_manage_all: true, apps: gone ? [CURSOR] : [CLAUDE, CURSOR] });
    state.del = () => {
      gone = true;
      return { disconnected: true, id: CLAUDE.id };
    };
    render(<ConnectedAppsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Claude" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Disconnect Claude?" });
    expect(confirm).toHaveTextContent("Claude loses access to the club at once. Its waiting request is turned down.");
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(within(confirm).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "DELETE")).toEqual([{ method: "DELETE", path: `/api/v1/clubs/connected-apps/${CLAUDE.id}` }]));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Claude" })).not.toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Cursor" })).toBeInTheDocument();
  });

  it("keeps the app when the question is declined", async () => {
    render(<ConnectedAppsSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Cursor" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Disconnect Cursor?" });
    expect(confirm).toHaveTextContent("It has no requests waiting.");
    fireEvent.click(within(confirm).getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("tells a member they see only the apps they connected", async () => {
    state.apps = { can_manage_all: false, apps: [CLAUDE] };
    render(<ConnectedAppsSection />);
    expect(await screen.findByText("The AI assistants you connected. The club's owner and admins see every app.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Claude" })).toBeInTheDocument();
  });

  it("shows how to connect one when there are none", async () => {
    state.apps = { can_manage_all: true, apps: [] };
    render(<ConnectedAppsSection />);
    const empty = await screen.findByRole("region", { name: "No AI apps connected" });
    expect(empty).toHaveTextContent("No AI apps connected");
    expect(within(empty).getByText("https://api.myotherapp.in/mcp")).toBeInTheDocument();
    const claude = within(empty).getByRole("region", { name: "Connect Claude" });
    expect(claude).toHaveTextContent("Settings → Connectors → Add custom connector");
    expect(within(empty).getByRole("region", { name: "Connect ChatGPT" })).toHaveTextContent("Developer mode");
    expect(within(empty).getByRole("region", { name: "Connect Cursor and others" })).toBeInTheDocument();
  });

  it.each([
    ["503 MCP_DISABLED", () => refusal(503, "MCP_DISABLED")],
    ["a 404 with no code", () => refusal(404, null)],
  ])("is not there when connected assistants are off (%s)", async (_name, error) => {
    state.apps = error;
    render(<ConnectedAppsSection />);
    await waitFor(() => expect(asked("/api/v1/clubs/connected-apps")).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Connected apps")).not.toBeInTheDocument();
  });

  it("shows the plan's lock on a plan without it, keeping what is connected readable", async () => {
    state.ent = ENT_FREE;
    render(<ConnectedAppsSection />);
    expect(await screen.findByText(/Connecting AI assistants is part of Growth and up\./)).toBeInTheDocument();
    expect(screen.getByText(/Apps already connected stay listed here/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Claude" })).toBeInTheDocument();
    expect(screen.queryByText("Connect another assistant")).not.toBeInTheDocument();
  });

  it("names hosts and who connected, in plain words", () => {
    expect(appHost("https://www.chatgpt.com/x")).toBe("chatgpt.com");
    expect(appHost("cursor://callback")).toBeNull();
    expect(appHost(null)).toBeNull();
    expect(connectedByLabel({ type: "owner" })).toBe("the club account");
    expect(connectedByLabel({ type: "member", name: null, email: "d@x.in", role: "door" })).toBe("d@x.in (door team)");
  });
});

describe("on the Security page", () => {
  it("sits with the club account's security", async () => {
    render(<SecurityPage />);
    expect(await screen.findByText("Devices signed in right now")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Connected apps" })).toBeInTheDocument();
  });

  it("sits under a team member's own account too", async () => {
    state.me = ACCESS_EDITOR;
    state.apps = { can_manage_all: false, apps: [CLAUDE] };
    render(<SecurityPage />);
    expect(await screen.findByRole("heading", { name: "Your account" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connected apps" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Claude" })).toBeInTheDocument();
  });
});
