import type { TicketFont } from "../fonts";

/**
 * The fonts a v2 layout may name: every family in the backend's
 * `assets/doc-fonts/fonts.lock.json` (34 from the 35 designs) plus the three
 * v1 fonts the lock gains for layout v2. A face is a family, a weight and a
 * style that the lock has a file for; validation refuses any other.
 *
 * Generated from fonts.lock.json (digest c4c034816f9967e4) and the v1 font
 * table; the API's `fonts` list (GET …/layout) is the live answer and may be
 * passed to `validate` instead.
 */

export interface FontFamilyV2 {
  family: string;
  normal: readonly number[];
  italic: readonly number[];
}

export const DOC_FONTS: readonly FontFamilyV2[] = [
  { family: "Anton", normal: [400], italic: [] },
  { family: "Archivo", normal: [500, 600, 700, 800], italic: [] },
  { family: "Archivo Black", normal: [400], italic: [] },
  { family: "Barlow", normal: [500, 600, 700], italic: [] },
  { family: "Barlow Condensed", normal: [600, 800], italic: [] },
  { family: "Bebas Neue", normal: [400], italic: [] },
  { family: "Bricolage Grotesque", normal: [500, 700, 800], italic: [] },
  { family: "Caveat", normal: [600], italic: [] },
  { family: "Cinzel", normal: [500, 600, 700, 800], italic: [] },
  { family: "Cormorant Garamond", normal: [], italic: [500, 600] },
  { family: "DM Mono", normal: [500], italic: [] },
  { family: "DM Sans", normal: [500, 700], italic: [] },
  { family: "DM Serif Display", normal: [400], italic: [] },
  { family: "EB Garamond", normal: [400, 500], italic: [400] },
  { family: "Fraunces", normal: [500, 600], italic: [500, 700] },
  { family: "Fredoka", normal: [500, 600], italic: [] },
  { family: "Google Sans", normal: [400, 500, 600, 700], italic: [] },
  { family: "IBM Plex Mono", normal: [500, 600], italic: [] },
  { family: "IBM Plex Sans", normal: [400, 600], italic: [] },
  { family: "Instrument Serif", normal: [400], italic: [400] },
  { family: "Inter", normal: [400, 500, 600, 700], italic: [] },
  { family: "JetBrains Mono", normal: [500, 700], italic: [] },
  { family: "Josefin Sans", normal: [400, 500, 600, 700], italic: [] },
  { family: "Karla", normal: [400, 500, 700], italic: [] },
  { family: "Lato", normal: [400, 700], italic: [] },
  { family: "Marcellus", normal: [400], italic: [] },
  { family: "Nunito", normal: [500, 700], italic: [] },
  { family: "Orbitron", normal: [600, 800], italic: [] },
  { family: "Pinyon Script", normal: [400], italic: [] },
  { family: "Playfair Display", normal: [500, 700], italic: [] },
  { family: "Roboto Mono", normal: [400, 700], italic: [] },
  { family: "Saira", normal: [500, 700], italic: [] },
  { family: "Saira Condensed", normal: [600, 800], italic: [] },
  { family: "Share Tech Mono", normal: [400], italic: [] },
  { family: "Sora", normal: [400, 600, 800], italic: [] },
  { family: "Space Grotesk", normal: [500, 700], italic: [] },
  { family: "Space Mono", normal: [400, 700], italic: [] },
];

/** The v1 font keys and the CSS family each becomes in v2. */
export const V1_FONT_FAMILY: Record<TicketFont, string> = {
  inter: "Inter",
  google_sans: "Google Sans",
  mono: "Roboto Mono",
  dm_serif: "DM Serif Display",
  bebas: "Bebas Neue",
};

/** The API's shape (GET …/layout `fonts`, the backend's fonts_available()). */
export interface ApiFont {
  family: string;
  weights: readonly number[];
  styles: readonly string[];
  faces?: readonly { weight: number; style: string }[];
  /** The v1 key this family was, if any. */
  v1?: string;
}

