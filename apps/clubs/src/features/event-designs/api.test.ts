import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];

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
  const record = (method: string) => async (path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (path.includes("/sample")) {
      return {
        values: { name: "Aisha Rahman", venue: "Hall" },
        qr_data_url: "data:image/png;base64,AAAA",
        registration: null,
      };
    }
    return {
      config: {},
      audience: "event_default",
      source: "event_default",
      is_own: true,
      template_id: 1,
    };
  };
  return {
    ...actual,
    api: {
      get: vi.fn(record("GET")),
      put: vi.fn(record("PUT")),
      post: vi.fn(record("POST")),
      del: vi.fn(record("DELETE")),
    },
  };
});

const { fetchDesign, fetchDesignSample, resetDesign, saveArtwork, saveDesign } =
  await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("the design endpoints", () => {
  it("reads a design for the audience on screen", async () => {
    await fetchDesign(42, "ticket", "speaker");

    expect(calls[0]?.path).toBe("/api/v1/events/42/designs/ticket?audience=speaker");
  });

  it("saves to the same audience it read from", async () => {
    await saveDesign(42, "certificate", "staff", { bg_color: "#000000" });

    expect(calls[0]).toMatchObject({
      method: "PUT",
      path: "/api/v1/events/42/designs/certificate?audience=staff",
      body: { config: { bg_color: "#000000" } },
    });
  });

  it("leaves the name out rather than sending an empty one", async () => {
    // An empty name would overwrite the design's own name on every save.
    await saveDesign(42, "ticket", "event_default", {});

    expect(calls[0]?.body).toEqual({ config: {} });
  });

  it("resets the audience on screen, not the event's default", async () => {
    await resetDesign(42, "ticket", "attendee");

    expect(calls[0]).toMatchObject({
      method: "DELETE",
      path: "/api/v1/events/42/designs/ticket?audience=attendee",
    });
  });
});

describe("artwork uploads", () => {
  it("posts to the artwork endpoint for the right audience", async () => {
    const file = new File(["x"], "bg.png", { type: "image/png" });

    await saveArtwork(7, "ticket", "speaker", { background_image: file });

    expect(calls[0]?.path).toBe(
      "/api/v1/events/7/designs/ticket/artwork?audience=speaker"
    );
  });

  it("sends only the images that were picked", async () => {
    // Sending an empty field reads as "clear this image" server-side, which
    // would wipe a logo on a save that only changed the background.
    const file = new File(["x"], "bg.png", { type: "image/png" });

    await saveArtwork(7, "ticket", "event_default", {
      background_image: file,
      logo: undefined,
    });

    const body = calls[0]?.body as FormData;
    expect(body.has("background_image")).toBe(true);
    expect(body.has("logo")).toBe(false);
  });

  it("names each removal so the server knows what to clear", async () => {
    await saveArtwork(7, "certificate", "event_default", {}, ["background_image"]);

    const body = calls[0]?.body as FormData;
    expect(body.get("remove_background_image")).toBe("true");
  });
});


describe("previewing as an attendee", () => {
  it("asks for the sample attendee when no ticket is chosen", async () => {
    const sample = await fetchDesignSample(42, "ticket", null);

    expect(calls[0]?.path).toBe("/api/v1/events/42/designs/ticket/sample");
    expect(sample.values.name).toBe("Aisha Rahman");
    expect(sample.registration).toBeNull();
  });

  it("names the registration whose values it wants", async () => {
    await fetchDesignSample(42, "certificate", "MOA-7 7");

    // Encoded, because a ticket code is user-visible text, not a URL part.
    expect(calls[0]?.path).toBe(
      "/api/v1/events/42/designs/certificate/sample?ticket_id=MOA-7%207"
    );
  });
});
