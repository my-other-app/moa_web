import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; body?: unknown; options?: unknown }> = [];
const item = { id: "m1", event_id: 42, name: "Summit tote", photo_key: null, photo_url: null, stock: 10, collected: 2, total: 10, eligibility_field: null, eligibility_value: null, variant_field: null, variants: [], created_at: "2026-10-11T00:00:00Z" };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown, options?: unknown) => {
    calls.push({ method, path, body, options });
    if (path.endsWith("/fields")) return [{ name: "Role", key: "role", kind: "role", values: ["Attendee", "Speaker", "Staff"] }];
    if (path.endsWith("/collections")) return { items: [], total: 0, page: 1, page_size: 50, facets: { total: 0, items: [], variants: [], doors: [], staff: [], without_door: 0, first_at: null, last_at: null } };
    if (path.endsWith("/analytics")) return { collectors: 0, handovers: 0, by_item: [], by_door: [], by_hour: [] };
    if (method === "DELETE" && !path.includes("/variants/")) return { ok: true };
    if (method === "GET") return [item];
    return item;
  };
  return { ...actual, api: { get: vi.fn((path: string, options?: unknown) => record("GET")(path, undefined, options)), post: vi.fn(record("POST")), patch: vi.fn(record("PATCH")), put: vi.fn(record("PUT")), // The client's real signature: del(path, body, options).
    del: vi.fn(record("DELETE")) } };
});

const api = await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("the merchandise endpoints", () => {
  it("manage items, variants and the log under the event", async () => {
    await api.fetchMerchItems(42);
    await api.fetchMerchFields(42);
    await api.createMerchItem(42, { name: "Tee", variant_field: "T-shirt size", variants: [{ label: "L", stock: 5 }] });
    await api.updateMerchItem(42, "m1", { stock: 12 });
    await api.addMerchVariant(42, "m1", { label: "XL", stock: 2 });
    await api.updateMerchVariant(42, "m1", "v1", { stock: 3 });
    await api.deleteMerchVariant(42, "m1", "v1");
    await api.deleteMerchItem(42, "m1", true);
    await api.fetchMerchLog({ eventId: 42, itemId: "m1", order: "oldest", page: 2, pageSize: 25 });
    await api.fetchMerchAnalytics(42);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/v1/events/42/merch",
      "GET /api/v1/events/42/merch/fields",
      "POST /api/v1/events/42/merch",
      "PATCH /api/v1/events/42/merch/m1",
      "POST /api/v1/events/42/merch/m1/variants",
      "PATCH /api/v1/events/42/merch/m1/variants/v1",
      "DELETE /api/v1/events/42/merch/m1/variants/v1",
      "DELETE /api/v1/events/42/merch/m1",
      "GET /api/v1/events/42/merch/collections",
      "GET /api/v1/events/42/merch/analytics",
    ]);
    // A query parameter, never the body: the server reads with_collections=Query.
    expect(calls[7]?.body).toBeUndefined();
    expect(calls[7]?.options).toEqual({ query: { with_collections: true } });
    expect(calls[8]?.options).toEqual({ query: { q: undefined, item_id: "m1", variant_id: undefined, door_id: undefined, by: undefined, order: "oldest", page: 2, page_size: 25 } });
  });
});
