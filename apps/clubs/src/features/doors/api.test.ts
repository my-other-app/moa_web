import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; body?: unknown; options?: unknown }> = [];
const door = { id: "d1", event_id: 42, name: "Gate A", kind: "door", sort_order: 0, active: true, volunteers: [], check_ins: 3, link: null, created_at: "2026-10-11T00:00:00Z" };
const team = { owner: { name: "Yukthi", email: null }, volunteers: [{ id: 7, email: "v@example.com", name: "Vani", user_id: 9, is_approved: true, scope: "event", can_check_in: true, can_walkup: false, can_merch: false, door_id: null, check_ins: 1 }], doors: [door], settings: { door_mode: "open", close_after_minutes: 240, spot_registration_checks_in: true, capture_contact_at_gate: false, require_contact_at_gate: false } };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown, options?: unknown) => {
    calls.push({ method, path, body, options });
    if (path.endsWith("/team") || path.includes("/team/")) return team;
    if (path.endsWith("/link")) return { url: "https://club-dashboard.myotherapp.in/gate/42?key=abc", key: "abc", door_id: "d1", expires_at: null, can_walkup: true };
    if (path.endsWith("/gate-settings")) return team.settings;
    if (path.endsWith("/check-ins")) return { items: [], total: 0, page: 1, page_size: 50, facets: { total: 0, doors: [], methods: [], staff: [], first_at: null, last_at: null } };
    if (method === "DELETE") return {};
    if (path.endsWith("/doors") && method === "GET") return [door];
    return door;
  };
  return { ...actual, api: { get: vi.fn((path: string, options?: unknown) => record("GET")(path, undefined, options)), put: vi.fn(record("PUT")), patch: vi.fn(record("PATCH")), post: vi.fn(record("POST")), del: vi.fn(record("DELETE")) } };
});

const api = await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("the doors and team endpoints", () => {
  it("manages doors and their gate links under the event", async () => {
    await api.createDoor(42, { name: "Gate A", kind: "door" });
    await api.updateDoor(42, "d1", { active: false });
    const link = await api.issueGateLink(42, "d1", { can_walkup: true });
    await api.revokeGateLink(42, "d1");
    await api.deleteDoor(42, "d1");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /api/v1/events/42/doors", "PATCH /api/v1/events/42/doors/d1", "POST /api/v1/events/42/doors/d1/link", "DELETE /api/v1/events/42/doors/d1/link", "DELETE /api/v1/events/42/doors/d1"]);
    expect(link.url).toContain("/gate/42?key=");
  });

  it("reads the team with its settings and flips a volunteer's switches", async () => {
    const t = await api.fetchTeam(42);
    await api.updateTeamVolunteer(42, 7, { can_walkup: true, door_id: "d1" });
    await api.updateGateSettings(42, { door_mode: "closed" });
    expect(t.volunteers[0]?.can_check_in).toBe(true);
    expect(calls[1]).toMatchObject({ method: "PATCH", path: "/api/v1/events/42/team/7", body: { can_walkup: true, door_id: "d1" } });
    expect(calls[2]).toMatchObject({ method: "PATCH", path: "/api/v1/events/42/gate-settings", body: { door_mode: "closed" } });
  });

  it("filters the log with snake_case query keys and undoes through the gate", async () => {
    await api.fetchCheckInLog({ eventId: 42, q: "ana", doorId: "d1", via: "gate", by: 9, order: "oldest", page: 2, pageSize: 50 });
    await api.undoCheckIn(42, "r1");
    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/v1/events/42/check-ins", options: { query: { q: "ana", door_id: "d1", via: "gate", by: 9, order: "oldest", page: 2, page_size: 50 } } });
    expect(calls[1]).toMatchObject({ method: "DELETE", path: "/api/v1/events/42/gate/check-in/r1" });
  });
});
