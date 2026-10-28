import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubPictureBrowser } from "@/test/pictures";

import {
  API_IMAGE_MAX,
  GATEWAY_BODY_MAX,
  IMAGE_ACCEPT,
  ImageTooBigError,
  fitImage,
  isPicture,
  normaliseImage,
  pictureType,
  shrinkImage,
  sizedSvg,
} from "./images";

/**
 * Pictures over their budget (4 MB: under the API's 5 MB for a picture on its
 * strictest paths) are redrawn smaller before they are sent. jsdom has no
 * canvas, so one is stood in here: a redraw "weighs" a fixed number of bytes
 * per pixel, so a smaller canvas makes a smaller file, as in a browser.
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

  it("refuses with words a picture that cannot be made small enough, never saying to re-save it as a JPEG", async () => {
    bytesPerPixel = 400; // nothing gets under the limit
    await expect(fitImage(bigFile("huge.jpg", "image/jpeg", 20 * MB), "cover")).rejects.toThrow(ImageTooBigError);
    const refused = await fitImage(bigFile("huge.jpg", "image/jpeg", 20 * MB), "cover").catch((e: Error) => e);
    expect(refused).toBeInstanceOf(ImageTooBigError);
    expect((refused as Error).message).toMatch(/^The cover is 20\.0 MB, more than the 5\.0 MB that can be sent/);
    expect((refused as Error).message).not.toMatch(/JPE?G/);
  });

  it("sends one it cannot bring under budget when the API still takes it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("cannot decode"); }));
    // Over the 4 MB budget, within the API's 5 MB: sent as it is rather than refused.
    const photo = bigFile("photo.jpg", "image/jpeg", 4.5 * MB);
    expect(await fitImage(photo, "photo")).toBe(photo);
    expect(drawn).toEqual([]);
  });
});

describe("a picture in a format the API does not keep", () => {
  const file = (name: string, type: string, body: BlobPart = "x", size?: number) => {
    const f = new File([body], name, { type });
    if (size) Object.defineProperty(f, "size", { value: size });
    return f;
  };

  it("sends JPEG, PNG, WebP and GIF as they are", async () => {
    stubPictureBrowser({ opens: ["image/jpeg", "image/png", "image/webp", "image/gif"] });
    for (const [name, type] of [["a.jpg", "image/jpeg"], ["a.png", "image/png"], ["a.webp", "image/webp"], ["a.gif", "image/gif"]] as const) {
      const picked = file(name, type);
      expect(await normaliseImage(picked)).toBe(picked);
    }
  });

  it("draws an SVG logo as a PNG at 2,048 px on its longest side, transparency kept", async () => {
    const browser = stubPictureBrowser({ opens: ["image/png", "image/jpeg"] });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><circle cx="30" cy="30" r="25" fill="#17a58f"/></svg>';
    const out = await normaliseImage(file("crest.svg", "image/svg+xml", svg));

    expect(out.type).toBe("image/png");
    expect(out.name).toBe("crest.png");
    expect(browser.encoded).toEqual([{ width: 2048, height: 1024, type: "image/png", quality: undefined }]);
    // The <img> was given the size, and the SVG says it too (a sizeless SVG draws at 300 x 150, or not at all).
    expect(browser.svgs).toHaveLength(1);
    expect(browser.svgs[0]).toMatchObject({ width: 2048, height: 1024 });
    expect(browser.svgs[0]!.text).toMatch(/width="2048"/);
    expect(browser.svgs[0]!.text).toMatch(/height="1024"/);
  });

  it("sizes an SVG from its width and height, its viewBox, or neither", () => {
    expect(sizedSvg('<svg xmlns="http://www.w3.org/2000/svg" width="200px" height="100"/>')).toMatchObject({ width: 2048, height: 1024 });
    expect(sizedSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 100"/>')).toMatchObject({ width: 1024, height: 2048 });
    expect(sizedSvg('<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 30 10"/>')).toMatchObject({ width: 2048, height: 683 });
    const bare = sizedSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="300" height="150"/></svg>')!;
    expect(bare).toMatchObject({ width: 2048, height: 1024 });
    // A viewBox is added, so the drawing scales with the new size instead of being cropped.
    expect(bare.svg).toMatch(/viewBox="0 0 300 150"/);
    expect(sizedSvg("<html><body>not a drawing</body></html>")).toBeNull();
  });

  it("redraws an AVIF as a JPEG, or as a PNG when some of it is see-through", async () => {
    let browser = stubPictureBrowser({ opens: ["image/avif"], size: { width: 1600, height: 900 } });
    const photo = await normaliseImage(file("banner.avif", "image/avif"));
    expect(photo).toMatchObject({ type: "image/jpeg", name: "banner.jpg" });
    expect(browser.encoded).toEqual([{ width: 1600, height: 900, type: "image/jpeg", quality: 0.9 }]);

    vi.restoreAllMocks();
    browser = stubPictureBrowser({ opens: ["image/avif"], seeThrough: true });
    const logo = await normaliseImage(file("logo.avif", "image/avif"));
    expect(logo).toMatchObject({ type: "image/png", name: "logo.png" });
    expect(browser.encoded.map((e) => e.type)).toEqual(["image/png"]);
  });

  it("redraws a HEIC in Safari, which opens it, and caps a huge one at 4,096 px", async () => {
    const browser = stubPictureBrowser({ opens: ["image/heic", "image/jpeg"], size: { width: 8064, height: 6048 } });
    const out = await normaliseImage(file("IMG_0042.HEIC", "image/heic"));
    expect(out).toMatchObject({ type: "image/jpeg", name: "IMG_0042.jpg" });
    expect(browser.encoded[0]).toMatchObject({ width: 4096, height: 3072 });
  });

  it("sends a HEIC that Chrome cannot open as it is, typed by its name, for the API to convert", async () => {
    stubPictureBrowser({ opens: ["image/jpeg", "image/png", "image/avif"] });
    // Chrome on Windows gives a HEIC no type at all.
    const picked = file("IMG_0042.HEIC", "", "heic bytes", 3 * MB);
    const out = await fitImage(picked, "poster");
    expect(out.type).toBe("image/heic");
    expect(out.name).toBe("IMG_0042.HEIC");
    expect(await out.text()).toBe("heic bytes");
  });

  it("sends an unopenable picture up to the API's 5 MB, and refuses a bigger one with words", async () => {
    stubPictureBrowser({ opens: ["image/jpeg"] });
    const fits = await fitImage(file("scan.tiff", "image/tiff", "x", API_IMAGE_MAX), "scan");
    expect(fits.size).toBe(API_IMAGE_MAX);
    await expect(fitImage(file("IMG.heic", "image/heic", "x", 6 * MB), "poster")).rejects.toThrow(
      /^The poster is 6\.0 MB, more than the 5\.0 MB that can be sent, and it couldn't be made smaller here\./,
    );
  });

  it("knows a picture by its type or, without one, by its name", () => {
    expect(isPicture(file("a.heic", ""))).toBe(true);
    expect(isPicture(file("a.SVG", ""))).toBe(true);
    expect(isPicture(file("a.jpg", "image/jpg"))).toBe(true);
    expect(pictureType(file("a.jpg", "image/jpg"))).toBe("image/jpeg");
    expect(isPicture(file("notes.txt", "text/plain"))).toBe(false);
    expect(isPicture(file("poster.pdf", "application/pdf"))).toBe(false);
  });

  it("offers every format that gets through in the file picker", () => {
    const offered = IMAGE_ACCEPT.split(",");
    for (const wanted of ["image/heic", "image/heif", "image/avif", "image/svg+xml", ".heic", ".heif", ".svg", "image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(offered).toContain(wanted);
    }
  });
});
