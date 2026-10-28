import { vi } from "vitest";

// jsdom's Blob has no text(), which every browser's has (the SVG is read with it).
if (typeof Blob.prototype.text !== "function") {
  Blob.prototype.text = function text(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

/**
 * A browser that opens and draws pictures, for jsdom (which does neither).
 *
 * `opens` is what this browser can decode: Chrome opens an AVIF but not a
 * HEIC; Safari opens both. createImageBitmap and <img> open exactly those
 * types (an <img> opens an SVG too) and fail on anything else, as a browser
 * does. A canvas "draws" at its size; `seeThrough` says whether what was drawn
 * has transparent pixels. What was drawn, and every SVG an <img> was given,
 * is recorded.
 *
 * Call in a beforeEach (or a test); vi.unstubAllGlobals() and
 * vi.restoreAllMocks() in an afterEach undo it.
 */
export interface PictureBrowser {
  /** Each canvas encoded: its size and the type asked for. */
  encoded: Array<{ width: number; height: number; type: string; quality?: number }>;
  /** The text of each SVG an <img> was given, and the size it was given. */
  svgs: Array<{ text: string; width: number; height: number }>;
}

export function stubPictureBrowser({
  opens,
  size = { width: 1200, height: 800 },
  seeThrough = false,
}: {
  opens: string[];
  size?: { width: number; height: number };
  seeThrough?: boolean;
}): PictureBrowser {
  const seen: PictureBrowser = { encoded: [], svgs: [] };
  const urls = new Map<string, Blob>();
  let next = 0;

  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (blob: Blob) => {
      if (!opens.includes(blob.type)) throw new DOMException("The source image could not be decoded.", "InvalidStateError");
      return { width: size.width, height: size.height, close: vi.fn() };
    }),
  );
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const url = `blob:picture-${(next += 1)}`;
    urls.set(url, blob as Blob);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => void urls.delete(url));

  class OpeningImage {
    width = 0;
    height = 0;
    naturalWidth = 0;
    naturalHeight = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      const blob = urls.get(url);
      void (async () => {
        if (!blob || !(opens.includes(blob.type) || blob.type === "image/svg+xml")) return this.onerror?.();
        if (blob.type === "image/svg+xml") seen.svgs.push({ text: await blob.text(), width: this.width, height: this.height });
        this.naturalWidth = this.width || size.width;
        this.naturalHeight = this.height || size.height;
        this.onload?.();
      })();
    }
  }
  vi.stubGlobal("Image", OpeningImage);

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      fillStyle: "",
      globalCompositeOperation: "source-over",
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4).fill(255);
        if (seeThrough) data[3] = 0;
        return { data, width: w, height: h };
      },
    } as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement["getContext"]);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, done, type = "image/png", quality) {
    seen.encoded.push({ width: this.width, height: this.height, type, quality });
    done(new Blob([new Uint8Array(64)], { type }));
  });
  return seen;
}
