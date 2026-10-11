import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; body?: unknown; options?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown, options?: unknown) => {
    calls.push({ method, path, body, options });
    if (path.endsWith("/start")) return { session: "s".repeat(32), expires_at: "2026-10-11T10:10:00Z", event: { name: "Annual day", kiosk: { name: "Lobby tablet", door: "Lobby kiosk" } }, verify: "email", print: true, door_open: true };
    if (path.endsWith("/lookup") || path.endsWith("/resend")) return { outcome: "CODE_SENT", channel: "email", masked: "a•••@example.com", checked_in_at: null, door: null };
    if (path.endsWith("/verify")) return { outcome: "WRONG_CODE", attempts_left: 2 };
    if (path.endsWith("/check-in")) return { outcome: "CHECKED_IN", guest: { first_name: "Ananya", display_name: "Ananya Iyer", role_label: "Attendee", ticket_id: "AB12CD" }, can_print: true };
    if (path.endsWith("/print")) return { outcome: "QUEUED" };
    return { checked_in: true, print: { status: "DONE" } };
  };
  return { ...actual, api: { get: vi.fn((path: string, options?: unknown) => record("GET")(path, undefined, options)), post: vi.fn(record("POST")), put: vi.fn(record("PUT")), patch: vi.fn(record("PATCH")), del: vi.fn(record("DELETE")) } };
});

const api = await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("the phone's check-in calls", () => {
  it("walk the public /self endpoints with the session as the only credential", async () => {
    const s = await api.startSelf("qr.token");
    await api.lookupSelf(s.session, "Ananya Iyer");
    await api.lookupSelf(s.session, "Ananya Iyer", "a@example.com");
    const v = await api.verifySelf(s.session, "123456");
    await api.resendSelf(s.session);
    const c = await api.checkInSelf(s.session);
    await api.printSelf(s.session);
    const st = await api.statusSelf(s.session);
    expect(calls.map((x) => `${x.method} ${x.path}`)).toEqual(["POST /api/v1/self/start", "POST /api/v1/self/lookup", "POST /api/v1/self/lookup", "POST /api/v1/self/verify", "POST /api/v1/self/resend", "POST /api/v1/self/check-in", "POST /api/v1/self/print", "GET /api/v1/self/status"]);
    expect(calls[1]?.body).toEqual({ session: s.session, name: "Ananya Iyer" });
    expect(calls[2]?.body).toEqual({ session: s.session, name: "Ananya Iyer", contact: "a@example.com" });
    expect(calls[7]?.options).toEqual({ query: { session: s.session } });
    expect(s.event.brand_primary).toBe("#1db9a0");
    expect(v).toEqual({ outcome: "WRONG_CODE", attempts_left: 2 });
    expect(c.guest?.first_name).toBe("Ananya");
    expect(st.print?.status).toBe("DONE");
  });
});
