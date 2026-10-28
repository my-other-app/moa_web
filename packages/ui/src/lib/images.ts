/**
 * Pictures, made ready to send. Every picture picker in the dashboards (clubs
 * and admin) sends what it picks through `fitImage` (or `normaliseImage` and
 * `shrinkImage`, the two steps it is made of).
 *
 * 1. **Normalised.** JPEG, PNG, WebP and GIF go as they are: every browser,
 *    the app and the API keep them. Anything else is redrawn here first, when
 *    the browser can open it:
 *    - an SVG (a logo, usually) becomes a PNG, its longest side 2,048 px,
 *      transparency kept. The API never draws an SVG it is sent;
 *    - an AVIF, a HEIC/HEIF (Safari opens those), a BMP or a TIFF becomes a
 *      PNG when some of it is see-through, else a JPEG.
 *    One the browser cannot open (a HEIC in Chrome or Firefox, a TIFF outside
 *    Safari) goes as it is, and the API converts it (moa_backend
 *    app/core/storage/formats.py).
 * 2. **Fitted.** One over its budget is redrawn smaller, keeping its shape:
 *    its longest side brought down step by step, as a JPEG at good quality (a
 *    PNG, which may be see-through, is tried as a PNG first).
 *
 * Budgets. The API takes 5 MB for a picture on its strictest paths (the
 * designer's pictures, an email's, a product photo) and 10 MB on the image
 * columns (logos, covers, posters, photos); the server in front of it and the
 * dashboards refuses a request over 10 MB. So a picture is redrawn under 4 MB
 * (`GATEWAY_BODY_MAX`, room for the form around it), and one that cannot be
 * brought under that is still sent when it is within 5 MB (`API_IMAGE_MAX`),
 * which every path takes. Over that it is refused here, with words, before
 * anything is sent.
 */

const MB = 1024 * 1024;

/** What one picture is redrawn under before it is sent. */
export const GATEWAY_BODY_MAX = 4 * MB;
/** The API's smallest limit for one picture: the most any picture is sent at. */
export const API_IMAGE_MAX = 5 * MB;
/** What one request may carry in all (pictures and the form): the server refuses one over 10 MB. */
export const REQUEST_MAX = 9 * MB;

/** The longest side an SVG is drawn at. */
export const SVG_LONGEST_SIDE = 2048;
/** The longest side a converted picture keeps: the API's own cap for an original, and a canvas every browser can draw. */
const CONVERTED_LONGEST_SIDE = 4096;
/** iOS Safari's largest canvas, in pixels. */
const CANVAS_MAX_AREA = 16_777_216;

/** Kept as they are, by the browser and the API alike. */
const KEPT = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** A picture's type from its name, for a file the browser gave no type (a HEIC in Chrome on Windows). */
const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  hif: "image/heif",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  dib: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

/**
 * What a picture input offers: every format that gets through, whether kept,
 * redrawn here or converted by the API. Types and names both, for a system
 * that knows a HEIC only by its name.
 */
export const IMAGE_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
  ".avif",
  ".svg",
  ".bmp",
  ".tif",
  ".tiff",
].join(",");

/** The formats, in the words people know them by. */
export const IMAGE_FORMATS_LABEL = "JPG, PNG, WebP, GIF, HEIC, AVIF, SVG, BMP or TIFF";

function extension(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
}

/** The file's picture type: what the browser said, else what its name says; "" when neither. */
export function pictureType(file: File): string {
  const said = (file.type || "").toLowerCase();
  if (said.startsWith("image/")) return said === "image/jpg" || said === "image/pjpeg" ? "image/jpeg" : said;
  return TYPE_BY_EXTENSION[extension(file.name)] ?? "";
}

/** Whether a picked file is a picture, by its type or, when it has none, its name. */
export function isPicture(file: File): boolean {
  return pictureType(file) !== "";
}

export function sizeLabel(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

export class ImageTooBigError extends Error {
  constructor(what: string, size: number, maxBytes: number) {
    super(
      `The ${what} is ${sizeLabel(size)}, more than the ${sizeLabel(maxBytes)} that can be sent, and it couldn't be made smaller here. Choose a smaller copy of it (a screenshot works) and try again.`,
    );
    this.name = "ImageTooBigError";
  }
}

function renamed(file: File, ext: string): string {
  return `${file.name.replace(/\.[^.]+$/, "") || "image"}.${ext}`;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, type, quality);
    } catch {
      // A canvas the browser considers tainted refuses: the file goes as it is.
      resolve(null);
    }
  });
}

