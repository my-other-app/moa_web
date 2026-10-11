import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const settings = { status: "published", status_clock: true, retention_mode: "keep", retention_hours: 72, report_recipients: [], keep_contacts: true, starts_at: "2026-11-20T03:30:00Z", ends_at: "2026-11-20T05:30:00Z", statuses: [{ key: "draft", label: "Draft", note: "Refuses check-ins" }] };
const retention = { event_id: 42, mode: "keep", state: "pending", run_at: "2026-11-23T05:30:00Z", attempts: 0, last_error: null, refusal: null, refused_at: null, completed_at: null, deleted: null, recipients: [], preview: { registrations: 3, phones: 1 }, keeps_contacts: true, contacts_kept: 0, ended: true, ends_at: "2026-11-20T05:30:00Z" };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (path.endsWith("/settings")) return { ...settings, ...((body as object) ?? {}) };
    if (path.endsWith("/retention")) return retention;
    if (path.endsWith("/retention/run")) return { state: "deleted", refusal: null, error: null, deleted: { phones: 1 } };
    if (path.endsWith("/reports") && method === "POST") return { id: "r1", filename: "build-day-closeout-202611200600.pdf", figures: { registered: 3 }, generated_at: "2026-11-20T06:00:00Z", generated_by_name: "Yukthi", delivered_to: [] };
    if (path.endsWith("/reports")) return [];
    return { event_name: "Build Day", org_name: "Yukthi", venue: null, starts_at: "2026-11-20T03:30:00Z", ends_at: "2026-11-20T05:30:00Z", registered: 3, checked_in: 2, turnout_pct: 67, no_shows: 1, by_role: [], by_via: [], walk_ins: 1, with_phone: 1, merch: [], messages: [], certificates_issued: 0, cards_printed: 0, rating_avg: 0, rating_count: 0 };
  };
  return { ...actual, api: { get: vi.fn((path: string) => record("GET")(path)), post: vi.fn(record("POST")), patch: vi.fn(record("PATCH")), put: vi.fn(record("PUT")), del: vi.fn(record("DELETE")) } };
});

const api = await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("the closeout endpoints", () => {
  it("read the figures, keep reports, and move the clock and retention under the event", async () => {
    await api.fetchFigures(42);
    await api.fetchReports(42);
    await api.generateReport(42);
    const s = await api.updateCloseoutSettings(42, { status: "live", retention_mode: "delete", report_recipients: ["ops@example.com"] });
    await api.fetchRetention(42);
    const r = await api.runRetention(42, "build-day");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/v1/events/42/closeout/figures",
      "GET /api/v1/events/42/closeout/reports",
      "POST /api/v1/events/42/closeout/reports",
      "PATCH /api/v1/events/42/closeout/settings",
      "GET /api/v1/events/42/closeout/retention",
      "POST /api/v1/events/42/closeout/retention/run",
    ]);
    expect(s.status).toBe("live");
    expect(calls[5]?.body).toEqual({ confirm_slug: "build-day" });
    expect(r.state).toBe("deleted");
    expect(api.reportPdfUrl(42, "r1")).toBe("/api/gateway/api/v1/events/42/closeout/reports/r1.pdf");
  });
});
