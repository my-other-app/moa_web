import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; body?: unknown; options?: unknown }> = [];

/**
 * The audience is carried as a query parameter on every one of these calls.
 *
 * Dropping it is the dangerous kind of bug: the request still succeeds, and
 * it silently reads or writes the event's default design instead of the
 * variant the organiser has open. These assert the wiring, because nothing
 * in the response would reveal it.
 */
vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown, options?: unknown) => {
    calls.push({ method, path, body, options });
    if (path.endsWith("/layout/images")) return { key: "base/events/42/layout/template-abc.png", url: "https://bucket/t.png?signed", width: 1560, height: 690 };
    if (path.includes("/starters/")) return { canvas: CANVAS, layers: LAYERS, page: PAGE };
    if (path.endsWith("/preset/preview")) return { html: "<!doctype html><p>filled</p>" };
    return DESIGN;
  };
  return {
    ...actual,
    api: {
      get: vi.fn((path: string, options?: unknown) => record("GET")(path, undefined, options)),
      put: vi.fn(record("PUT")),
      post: vi.fn(record("POST")),
      del: vi.fn(record("DELETE")),
    },
  };
});

const CANVAS = { width: 1560, height: 690, background: "#FFFFFF", templateKey: null, templatePreprinted: false, area: null };
const LAYERS = [{ kind: "qr", id: "qr", name: "QR code", x: 1164, y: 168, size: 324, quietZone: 2, dark: "#000000", light: "#FFFFFF" }];
const PAGE = { widthMm: 203.2, heightMm: null };
const DESIGN = {
  eventId: 42,
  kind: "ticket",
  audience: "speaker",
  canvas: CANVAS,
  layers: LAYERS,
  page: PAGE,
  version: 3,
  isOwn: true,
  fromStarter: false,
  templateUrl: null,
  imageUrls: {},
  brand: { orgName: "Yukthi", primary: "#1db9a0", secondary: "#aaaaaa", logoUrl: null },
  eventIconUrl: null,
  starters: { classic: { label: "Classic", note: "Brand stripe" } },
  tokens: [{ key: "attendee_name", group: "Guest", label: "Guest name", sample: "Ananya Iyer" }],
  qrRequired: true,
  sampleValues: { attendee_name: "Ananya Iyer" },
};

const { fetchLayout, fetchStarter, previewPresetHtml, previewPresetPng, resetDesign, resetPreset, saveLayout, savePreset, uploadLayoutImage } = await import("./api");
const EVENT = { kind: "event", eventId: 42 } as const;
const CLUB = { kind: "club" } as const;

beforeEach(() => {
  calls.length = 0;
});

describe("the layout endpoints", () => {
  it("reads the layout for the audience on screen, with every default the schema fills", async () => {
    const d = await fetchLayout(EVENT, "ticket", "speaker");

    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/v1/events/42/designs/ticket/layout", options: { query: { audience: "speaker" } } });
    expect(d.layers[0]).toMatchObject({ kind: "qr", hidden: false, locked: false, preprinted: false });
    expect(d.version).toBe(3);
  });

  it("saves to the same audience it read from, sending only the layout", async () => {
    await saveLayout(EVENT, "certificate", "staff", { canvas: CANVAS, layers: LAYERS as never, page: PAGE });

    expect(calls[0]).toMatchObject({
      method: "PUT",
      path: "/api/v1/events/42/designs/certificate/layout",
      body: { canvas: CANVAS, layers: LAYERS, page: PAGE },
      options: { query: { audience: "staff" } },
    });
  });

  it("resets the audience's own copy, not the event default", async () => {
    await resetDesign(EVENT, "ticket", "attendee");

    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/api/v1/events/42/designs/ticket", options: { query: { audience: "attendee" } } });
  });

  it("fetches a starter by name", async () => {
    const s = await fetchStarter(EVENT, "ticket", "classic");

    expect(calls[0]?.path).toBe("/api/v1/events/42/designs/ticket/layout/starters/classic");
    expect(s.layers).toHaveLength(1);
  });

  it("uploads a template as multipart under the event, saying what it is for", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "art.png", { type: "image/png" });

    const res = await uploadLayoutImage(EVENT, "ticket", file, "template");

    expect(calls[0]).toMatchObject({ method: "POST", path: "/api/v1/events/42/designs/ticket/layout/images", options: { query: { purpose: "template" } } });
    expect(calls[0]?.body).toBeInstanceOf(FormData);
    expect((calls[0]?.body as FormData).get("file")).toBe(file);
    expect(res).toMatchObject({ key: "base/events/42/layout/template-abc.png", width: 1560, height: 690 });
  });
});