function canDraw(): boolean {
  return typeof document !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
}

/** How long an <img> may take to open a picture before it is given up on (and the file sent as it is). */
const LOAD_TIMEOUT_MS = 10_000;

/** An <img> loaded from `url`, at `width` x `height` when given. */
function loadImage(url: string, width?: number, height?: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error("The browser took too long to open the picture")), LOAD_TIMEOUT_MS);
    if (width) img.width = width;
    if (height) img.height = height;
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("The browser could not open the picture"));
    };
    img.src = url;
  });
}

// ─── SVG ────────────────────────────────────────────────────────────────

/** A length in an SVG's width or height that is a plain number of pixels; NaN otherwise (%, em, mm...). */
function svgLength(value: string | null): number {
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/i.exec(value ?? "");
  return m ? Number(m[1]) : Number.NaN;
}

/**
 * The SVG's text with an explicit width and height (its longest side
 * `longest`) and a viewBox, so every browser draws it at that size: one with
 * no size draws at 300 x 150, or not at all (Firefox). Null when the text is
 * not an SVG.
 */
export function sizedSvg(text: string, longest = SVG_LONGEST_SIDE): { svg: string; width: number; height: number } | null {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") return null;
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
  const box = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const hasBox = box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0;
  let w = svgLength(root.getAttribute("width"));
  let h = svgLength(root.getAttribute("height"));
  if (!(w > 0) || !(h > 0)) {
    const ratio = hasBox ? box[2]! / box[3]! : 2; // CSS's default for a replaced element: 300 x 150
    if (w > 0) h = w / ratio;
    else if (h > 0) w = h * ratio;
    else if (hasBox) [w, h] = [box[2]!, box[3]!];
    else [w, h] = [300, 150];
  }
  // A viewBox, so the drawing scales with the new size rather than being cropped by it.
  if (!hasBox) root.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const scale = longest / Math.max(w, h);
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  return { svg: new XMLSerializer().serializeToString(doc), width, height };
}

