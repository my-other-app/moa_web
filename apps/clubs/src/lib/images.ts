/**
 * Pictures sent through the gateway.
 *
 * Every upload goes to this app's own /api/gateway, a Vercel function, which
 * refuses a request body over 4.5 MB before it reaches the API -- so a phone
 * photo (often 5 to 12 MB) used as a poster, a logo, a cover or a speaker's
 * photo failed on save with an error that said nothing useful. A picture over
 * its budget is redrawn smaller here, keeping its shape: its longest side
 * brought down step by step, as a JPEG at good quality (a PNG, which may be
 * transparent, is tried as a PNG first). One that still does not fit, or
 * cannot be redrawn (no canvas, or a format the browser cannot open), is
 * refused with a message that says so, before anything is sent.
 */

/** What one request may carry: under Vercel's 4.5 MB, with room for the form around it. */
export const GATEWAY_BODY_MAX = 4 * 1024 * 1024;

export interface ShrinkOptions {
  /** The most the picture may weigh once sent. */
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

export function sizeLabel(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class ImageTooBigError extends Error {
  constructor(what: string, size: number, maxBytes: number) {
    super(
      `The ${what} is ${sizeLabel(size)}, more than the ${sizeLabel(maxBytes)} that can be sent, and it could not be made smaller here. Save it as a smaller JPEG and choose it again.`,
    );
    this.name = "ImageTooBigError";
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });
}

function renamed(file: File, ext: string): string {
  return `${file.name.replace(/\.[^.]+$/, "") || "image"}.${ext}`;
}

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
  const asFile = (b: { blob: Blob; ext: string; type: string }) =>
    new File([b.blob], renamed(file, b.ext), { type: b.blob.type || b.type });
  try {
    for (const step of STEPS) {
      const scale = Math.min(1, (longestSide * step.side) / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      const tries: Array<{ type: string; ext: string }> = mayBeClear
        ? [{ type: "image/png", ext: "png" }, { type: "image/jpeg", ext: "jpg" }]
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
 * The picture, ready to send within `maxBytes`: shrunk if it has to be, or
 * an ImageTooBigError whose message says what to do.
 */
export async function fitImage(file: File, what: string, options: ShrinkOptions = {}): Promise<File> {
  const maxBytes = options.maxBytes ?? GATEWAY_BODY_MAX;
  const fitted = await shrinkImage(file, options);
  if (fitted.size > maxBytes) throw new ImageTooBigError(what, file.size, maxBytes);
  return fitted;
}
