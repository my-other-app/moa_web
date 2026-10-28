/**
 * The crop step's arithmetic: where a picture sits in its frame, what part
 * of it that is, and the file that comes out. Pure, so it is tested without
 * a canvas (jsdom has none); the drawing itself is `drawCrop`.
 */
import { PICTURE_SPECS, type PictureKind } from "./picture-specs";

export interface Placement {
  /** The picture's top-left corner, in frame pixels (zero or less). */
  x: number;
  y: number;
  /** 1 = the picture just covers the frame; up to MAX_ZOOM. */
  zoom: number;
}

export interface Frame {
  width: number;
  height: number;
}

export interface Natural {
  width: number;
  height: number;
}

export const MAX_ZOOM = 4;

/** Frame pixels per picture pixel at `zoom`: the cover scale, times the zoom. */
export function scaleOf(frame: Frame, picture: Natural, zoom: number): number {
  return Math.max(frame.width / picture.width, frame.height / picture.height) * zoom;
}

/** Keeps the picture over the whole frame: no gap at any edge. */
export function clampPlacement(frame: Frame, picture: Natural, p: Placement): Placement {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, p.zoom));
  const s = scaleOf(frame, picture, zoom);
  const w = picture.width * s;
  const h = picture.height * s;
  const clamp = (v: number, min: number) => Math.min(0, Math.max(min, v));
  return { zoom, x: clamp(p.x, frame.width - w), y: clamp(p.y, frame.height - h) };
}

/** The picture centred, just covering the frame. */
export function centred(frame: Frame, picture: Natural): Placement {
  const s = scaleOf(frame, picture, 1);
  return clampPlacement(frame, picture, { zoom: 1, x: (frame.width - picture.width * s) / 2, y: (frame.height - picture.height * s) / 2 });
}

/** A new zoom, keeping what is at the frame's centre at its centre. */
export function zoomTo(frame: Frame, picture: Natural, p: Placement, zoom: number): Placement {
  const before = scaleOf(frame, picture, p.zoom);
  const cx = (frame.width / 2 - p.x) / before;
  const cy = (frame.height / 2 - p.y) / before;
  const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const after = scaleOf(frame, picture, z);
  return clampPlacement(frame, picture, { zoom: z, x: frame.width / 2 - cx * after, y: frame.height / 2 - cy * after });
}

/** Moved by (dx, dy) frame pixels, kept over the frame. */
export function moveBy(frame: Frame, picture: Natural, p: Placement, dx: number, dy: number): Placement {
  return clampPlacement(frame, picture, { ...p, x: p.x + dx, y: p.y + dy });
}

export interface CropPlan {
  /** The part of the picture kept, in its own pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Where it is drawn in the output (the whole output, unless it is kept whole). */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** The output's size: exactly the kind's shape, never more than it asks for. */
  width: number;
  height: number;
  /** White behind it: a picture kept whole, or a JPEG (which has no transparency). */
  white: boolean;
}

/** What the frame shows now, as a crop of the picture. */
export function planCrop(kind: PictureKind, frame: Frame, picture: Natural, p: Placement): CropPlan {
  const spec = PICTURE_SPECS[kind];
  const s = scaleOf(frame, picture, p.zoom);
  const sw = frame.width / s;
  const sh = frame.height / s;
  // As many pixels as the kept part has, up to the size asked for; the shape exact.
  const width = Math.max(1, Math.min(spec.width, Math.round(sw)));
  const height = Math.max(1, Math.round(width / spec.ratio));
  return { sx: -p.x / s, sy: -p.y / s, sw, sh, dx: 0, dy: 0, dw: width, dh: height, width, height, white: false };
}

/** The share of the square left empty around a picture kept whole, each side. */
export const WHOLE_PADDING = 0.1;

/** The whole picture inside the kind's frame, on white, with room around it. */
export function planWhole(kind: PictureKind, picture: Natural): CropPlan {
  const spec = PICTURE_SPECS[kind];
  const inner = 1 - 2 * WHOLE_PADDING;
  // Big enough that the picture is drawn at its own size where it can be.
  const fitWidth = Math.max(picture.width / inner, (picture.height / inner) * spec.ratio);
  const width = Math.max(1, Math.min(spec.width, Math.ceil(fitWidth)));
  const height = Math.max(1, Math.round(width / spec.ratio));
  const s = Math.min((width * inner) / picture.width, (height * inner) / picture.height);
  const dw = picture.width * s;
  const dh = picture.height * s;
  return { sx: 0, sy: 0, sw: picture.width, sh: picture.height, dx: (width - dw) / 2, dy: (height - dh) / 2, dw, dh, width, height, white: true };
}

/** PNG for a picture that may be see-through (PNG, WebP, GIF, SVG); else JPEG. */
export function outputType(file: File): "image/png" | "image/jpeg" {
  const type = (file.type || "").toLowerCase();
  if (/^image\/(png|webp|gif|svg\+xml|apng)$/.test(type)) return "image/png";
  if (!type && /\.(png|webp|gif|svg)$/i.test(file.name)) return "image/png";
  return "image/jpeg";
}

/** The cropped picture's file name: the original's, with the new extension. */
export function croppedName(file: File, type: string): string {
  const base = file.name.replace(/\.[^.]+$/, "") || "picture";
  return `${base}.${type === "image/png" ? "png" : "jpg"}`;
}

/**
 * Draws the plan on a canvas and returns it as a File; null when the
 * browser cannot (no canvas, or the encode failed).
 */
export async function drawCrop(source: CanvasImageSource, plan: CropPlan, file: File): Promise<File | null> {
  if (typeof document === "undefined") return null;
  const type = outputType(file);
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (plan.white || type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, plan.width, plan.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, plan.sx, plan.sy, plan.sw, plan.sh, plan.dx, plan.dy, plan.dw, plan.dh);
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, type, type === "image/jpeg" ? 0.9 : undefined);
    } catch {
      resolve(null);
    }
  });
  if (!blob) return null;
  return new File([blob], croppedName(file, type), { type });
}
