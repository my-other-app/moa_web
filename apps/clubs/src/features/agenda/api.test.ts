import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const item = { id: "a1", event_id: 42, starts_at: "2026-11-20T03:30:00Z", ends_at: "2026-11-20T04:00:00Z", title: "Registration", description: null, speaker: null, speaker_photo_key: null, speaker_photo_url: null, location: "Foyer", sort_order: 0, parallel: false };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (method === "GET") return { items: [item], timezone: "Asia/Kolkata", has_programme: false };
    if (method === "DELETE") return { ok: true };
    return { ...item, ...(body as object) };
  };
  return { ...actual, api: { get: vi.fn((path: string) => record("GET")(path)), post: vi.fn(record("POST")), patch: vi.fn(record("PATCH")), put: vi.fn(record("PUT")), del: vi.fn(record("DELETE")) } };
});

const api = await import("./api");
const { agendaTime, agendaDay, dayOf } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
});

describe("the agenda endpoints", () => {
  it("keep the run of show under the event", async () => {
    const a = await api.fetchAgenda(42);
    await api.createAgendaItem(42, { starts_at: "2026-11-20T04:00:00Z", ends_at: null, title: "Keynote", description: null, speaker: "Ananya Iyer", location: null });
    await api.updateAgendaItem(42, "a1", { title: "Doors" });
    await api.deleteAgendaItem(42, "a1");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /api/v1/events/42/agenda", "POST /api/v1/events/42/agenda", "PATCH /api/v1/events/42/agenda/a1", "DELETE /api/v1/events/42/agenda/a1"]);
    expect(a.items[0]?.title).toBe("Registration");
    expect(api.programmePdfUrl(42)).toBe("/api/gateway/api/v1/events/42/agenda/programme.pdf");
    expect(api.programmePdfUrl(42, "a4_portrait")).toBe("/api/gateway/api/v1/events/42/agenda/programme.pdf?page=a4_portrait");
  });
  it("prints times in the event's zone, as the programme does", () => {
    expect(agendaTime("2026-11-20T03:30:00Z", "Asia/Kolkata")).toBe("09:00");
    expect(agendaDay("2026-11-20T03:30:00Z", "Asia/Kolkata")).toBe("Fri 20 Nov");
    expect(dayOf("2026-11-20T19:30:00Z", "Asia/Kolkata")).toBe("2026-11-21");
  });
});
