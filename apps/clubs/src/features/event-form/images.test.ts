import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POSTER_IMAGE, SPEAKER_IMAGE, fitEventImages } from "./api";
import { eventFormSchema } from "./schemas";

/**
 * The event's pictures, made small enough for the gateway (a Vercel
 * function that refuses a request over 4.5 MB) before the save: a phone
 * photo as the poster failed on save with an error that said nothing.
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
    // jsdom has no canvas: a 9 MB poster cannot be redrawn here.
    await expect(fitEventImages(values({ posterFile: bigFile("poster.heic", "image/heic", 9 * MB) }))).rejects.toThrow(
      /^The poster is 9\.0 MB, more than the 3\.0 MB that can be sent/,
    );
  });
});
