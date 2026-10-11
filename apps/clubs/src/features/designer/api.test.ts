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

const { fetchLayout, fetchStarter, resetDesign, saveLayout, uploadLayoutImage } = await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("the layout endpoints", () => {
  it("reads the layout for the audience on screen, with every default the schema fills", async () => {
    const d = await fetchLayout(42, "ticket", "speaker");

    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/v1/events/42/designs/ticket/layout", options: { query: { audience: "speaker" } } });
    expect(d.layers[0]).toMatchObject({ kind: "qr", hidden: false, locked: false, preprinted: false });
    expect(d.version).toBe(3);
  });

  it("saves to the same audience it read from, sending only the layout", async () => {
    await saveLayout(42, "certificate", "staff", { canvas: CANVAS, layers: LAYERS as never, page: PAGE });

    expect(calls[0]).toMatchObject({
      method: "PUT",
      path: "/api/v1/events/42/designs/certificate/layout",
      body: { canvas: CANVAS, layers: LAYERS, page: PAGE },
      options: { query: { audience: "staff" } },
    });
  });

  it("resets the audience's own copy, not the event default", async () => {
    await resetDesign(42, "ticket", "attendee");

    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/api/v1/events/42/designs/ticket", options: { query: { audience: "attendee" } } });
  });

  it("fetches a starter by name", async () => {
    const s = await fetchStarter(42, "ticket", "classic");

    expect(calls[0]?.path).toBe("/api/v1/events/42/designs/ticket/layout/starters/classic");
    expect(s.layers).toHaveLength(1);
  });

  it("uploads a template as multipart under the event, saying what it is for", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "art.png", { type: "image/png" });

    const res = await uploadLayoutImage(42, "ticket", file, "template");

    expect(calls[0]).toMatchObject({ method: "POST", path: "/api/v1/events/42/designs/ticket/layout/images", options: { query: { purpose: "template" } } });
    expect(calls[0]?.body).toBeInstanceOf(FormData);
    expect((calls[0]?.body as FormData).get("file")).toBe(file);
    expect(res).toMatchObject({ key: "base/events/42/layout/template-abc.png", width: 1560, height: 690 });
  });
});
