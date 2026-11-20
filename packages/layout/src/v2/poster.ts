import type { ImageSourceV2, LayoutV2 } from "./schema";

/**
 * Posters: a guest's "I'm attending" picture, the fourth kind of document
 * (feature-register/posters/CONTRACT.md §1). A poster layout is an ordinary
 * v2 layout whose canvas is one of three formats, in pixels, and whose page
 * is the same at 96 dpi (one canvas pixel is one pixel of the PNG). A poster
 * design holds one layout per format. The backend's
 * `app/core/layout_v2/poster.py`.
 */

export const POSTER_FORMATS = ["square", "portrait", "story"] as const;
export type PosterFormat = (typeof POSTER_FORMATS)[number];

export interface PosterFormatSpec {
  key: PosterFormat;
  label: string;
  /** Where it is usually shared, in a few words. */
  use: string;
  width: number;
  height: number;
  widthMm: number;
  heightMm: number;
}

const MM_PER_PX = 25.4 / 96;
/** How far a saved page may be from the format's, in mm (an editor's rounding). */
export const POSTER_MM_SLACK = 0.05;

/** Python's round(x, 4) for these sizes (none of them falls on a half). */
const mm = (px: number) => Math.round(px * MM_PER_PX * 10_000) / 10_000;

const spec = (key: PosterFormat, label: string, use: string, width: number, height: number): PosterFormatSpec => ({
  key,
  label,
  use,
  width,
  height,
  widthMm: mm(width),
  heightMm: mm(height),
});

/** The formats, in the order they are offered: 1080 × 1080, 1080 × 1350, 1080 × 1920. */
export const POSTER_FORMAT_SPECS: Readonly<Record<PosterFormat, PosterFormatSpec>> = {
  square: spec("square", "Square", "Feeds and WhatsApp", 1080, 1080),
  portrait: spec("portrait", "Portrait", "Instagram and LinkedIn posts", 1080, 1350),
  story: spec("story", "Story", "Stories and status", 1080, 1920),
};

export const isPosterFormat = (v: unknown): v is PosterFormat => typeof v === "string" && (POSTER_FORMATS as readonly string[]).includes(v);

/** The format a layout is drawn in (its canvas and its page), or null when it is none of them. */
export const posterFormatOf = (layout: Pick<LayoutV2, "canvas" | "page">): PosterFormat | null => {
  const w = Math.round(layout.canvas.width);
  const h = Math.round(layout.canvas.height);
  for (const f of POSTER_FORMATS) {
    const s = POSTER_FORMAT_SPECS[f];
    if (w === s.width && h === s.height && Math.abs(layout.page.widthMm - s.widthMm) <= POSTER_MM_SLACK && Math.abs(layout.page.heightMm - s.heightMm) <= POSTER_MM_SLACK) return f;
  }
  return null;
};

/** The pictures a poster may show: the guest's photo, the club's logo, the event's poster, an upload. */
export const POSTER_IMAGE_SOURCES: readonly ImageSourceV2[] = ["guest_photo", "org_logo", "event_icon", "upload"];

/** An empty poster of a format: its canvas and page, a white background, no layers. */
export const blankPoster = (format: PosterFormat): LayoutV2 => {
  const s = POSTER_FORMAT_SPECS[format];
  return {
    version: 2,
    page: { widthMm: s.widthMm, heightMm: s.heightMm },
    canvas: { width: s.width, height: s.height, background: { type: "solid", color: "#FFFFFF" } },
    vars: { accent: null },
    layers: [],
    starter: null,
  };
};

/**
 * Where the guest's photo goes in a poster: the largest image layer showing
 * the guest's photo that is not hidden (the contract's "frame"), or null.
 */
export const posterFrameOf = (layout: Pick<LayoutV2, "layers">) => {
  let best: LayoutV2["layers"][number] | null = null;
  for (const l of layout.layers) {
    if (l.kind !== "image" || l.source !== "guest_photo" || l.hidden) continue;
    if (!best || l.width * l.height > best.width * best.height) best = l;
  }
  return best;
};
