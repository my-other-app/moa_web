import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The poster calls carry their variant and format on every request (posters
 * contract §10.3). Dropping either still succeeds, and silently reads or
 * writes another design: the speakers' story saved over everyone's square.
 * These assert the wiring, because nothing in the answer would show it.
 */
const calls: Array<{ method: string; path: string; body?: unknown; options?: { query?: Record<string, unknown> } }> = [];

const LAYOUT = {
  version: 2,
  page: { widthMm: 285.75, heightMm: 508 },
  canvas: { width: 1080, height: 1920, background: null },
  vars: { accent: null },
  layers: [],
};
const DTO = { variant: "role:speaker", format: "story", layout: LAYOUT, from: "saved", revision: 5, starters: [], fonts: [], tokens: [], images: null, values: {}, context: null };
const VARIANTS = { variants: [], options: [{ variant: "default", label: "Everyone" }] };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown, options?: { query?: Record<string, unknown> }) => {
    calls.push({ method, path, body, options });
    if (path.endsWith("/variants") || path.endsWith("/apply") || (method === "DELETE" && !options?.query?.format)) return VARIANTS;
    if (path.includes("/starters/")) return { id: "poster/01-bold-frame", name: "Bold frame", layout: LAYOUT, formats: { story: LAYOUT } };
    if (path.includes("/designs/ticket")) return { eventId: 42, kind: "ticket", audience: "speaker", v2: { layout: LAYOUT, from: "saved", revision: 1 } };
    return DTO;
  };
  return {
    ...actual,
    api: {
      get: vi.fn((path: string, options?: { query?: Record<string, unknown> }) => record("GET")(path, undefined, options)),
      put: vi.fn(record("PUT")),
      post: vi.fn(record("POST")),
      del: vi.fn(record("DELETE")),
    },
  };
});

const { applyPosterStarter, deletePosterVariant, fetchBoard, fetchPosterStarterFormats, fetchPosterVariants, fetchStarterLayout, previewBoard, resetDesign, saveBoard } = await import("./api");
const EVENT = { kind: "event", eventId: 42 } as const;
const SLOT = { variant: "role:speaker", format: "story", label: "Speakers" } as const;
const BASE = "/api/v1/events/42/designs/poster";

beforeEach(() => {
  calls.length = 0;
});

describe("a poster layout on the board", () => {
  it("is read for its variant and format, and the flat answer read as the board's", async () => {
    const d = await fetchBoard(EVENT, "poster", "event_default", SLOT);
    expect(calls).toEqual([{ method: "GET", path: `${BASE}/layout`, body: undefined, options: { query: { variant: "role:speaker", format: "story" } } }]);
    expect(d).toMatchObject({ kind: "poster", audience: "role:speaker", version: 5, isOwn: true, fromStarter: false, posterFrom: "saved" });
    expect(d.layout).toEqual(LAYOUT);
  });

  it("is saved for its variant and format", async () => {
    await saveBoard(EVENT, "poster", "event_default", LAYOUT as never, SLOT);
    expect(calls[0]).toMatchObject({ method: "PUT", path: `${BASE}/layout`, body: LAYOUT, options: { query: { variant: "role:speaker", format: "story" } } });
  });

  it("is dropped for its variant and format alone", async () => {
    await resetDesign(EVENT, "poster", "event_default", SLOT);
    expect(calls[0]).toMatchObject({ method: "DELETE", path: `${BASE}/layout`, options: { query: { variant: "role:speaker", format: "story" } } });
  });

  it("starts from a starter's layout for the format (copy-on-use)", async () => {
    expect(await fetchStarterLayout(EVENT, "poster", "poster/01-bold-frame", "story")).toEqual(LAYOUT);
    expect(calls[0]).toMatchObject({ method: "POST", path: `${BASE}/layout/starters/poster/01-bold-frame`, options: { query: { format: "story" } } });
  });

  it("reads a starter's every format for its picture", async () => {
    expect(await fetchPosterStarterFormats(42, "poster/01-bold-frame")).toEqual({ story: LAYOUT });
  });

  it("is previewed exactly, for its variant and format, through the gateway", async () => {
    const fetch = vi.fn(async () => new Response(new Blob(["png"]), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await previewBoard(EVENT, "poster", "event_default", LAYOUT as never, "MOA-7K3QF-X9PLM", SLOT);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(new RegExp(`${BASE}/layout/preview\\?variant=role%3Aspeaker&format=story&as=png$`));
    expect(JSON.parse(init.body as string)).toEqual({ layout: LAYOUT, ticket_id: "MOA-7K3QF-X9PLM" });
    vi.unstubAllGlobals();
  });
});

describe("the variants", () => {
  it("are listed, a whole variant dropped, and a starter applied to one", async () => {
    await fetchPosterVariants(42);
    await deletePosterVariant(42, "type:12");
    await applyPosterStarter(42, "role:speaker", "poster/02-split");
    expect(calls.map((c) => [c.method, c.path, c.body ?? null, c.options?.query ?? null])).toEqual([
      ["GET", `${BASE}/variants`, null, null],
      ["DELETE", `${BASE}/layout`, null, { variant: "type:12" }],
      ["POST", `${BASE}/apply`, { starter_id: "poster/02-split", variant: "role:speaker" }, null],
    ]);
  });
});

describe("the other kinds", () => {
  it("still go by audience, untouched by posters", async () => {
    await saveBoard(EVENT, "ticket", "speaker", LAYOUT as never);
    await resetDesign(EVENT, "ticket", "speaker");
    expect(calls.map((c) => [c.method, c.path, c.options?.query])).toEqual([
      ["PUT", "/api/v1/events/42/designs/ticket/layout", { audience: "speaker" }],
      ["DELETE", "/api/v1/events/42/designs/ticket", { audience: "speaker" }],
    ]);
  });
});