/** The SVG drawn as a PNG, see-through where it is; null when the browser cannot draw it. */
async function svgToPng(file: File): Promise<File | null> {
  if (!canDraw()) return null;
  let sized: ReturnType<typeof sizedSvg>;
  try {
    sized = sizedSvg(await file.text());
  } catch {
    return null;
  }
  if (!sized) return null;
  const url = URL.createObjectURL(new Blob([sized.svg], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(url, sized.width, sized.height);
    const canvas = document.createElement("canvas");
    canvas.width = sized.width;
    canvas.height = sized.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, sized.width, sized.height);
    const blob = await toBlob(canvas, "image/png");
    return blob ? new File([blob], renamed(file, "png"), { type: "image/png" }) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─── Other formats: AVIF, HEIC, BMP, TIFF... ─────────────────────────────

type Drawable = { source: CanvasImageSource; width: number; height: number; done: () => void };

/** The picture, opened by the browser: as a bitmap, else through an <img>. Null when it cannot. */
async function open(file: File): Promise<Drawable | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close?.() };
    } catch {
      // Some formats open in an <img> but not as a bitmap.
    }
  }
  if (!canDraw()) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) throw new Error("no size");
    return { source: img, width, height, done: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** Whether any pixel of the canvas is see-through at all, read a strip at a time. */
function seeThrough(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const rows = Math.max(1, Math.floor(1_048_576 / width));
  for (let y = 0; y < height; y += rows) {
    const { data } = ctx.getImageData(0, y, width, Math.min(rows, height - y));
    for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
  }
  return false;
}

/** A picture the browser opens, redrawn as a PNG (see-through) or a JPEG; null when it cannot be. */
async function redrawn(file: File): Promise<File | null> {
  if (typeof document === "undefined") return null;
  const picture = await open(file);
  if (!picture) return null;
  try {
    const scale = Math.min(
      1,
      CONVERTED_LONGEST_SIDE / Math.max(picture.width, picture.height),
      Math.sqrt(CANVAS_MAX_AREA / (picture.width * picture.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(picture.width * scale));
    canvas.height = Math.max(1, Math.floor(picture.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(picture.source, 0, 0, canvas.width, canvas.height);
    let clear = false;
    try {
      clear = seeThrough(ctx, canvas.width, canvas.height);
    } catch {
      clear = false;
    }
    if (clear) {
      const png = await toBlob(canvas, "image/png");
      return png ? new File([png], renamed(file, "png"), { type: "image/png" }) : null;
    }
    // A JPEG has no transparency: drawn over white, never black.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const jpeg = await toBlob(canvas, "image/jpeg", 0.9);
    return jpeg ? new File([jpeg], renamed(file, "jpg"), { type: "image/jpeg" }) : null;
  } finally {
    picture.done();
  }
}

/** The file with the type its name says, when the browser gave it none: the API is told what it is. */
function typed(file: File): File {
  const type = pictureType(file);
  return !type || file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

/**
 * The picture in a format every browser, the app and the API keep: JPEG,
 * PNG, WebP or GIF as they are; anything else redrawn here when the browser
 * can open it (an SVG as a PNG; the rest as a PNG when see-through, else a
 * JPEG); otherwise the file as it is, typed by its name, for the API to
 * convert. Never throws.
 */
export async function normaliseImage(file: File): Promise<File> {
  return (await normalised(file)).file;
}

/** normaliseImage, and whether the browser could open the picture at all. */
async function normalised(file: File): Promise<{ file: File; opened: boolean }> {
  const type = pictureType(file);
  if (!type || KEPT.has(type)) return { file: typed(file), opened: true };
  const out = type === "image/svg+xml" ? await svgToPng(file) : await redrawn(file);
  return out ? { file: out, opened: true } : { file: typed(file), opened: false };
}

// ─── Fitting a budget ───────────────────────────────────────────────────

export interface ShrinkOptions {
  /** The most the picture should weigh once sent. */
  maxBytes?: number;
  /** Its longest side, in pixels, at the first try; each later try is smaller. */
  longestSide?: number;
}

/** Fractions of `longestSide`, and the JPEG quality, tried in turn. */
const STEPS: ReadonlyArray<{ side: number; quality: number }> = [
  { side: 1, quality: 0.86 },
  { side: 0.8, quality: 0.82 },
  { side: 0.62, quality: 0.78 },
  { side: 0.48, quality: 0.74 },
  { side: 0.36, quality: 0.7 },
];

/**
 * The picture, redrawn under `maxBytes` when it is over; the file itself when
 * it already fits, is not a picture, or cannot be redrawn. Never throws: the
 * caller checks the size of what comes back (fitImage does).
 */
export async function shrinkImage(file: File, { maxBytes = GATEWAY_BODY_MAX, longestSide = 2400 }: ShrinkOptions = {}): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= maxBytes) return file;
  // An animation would keep one frame.
  if (file.type === "image/gif") return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const mayBeClear = file.type === "image/png" || file.type === "image/webp";
  // The smallest redraw so far, kept only when it is smaller than the file.
  let best: { blob: Blob; ext: string; type: string } | null = null;
  let bestSize = file.size;
  const asFile = (b: { blob: Blob; ext: string; type: string }) => new File([b.blob], renamed(file, b.ext), { type: b.blob.type || b.type });
  try {
    for (const step of STEPS) {
      const scale = Math.min(1, (longestSide * step.side) / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      const tries: Array<{ type: string; ext: string }> = mayBeClear
        ? [
            { type: "image/png", ext: "png" },
            { type: "image/jpeg", ext: "jpg" },
          ]
        : [{ type: "image/jpeg", ext: "jpg" }];
      for (const { type, ext } of tries) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (type === "image/jpeg") {
          // A JPEG has no transparency: what was clear becomes white, not black.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await toBlob(canvas, type, step.quality);
        if (!blob || blob.size >= bestSize) continue;
        best = { blob, ext, type };
        bestSize = blob.size;
        if (blob.size <= maxBytes) return asFile(best);
      }
    }
    return best ? asFile(best) : file;
  } finally {
    bitmap.close?.();
  }
}

/**
 * The picture, ready to send: normalised (normaliseImage), then redrawn under
 * `maxBytes` when it is over and can be. One that still weighs more is sent
 * as long as it is within API_IMAGE_MAX (a HEIC that Chrome cannot open goes
 * as it is, for the API to convert); over that, an ImageTooBigError whose
 * message says what to do.
 */
export async function fitImage(file: File, what: string, options: ShrinkOptions = {}): Promise<File> {
  const ready = (await normalised(file)).file;
  const fitted = await shrinkImage(ready, options);
  const limit = Math.max(options.maxBytes ?? GATEWAY_BODY_MAX, API_IMAGE_MAX);
  if (fitted.size > limit) throw new ImageTooBigError(what, file.size, API_IMAGE_MAX);
  return fitted;
}