/** The API's font list as ours. Without `faces`, every weight is taken to exist in every style listed. */
export const fontsFromApi = (fonts: readonly ApiFont[]): FontFamilyV2[] =>
  fonts.map((f) => {
    if (f.faces?.length) {
      const of = (s: string) => [...new Set(f.faces!.filter((x) => x.style === s).map((x) => x.weight))].sort((a, b) => a - b);
      return { family: f.family, normal: of("normal"), italic: of("italic") };
    }
    const w = [...f.weights].sort((a, b) => a - b);
    return { family: f.family, normal: f.styles.includes("normal") ? w : [], italic: f.styles.includes("italic") ? w : [] };
  });

/** Ours as the API gives them: faces sorted as the backend sorts (style, then weight: italic first). */
export const fontsAvailable = (fonts: readonly FontFamilyV2[] = DOC_FONTS): ApiFont[] => {
  const v1 = Object.fromEntries(Object.entries(V1_FONT_FAMILY).map(([k, v]) => [v, k]));
  return [...fonts]
    .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0))
    .map((f) => {
      const faces = facesOf(f);
      return {
        family: f.family,
        weights: [...new Set(faces.map((x) => x.weight))].sort((a, b) => a - b),
        styles: [...new Set(faces.map((x) => x.style))].sort(),
        faces,
        ...(v1[f.family] ? { v1: v1[f.family] } : {}),
      };
    });
};

/** A family by its exact CSS name (validation takes no other spelling; fromV1 maps the v1 keys). */
export const findFont = (family: string, fonts: readonly FontFamilyV2[] = DOC_FONTS): FontFamilyV2 | null => fonts.find((f) => f.family === family) ?? null;

export const hasFace = (font: FontFamilyV2, weight: number, style: string) => (style === "italic" ? font.italic : style === "normal" ? font.normal : []).includes(weight);

/** A family's faces as the backend lists them: sorted by (style, weight), so italic ones first. */
export const facesOf = (font: FontFamilyV2): { weight: number; style: "normal" | "italic" }[] => [
  ...font.italic.map((weight) => ({ weight, style: "italic" as const })),
  ...font.normal.map((weight) => ({ weight, style: "normal" as const })),
].sort((a, b) => (a.style === b.style ? a.weight - b.weight : a.style < b.style ? -1 : 1));

/**
 * The face a browser would pick for a weight the family lacks (CSS font
 * matching, simplified as the backend does: the same style if there is one,
 * then the closest weight, heavier on a tie above 400).
 */
export const nearestFace = (font: FontFamilyV2, weight: number, style: string): { weight: number; style: string } | null => {
  const faces = facesOf(font);
  if (!faces.length) return null;
  const same = faces.filter((f) => f.style === style);
  const pool = same.length ? same : faces;
  const key = (f: { weight: number }) => [Math.abs(f.weight - weight), weight > 400 ? -f.weight : f.weight] as const;
  return pool.reduce((best, f) => {
    const [a, b] = key(f);
    const [c, d] = key(best);
    return a < c || (a === c && b < d) ? f : best;
  });
};

const distance = (x: string, y: string) => {
  const a = x.toLowerCase();
  const b = y.toLowerCase();
  let dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(dp[j]! + 1, next[j - 1]! + 1, dp[j - 1]! + (a[i - 1] !== b[j - 1] ? 1 : 0));
    dp = next;
  }
  return dp[b.length]!;
};

/** The families most like a name that is not one, for the message: those starting with its first three letters first, then by edit distance; ties alphabetical. */
export const nearestFonts = (family: string, fonts: readonly FontFamilyV2[] = DOC_FONTS, n = 3): string[] => {
  const names = fonts.map((f) => f.family).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const key = family.replace(/^\s+|\s+$/g, "").toLowerCase();
  const starts = new Set(key ? names.filter((f) => f.toLowerCase().startsWith(key.slice(0, 3))) : []);
  return names
    .map((f, i) => ({ f, i, s: starts.has(f) ? 0 : 1, d: distance(key, f) }))
    .sort((a, b) => a.s - b.s || a.d - b.d || a.i - b.i)
    .slice(0, n)
    .map((x) => x.f);
};

/** The stylesheet with every face, served by the backend: `{apiBase}/static/doc-fonts/fonts.css`. */
export const fontsCssUrl = (apiBase: string, digest?: string) =>
  `${apiBase.replace(/\/+$/, "")}/static/doc-fonts/fonts.css${digest ? `?v=${encodeURIComponent(digest)}` : ""}`;
