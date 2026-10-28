import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubPictureBrowser } from "@/test/pictures";

import { POSTER_IMAGE, SPEAKER_IMAGE, fitEventImages } from "./api";
import { eventFormSchema } from "./schemas";

/**
 * The event's pictures, ready before the save: converted when the API does
 * not keep their format, and made small enough to send. A phone photo as the
 * poster failed on save with an error that said nothing.
 */
const MB = 1024 * 1024;

function bigFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const values = (overrides: Record<string, unknown> = {}) =>
  eventFormSchema.parse({
    name: "Hack Night", category_id: 1, event_datetime: "2026-11-01T18:00", duration: 3, is_online: false,
    location_name: "Main Hall", has_fee: false, has_prize: false, interest_ids: [], additional_details: [], speakers: [],
    ...overrides,
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the event's pictures before a save", () => {
  describe("in a browser that can redraw them", () => {
    beforeEach(() => {
      vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3000, height: 4000, close: vi.fn() })));
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        () => ({ drawImage: vi.fn(), fillRect: vi.fn(), clearRect: vi.fn(), fillStyle: "" }) as unknown as CanvasRenderingContext2D,
      );
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, done, type = "image/png") {
        // A real body, so the redrawn file weighs what a browser's would.
        done(new Blob([new Uint8Array(Math.round(this.width * this.height * 0.4))], { type }));
      });
    });

    it("shrinks a phone photo poster and the speakers' photos to their budgets", async () => {
      const out = await fitEventImages(
        values({
          posterFile: bigFile("poster.jpg", "image/jpeg", 9 * MB),
          speakers: [{ name: "Dr. Rao", photoFile: bigFile("rao.jpg", "image/jpeg", 5 * MB) }, { name: "Meera" }],
        }),
      );
      expect(out.posterFile!.size).toBeLessThanOrEqual(POSTER_IMAGE.maxBytes);
      expect(out.speakers[0]!.photoFile!.size).toBeLessThanOrEqual(SPEAKER_IMAGE.maxBytes);
      expect(out.speakers[1]!.photoFile).toBeUndefined();
    });
  });

  it("leaves a poster that already fits as it is", async () => {
    const poster = bigFile("poster.jpg", "image/jpeg", 800 * 1024);
    expect((await fitEventImages(values({ posterFile: poster }))).posterFile).toBe(poster);
  });

  it("refuses with words a poster that cannot be made small enough, before sending", async () => {
    // A browser that cannot open a HEIC (Chrome) cannot redraw a 12 MB one either.
    stubPictureBrowser({ opens: ["image/jpeg", "image/png"] });
    await expect(fitEventImages(values({ posterFile: bigFile("poster.heic", "image/heic", 12 * MB) }))).rejects.toThrow(
      /^The poster is 12\.0 MB, more than the 9\.0 MB that can be sent/,
    );
  });

  it("sends a smaller HEIC the browser cannot open as it is, for the API to convert", async () => {
    stubPictureBrowser({ opens: ["image/jpeg", "image/png"] });
    const poster = bigFile("IMG_0042.HEIC", "", 3.5 * MB);
    const out = await fitEventImages(values({ posterFile: poster }));
    expect(out.posterFile).toMatchObject({ name: "IMG_0042.HEIC", type: "image/heic" });
  });

  it("draws an SVG poster as a PNG before the save", async () => {
    stubPictureBrowser({ opens: ["image/jpeg", "image/png"] });
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"/>'], "poster.svg", { type: "image/svg+xml" });
    const out = await fitEventImages(values({ posterFile: svg }));
    expect(out.posterFile).toMatchObject({ name: "poster.png", type: "image/png" });
  });
});
