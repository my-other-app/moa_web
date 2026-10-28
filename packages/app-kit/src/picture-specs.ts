/**
 * The one shape each club picture has, as agreed with the owner (Oct 2026)
 * and kept the same in the app, on the public site, here and in the API
 * (backend app/core/storage/shapes.py):
 *
 *   club logo, partner and organisation logos   1:1   1080 × 1080
 *   team and speaker photos                     1:1   1080 × 1080
 *   event poster                                4:5   1080 × 1350
 *   club banner (the API's `cover`)             3:1   1500 × 500
 *
 * Every picker says its shape in these words, and every place a picture is
 * shown draws it in its frame: a poster is never cropped (it shows whole on
 * a blurred copy of itself), a logo that is not square shows whole on a
 * white tile, a banner fills its 3:1 frame.
 */

export type PictureKind = "logo" | "icon" | "photo" | "poster" | "banner";

export interface PictureSpec {
  /** Width over height. */
  ratio: number;
  /** The size clubs are asked to upload, and the most a crop makes. */
  width: number;
  height: number;
  /** What the picker says, in plain words. */
  label: string;
  /** Whether the crop step offers to keep the whole picture on white (a wordmark). */
  whole: boolean;
}

export const PICTURE_SPECS: Record<PictureKind, PictureSpec> = {
  // The club's own logo.
  logo: { ratio: 1, width: 1080, height: 1080, label: "Square · 1080×1080 · like an Instagram profile picture", whole: true },
  // A partner's or an organisation's logo.
  icon: { ratio: 1, width: 1080, height: 1080, label: "Square · 1080×1080", whole: true },
  // A team member's or a speaker's photo: a face fills its square.
  photo: { ratio: 1, width: 1080, height: 1080, label: "Square · 1080×1080", whole: false },
  poster: { ratio: 4 / 5, width: 1080, height: 1350, label: "Portrait 4:5 · 1080×1350 · like an Instagram portrait post", whole: false },
  banner: { ratio: 3, width: 1500, height: 500, label: "Wide 3:1 · 1500×500 · like an X (Twitter) header", whole: false },
};

/** Said under a poster that is not 4:5. It still uploads. */
export const POSTER_SHAPE_NOTE = "This poster isn't 4:5, so it will show whole on a soft blurred background. For a full frame, use 1080×1350.";

/** How far a picture's shape is from `ratio`, as a fraction (0 = exactly it). */
export function shapeOff(width: number, height: number, ratio: number): number {
  if (!(width > 0) || !(height > 0) || !(ratio > 0)) return 0;
  return Math.abs(width / height / ratio - 1);
}

/** Within 1% of `ratio`: no crop step, and no note under a poster. */
export function hasShape(width: number, height: number, ratio: number, tolerance = 0.01): boolean {
  return shapeOff(width, height, ratio) <= tolerance;
}

/** A logo this close to square fills its tile; anything else shows whole, on white. */
export const SQUARE_ENOUGH = 0.03;

export function isSquareEnough(width: number, height: number): boolean {
  return hasShape(width, height, 1, SQUARE_ENOUGH);
}

type Size = "thumbnail" | "medium" | "large" | "original";

/**
 * The order to try a picture's sizes in for a frame `frameWidth` CSS px
 * wide: the smallest size whose box is at least twice the frame (sharp on
 * a 2x screen), then the larger ones, the original, and the smaller ones
 * last. Wider than every box: the original first.
 *
 * The boxes are what the API makes now (backend app/core/storage/shapes.py).
 * A picture uploaded before has smaller boxes (a poster's large was 800,
 * a logo's 800, a banner's 1200 and 1800), so on an old picture a frame
 * may get a file a little under twice its width until it is re-uploaded.
 */
function sizesFor(boxes: ReadonlyArray<readonly [Exclude<Size, "original">, number]>, frameWidth: number): Size[] {
  const at = boxes.findIndex(([, width]) => width >= 2 * frameWidth);
  if (at < 0) return ["original", ...boxes.map(([name]) => name).reverse()];
  const larger = boxes.slice(at).map(([name]) => name);
  const smaller = boxes.slice(0, at).map(([name]) => name).reverse();
  return [...larger, "original", ...smaller];
}

/** A poster's boxes: 240×300, 540×675, 1080×1350. */
const POSTER_BOXES = [["thumbnail", 240], ["medium", 540], ["large", 1080]] as const;
/** A logo's: 150, 500 and 1080 square. */
const LOGO_BOXES = [["thumbnail", 150], ["medium", 500], ["large", 1080]] as const;
/** A banner's: 1500×500 and twice that. It has no thumbnail. */
const BANNER_BOXES = [["medium", 1500], ["large", 3000]] as const;

/** thumbnail up to a 120-px frame, medium to 270, large to 540, then the original. */
export function posterSizes(frameWidth: number): Size[] {
  return sizesFor(POSTER_BOXES, frameWidth);
}

/** thumbnail up to a 75-px tile, medium to 250, large to 540, then the original. */
export function logoSizes(frameWidth: number): Size[] {
  return sizesFor(LOGO_BOXES, frameWidth);
}

/** medium up to a 750-px banner, large to 1500, then the original. Never a thumbnail. */
export function bannerSizes(frameWidth: number): Size[] {
  return sizesFor(BANNER_BOXES, frameWidth);
}
