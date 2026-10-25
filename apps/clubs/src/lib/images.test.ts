import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GATEWAY_BODY_MAX, ImageTooBigError, fitImage, shrinkImage } from "./images";

/**
 * Pictures over the gateway's limit (a Vercel function: 4.5 MB a request)
 * are redrawn smaller before they are sent. jsdom has no canvas, so one is
 * stood in here: a redraw "weighs" a fixed number of bytes per pixel, so a
 * smaller canvas makes a smaller file, as in a browser.
 */
const MB = 1024 * 1024;
let bytesPerPixel = 0.5;
const drawn: Array<{ width: number; height: number; type: string; quality: number; size: number }> = [];

function bigFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

beforeEach(() => {
  bytesPerPixel = 0.5;
  drawn.length = 0;
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage: vi.fn(), fillRect: vi.fn(), clearRect: vi.fn(), fillStyle: "" }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, done, type = "image/png", quality = 1) {
    const size = Math.round(this.width * this.height * bytesPerPixel);
    drawn.push({ width: this.width, height: this.height, type, quality, size });
    const blob = new Blob(["x"], { type });
    Object.defineProperty(blob, "size", { value: size });
    done(blob);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a picture for the gateway", () => {
  it("leaves one that already fits alone", async () => {
    const small = bigFile("crest.jpg", "image/jpeg", 300 * 1024);
    expect(await shrinkImage(small)).toBe(small);
    expect(drawn).toEqual([]);
  });

  it("redraws a phone photo under 4 MB as a JPEG, keeping its shape", async () => {
    const photo = bigFile("IMG_2041.jpeg", "image/jpeg", 9 * MB);
    const out = await shrinkImage(photo);
    expect(out).not.toBe(photo);
    expect(drawn.at(-1)!.size).toBeLessThanOrEqual(GATEWAY_BODY_MAX);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_2041.jpg");
    // 2,400 px on its longest side, 4:3 as it was.
    expect(drawn[0]).toMatchObject({ width: 2400, height: 1800, type: "image/jpeg" });
  });

  it("steps down until it fits", async () => {
    bytesPerPixel = 2; // 2400x1800 would be 8.6 MB
    const out = await fitImage(bigFile("poster.jpg", "image/jpeg", 12 * MB), "poster", { maxBytes: 3 * MB });
    expect(out.name).toBe("poster.jpg");
    expect(drawn.length).toBeGreaterThan(1);
    expect(drawn.at(-1)!.size).toBeLessThanOrEqual(3 * MB);
    expect(drawn.slice(0, -1).every((d) => d.size > 3 * MB)).toBe(true);
    expect(drawn.at(-1)!.width).toBeLessThan(2400);
    expect(drawn.at(-1)!.width / drawn.at(-1)!.height).toBeCloseTo(4 / 3, 2);
  });

  it("keeps a PNG a PNG when that fits, for a logo's transparency", async () => {
    const out = await shrinkImage(bigFile("logo.png", "image/png", 6 * MB));
    expect(drawn).toHaveLength(1);
    expect(out.type).toBe("image/png");
    expect(out.name).toBe("logo.png");
  });

  it("refuses with words a picture that cannot be made small enough", async () => {
    bytesPerPixel = 400; // nothing gets under the limit
    await expect(fitImage(bigFile("huge.jpg", "image/jpeg", 20 * MB), "cover")).rejects.toThrow(ImageTooBigError);
    await expect(fitImage(bigFile("huge.jpg", "image/jpeg", 20 * MB), "cover")).rejects.toThrow(
      /^The cover is 20\.0 MB, more than the 4\.0 MB that can be sent/,
    );
  });

  it("refuses one the browser cannot open, rather than sending it to fail", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("cannot decode"); }));
    await expect(fitImage(bigFile("IMG.heic", "image/heic", 6 * MB), "poster")).rejects.toThrow(/The poster is 6\.0 MB/);
  });
});
