import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const summary = { registered: 3, printed: 1, by_role: [{ role: "attendee", registered: 2, printed: 1 }, { role: "speaker", registered: 1, printed: 0 }], design_version: 2, jobs: 1, settings: { reprint_policy: "anyone", auto_print_badges: false, preprinted_carries: [] }, preprinted_layers: [], reprint_policies: [] };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (path.endsWith("/summary")) return summary;
    if (path.endsWith("/settings")) return { ...summary.settings, ...(body as object) };
    if (path.endsWith("/jobs")) return [{ id: "j1", source: "manual", door: "Gate A", cards: 1, guest: "Ananya", design_version: 2, overrode: false, error: null, created_at: "2026-10-11T00:00:00Z" }];
    return {};
  };
  return { ...actual, api: { get: vi.fn((path: string) => record("GET")(path)), put: vi.fn(record("PUT")), patch: vi.fn(record("PATCH")), post: vi.fn(record("POST")), del: vi.fn(record("DELETE")) } };
});

const api = await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("the ID card endpoints", () => {
  it("reads the summary and jobs and saves the rules", async () => {
    const s = await api.fetchCardSummary(42);
    await api.updateCardSettings(42, { reprint_policy: "never" });
    const jobs = await api.fetchPrintJobs(42);
    expect(s.by_role).toHaveLength(2);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /api/v1/events/42/idcards/summary", "PATCH /api/v1/events/42/idcards/settings", "GET /api/v1/events/42/idcards/jobs"]);
    expect(jobs[0]?.guest).toBe("Ananya");
  });

  it("builds the card and batch links the browser opens, with the gate key when there is one", () => {
    expect(api.cardPdfUrl(42, "r1", { source: "checkin", record: true, door: "Gate A", key: "abc" })).toBe("/api/gateway/api/v1/events/42/idcards/r1.pdf?source=checkin&record=true&door=Gate+A&key=abc");
    expect(api.cardPdfUrl(42, "r1", { source: "manual", record: false })).toBe("/api/gateway/api/v1/events/42/idcards/r1.pdf?source=manual&record=false");
    expect(api.batchPdfUrl(42, { scope: "not_printed", record: true })).toBe("/api/gateway/api/v1/events/42/idcards/batch.pdf?scope=not_printed&record=true");
    expect(api.batchPdfUrl(42, { scope: "all", role: "speaker" })).toBe("/api/gateway/api/v1/events/42/idcards/batch.pdf?scope=all&role=speaker");
  });
});