describe("the club's own designs", () => {
  it("reads, saves and resets the club default under /clubs/designs", async () => {
    await fetchLayout(CLUB, "badge", "event_default");
    expect(calls[0]?.path).toBe("/api/v1/clubs/designs/badge/layout");
    await saveLayout(CLUB, "badge", "event_default", { canvas: CANVAS, layers: LAYERS as never, page: PAGE });
    expect(calls[1]).toMatchObject({ method: "PUT", path: "/api/v1/clubs/designs/badge/layout" });
    await resetDesign(CLUB, "badge", "event_default");
    expect(calls[2]).toMatchObject({ method: "DELETE", path: "/api/v1/clubs/designs/badge/layout" });
    await uploadLayoutImage(CLUB, "badge", new File([new Uint8Array([137, 80, 78, 71])], "art.png", { type: "image/png" }), "image");
    expect(calls[3]?.path).toBe("/api/v1/clubs/designs/badge/layout/images");
  });
});

describe("the ready designs", () => {
  const CHOICE = { id: "badge/04-big-name", options: { lanyard: false }, bindings: { zone: { source: "text" as const, value: "B2" } }, accent: "#ffd83a" };

  it("saves a design for the audience on screen, sending only the choice", async () => {
    const d = await savePreset(EVENT, "badge", "speaker", { ...CHOICE, extra: "dropped" } as never);
    expect(calls[0]).toMatchObject({
      method: "PUT",
      path: "/api/v1/events/42/designs/badge/preset",
      body: CHOICE,
      options: { query: { audience: "speaker" } },
    });
    expect(Object.keys(calls[0]!.body as object)).toEqual(["id", "options", "bindings", "accent"]);
    // The answer is the design as GET has it; one from before the designs reads as the canvas.
    expect(d.active).toBe("custom");
    expect(d.catalogue).toEqual([]);
  });

  it("drops the design saved for an audience", async () => {
    await resetPreset(EVENT, "ticket", "staff");
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/api/v1/events/42/designs/ticket/preset", options: { query: { audience: "staff" } } });
  });

  it("asks the server to fill the preview, for the sample guest or a ticket, and can be called off", async () => {
    const ctrl = new AbortController();
    const html = await previewPresetHtml(CLUB, "certificate", "event_default", { ...CHOICE, id: "certificate/07-swiss-minimal" }, "MOA-ABCDE-12345", ctrl.signal);
    expect(html).toBe("<!doctype html><p>filled</p>");
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/clubs/designs/certificate/preset/preview",
      body: { id: "certificate/07-swiss-minimal", ticket_id: "MOA-ABCDE-12345" },
      options: { query: { audience: "event_default" }, signal: ctrl.signal },
    });
  });

  it("fetches the exact preview as a PNG through the gateway", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const blob = await previewPresetPng(EVENT, "ticket", "attendee", { ...CHOICE, id: "ticket/01-dusk-horizon" }, null);
      expect(blob.size).toBeGreaterThan(0);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toMatch(/\/api\/v1\/events\/42\/designs\/ticket\/preset\/preview\?format=png&audience=attendee$/);
      expect(init).toMatchObject({ method: "POST", credentials: "include" });
      expect(JSON.parse(String(init.body))).toMatchObject({ id: "ticket/01-dusk-horizon", ticket_id: null });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
