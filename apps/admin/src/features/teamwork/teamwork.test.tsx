import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/**
 * Team work's shared parts: who may do what (the team on top of the admin
 * role), the side menu's group that waits for the API to have it, its
 * counts, the owner's controls in Settings → Teams, and My day asking for a
 * lead's next step once its last follow-up is done.
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));
const me = vi.hoisted(() => ({ id: 1 }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: me.id, username: "a", email: "a@x.in", full_name: "Asha", user_type: "admin", admin_role: state.role } }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf, routeMissing, refusal } = await import("@/test/fake-api");
const { SidebarNav } = await import("@/components/sidebar-nav");
const { visibleNavItems } = await import("@/components/nav-items");
const { teamRights, TeamworkGate, TeamworkSettingsPage, MyDayPage } = await import("./index");

const TEAMS = [
  { key: "support", members: [{ user_id: 2, name: "Sam", email: "sam@x.in", admin_role: "support", away: false, away_until: null }] },
  { key: "sales", members: [{ user_id: 3, name: "Lata", email: "lata@x.in", admin_role: "viewer", away: true, away_until: "2026-11-20T00:00:00Z" }] },
];

beforeEach(() => {
  freshState(state);
  me.id = 1;
  state.handlers["GET /api/v1/admin/reports"] = () => ({ items: [], total: 0 });
  state.handlers["GET /api/v1/admin/teamwork/badge"] = () => ({ due: 2, overdue: 1, cases: 4 });
  state.handlers["GET /api/v1/admin/teams"] = () => TEAMS;
});

describe("who may do what", () => {
  const teams = TEAMS as Parameters<typeof teamRights>[0]["teams"];

  it("gives an admin owner everything", () => {
    const r = teamRights({ meId: 1, role: "owner", teams });
    expect(r).toMatchObject({ readBodies: true, takeCases: true, assignCases: true, createLeads: true, reassignLeads: true, manageDesk: true });
    expect(r.workCase(99)).toBe(true);
    expect(r.workLead(99)).toBe(true);
  });

  it("lets a Support member read, take, log and answer only the cases assigned to them", () => {
    const r = teamRights({ meId: 2, role: "support", teams });
    expect(r).toMatchObject({ support: true, sales: false, readBodies: true, takeCases: true, logCases: true, caseToLead: true, assignCases: false, createLeads: false, manageDesk: false });
    expect(r.workCase(2)).toBe(true);
    expect(r.workCase(5)).toBe(false);
    expect(r.workLead(2)).toBe(false);
  });

  it("lets a Sales member read cases' words and work only their own leads", () => {
    const r = teamRights({ meId: 3, role: "viewer", teams });
    expect(r).toMatchObject({ sales: true, readBodies: true, takeCases: false, createLeads: true, reassignLeads: false });
    expect(r.workCase(3)).toBe(false);
    expect(r.workLead(3)).toBe(true);
    expect(r.workLead(9)).toBe(false);
  });

  it("gives an admin in neither team the lists and counts, without message bodies", () => {
    const r = teamRights({ meId: 7, role: "support", teams });
    expect(r).toMatchObject({ readBodies: false, takeCases: false, logCases: false, createLeads: false, caseToLead: false });
  });
});

describe("Team work in the side menu", () => {
  it("stays out on an API without it (GET /teamwork/badge is a bare 404)", async () => {
    state.handlers["GET /api/v1/admin/teamwork/badge"] = () => {
      throw routeMissing();
    };
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Users" })).toBeInTheDocument();
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/teamwork/badge")).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("link", { name: /^Support/ })).toBeNull();
    expect(screen.queryByText("Team work")).toBeNull();
  });

  it("stays out on an API that answers the probe 405", async () => {
    state.handlers["GET /api/v1/admin/teamwork/badge"] = () => {
      throw refusal(405, "Method Not Allowed");
    };
    render(<SidebarNav />);
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/teamwork/badge")).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("link", { name: /^Leads/ })).toBeNull();
  });

  it("shows the group with its counts: cases on Support, due and overdue together on My day", async () => {
    render(<SidebarNav />);
    const support = await screen.findByRole("link", { name: "Support, 4 waiting" });
    expect(support).toHaveAttribute("href", "/teamwork/support");
    expect(screen.getByRole("link", { name: "My day, 3 due" })).toHaveAttribute("href", "/teamwork/my-day");
    for (const name of ["Leads", "Team reports", "Team settings"]) expect(screen.getByRole("link", { name })).toBeInTheDocument();
    expect(screen.getByText("Team work")).toBeInTheDocument();
  });

  it("keeps a group's heading when the item that carried it is hidden", () => {
    const items = visibleNavItems([], { teamwork: false });
    expect(items.some((i) => i.href.startsWith("/teamwork"))).toBe(false);
    expect(items.find((i) => i.href === "/trash")?.group).toBe("System");
  });

  it("puts a quiet note on a Team work page opened against an older API", async () => {
    state.handlers["GET /api/v1/admin/teamwork/badge"] = () => {
      throw routeMissing();
    };
    render(
      <TeamworkGate>
        <p>the desk</p>
      </TeamworkGate>
    );
    expect(await screen.findByText("Not available on this server yet")).toBeInTheDocument();
    expect(screen.queryByText("the desk")).toBeNull();
  });
});

describe("Settings → Teams", () => {
  beforeEach(() => {
    state.handlers["GET /api/v1/admin/teams/eligible"] = () => [
      { user_id: 2, name: "Sam", email: "sam@x.in", admin_role: "support" },
      { user_id: 4, name: "Ravi", email: "ravi@x.in", admin_role: "viewer" },
    ];
    state.handlers["PUT /api/v1/admin/teams/support/members"] = () => ({ added: [4], removed: [] });
    state.handlers["GET /api/v1/admin/support/topics"] = () => [{ key: "payments", label: "Payments and refunds", assign: "round_robin", default_priority: "high" }];
  });

  it("lets an owner change who is in a team", async () => {
    render(<TeamworkSettingsPage />);
    const support = await screen.findByRole("heading", { name: /Support · 1/ });
    fireEvent.click(within(support.closest("section")!).getByRole("button", { name: "Edit members" }));
    fireEvent.click(await screen.findByLabelText(/Ravi/));
    fireEvent.click(screen.getByRole("button", { name: "Save team" }));
    await waitFor(() => expect(callsOf(state, "PUT", "/api/v1/admin/teams/support/members")[0]?.body).toEqual({ user_ids: [2, 4] }));
    expect(screen.getByText("Away until 20 Nov 2026")).toBeInTheDocument();
  });

  it("offers no owner controls to anyone else, and says who changes them", async () => {
    state.role = "support";
    me.id = 2;
    render(<TeamworkSettingsPage />);
    expect(await screen.findByRole("heading", { name: /Support · 1/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit members" })).toBeNull();
    expect(screen.getByText(/Only an admin owner changes these/)).toBeInTheDocument();
    // A team member may still mark themselves away.
    expect(screen.getByLabelText("I'm away")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Topics and rules" }));
    expect(await screen.findByText("Payments and refunds")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add topic/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit Payments/ })).toBeNull();
  });
});

describe("My day", () => {
  beforeEach(() => {
    state.handlers["GET /api/v1/admin/teamwork/my-day"] = () => ({
      follow_ups_due: [{ id: 11, kind: "call", title: "Call about the venue", due_at: "2026-11-11T10:00:00Z", lead_id: 5, case_id: null, lead_name: "TinkerHub", case_number: null, case_subject: null, owner_id: 1 }],
      follow_ups_overdue: [{ id: 12, kind: "email", title: "Send the deck", due_at: "2026-11-09T10:00:00Z", lead_id: null, case_id: 8, lead_name: null, case_number: 1042, case_subject: "Refund", owner_id: 1 }],
      cases_mine_open: [{ id: 8, number: 1042, subject: "Refund", status: "open", priority: "high", overdue: true }],
      counts: { due: 1, overdue: 1, cases: 1 },
    });
    state.handlers["PATCH /api/v1/admin/follow-ups/11"] = () => ({ id: 11, kind: "call", title: "Call about the venue", due_at: null, done: true, needs_next: true });
    state.handlers["POST /api/v1/admin/follow-ups"] = ({ body }) => ({ id: 13, ...(body as object) });
  });

  it("lists what is overdue, what is due today and my cases, each linked", async () => {
    render(<MyDayPage />);
    expect(await screen.findByRole("link", { name: "TinkerHub" })).toHaveAttribute("href", "/teamwork/leads/5");
    expect(screen.getByRole("link", { name: "#1042 · Refund" })).toHaveAttribute("href", "/teamwork/support/8");
    expect(screen.getByText(/Overdue · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Due today · 1/)).toBeInTheDocument();
  });

  it("asks for the lead's next step when its last open follow-up is done", async () => {
    render(<MyDayPage />);
    fireEvent.click(await screen.findByRole("button", { name: 'Mark "Call about the venue" done' }));
    expect(await screen.findByText("What's the next step?")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Next step"), { target: { value: "Send the proposal" } });
    fireEvent.click(screen.getByRole("button", { name: "Set follow-up" }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/follow-ups")[0]?.body).toMatchObject({ lead_id: 5, kind: "call", title: "Send the proposal" }));
  });
});
