import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; options?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const get = vi.fn(async (path: string, options?: unknown) => {
    calls.push({ method: "GET", path, options });
    return { items: [{ id: "c1", name: "Ananya Iyer", email: "a@example.com", phone: null, role: "attendee", attended: true, event_id: 42, event_name: "Build Day", event_ended_at: null, archived_at: "2026-11-23T00:00:00Z" }], total: 1, page: 1, page_size: 50, groups: [{ event_id: 42, event_name: "Build Day", event_ended_at: null, archived_at: "2026-11-23T00:00:00Z", contacts: 1 }] };
  });
  return { ...actual, api: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() } };
});

const api = await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("the contact book", () => {
  it("reads the club's archive with its filters and builds the export link", async () => {
    const p = await api.fetchContacts({ q: "ananya", eventId: 42, attended: true, page: 2, pageSize: 25 });
    expect(calls[0]).toEqual({ method: "GET", path: "/api/v1/clubs/contacts", options: { query: { q: "ananya", event_id: 42, attended: true, page: 2, page_size: 25 } } });
    expect(p.items[0]?.name).toBe("Ananya Iyer");
    expect(api.contactsCsvUrl({ attended: false, eventId: 42 })).toBe("/api/gateway/api/v1/clubs/contacts/export.csv?event_id=42&attended=false");
    expect(api.contactsCsvUrl({})).toBe("/api/gateway/api/v1/clubs/contacts/export.csv");
  });
});
