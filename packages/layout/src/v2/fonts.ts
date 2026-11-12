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

/** The API's shape (GET …/layout `fonts`): {family, weights, styles}. */
export interface ApiFont {
  family: string;
  weights: readonly number[];
  styles: readonly string[];
  /** Optional per-style weights, when the API gives them. */
  faces?: readonly { weight: number; style: string }[];
}

/** The API's font list as ours. Without `faces`, every weight is taken to exist in every style it lists. */
export const fontsFromApi = (fonts: readonly ApiFont[]): FontFamilyV2[] =>
  fonts.map((f) => {
    if (f.faces?.length) {
      const of = (s: string) => [...new Set(f.faces!.filter((x) => x.style === s).map((x) => x.weight))].sort((a, b) => a - b);
      return { family: f.family, normal: of("normal"), italic: of("italic") };
    }
    const w = [...f.weights].sort((a, b) => a - b);
    return { family: f.family, normal: f.styles.includes("normal") ? w : [], italic: f.styles.includes("italic") ? w : [] };
  });

/** A family by its CSS name, or by a v1 key ("inter", "bebas", …). */
export const findFont = (family: string, fonts: readonly FontFamilyV2[] = DOC_FONTS): FontFamilyV2 | null => {
  const name = (V1_FONT_FAMILY as Record<string, string>)[family] ?? family;
  return fonts.find((f) => f.family === name) ?? null;
};

/** The CSS family a layout's `family` draws in: v1 keys mapped, anything else as written. */
export const cssFamilyOf = (family: string) => (V1_FONT_FAMILY as Record<string, string>)[family] ?? family;

export const hasFace = (font: FontFamilyV2, weight: number, style: "normal" | "italic") => (style === "italic" ? font.italic : font.normal).includes(weight);

const distance = (a: string, b: string) => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length]![b.length]!;
};

/**
 * The three families nearest a name, for "did you mean": by edit distance
 * of the lower-cased names, a family that starts with or contains what was
 * typed counting as nearest; ties in the list's (alphabetical) order.
 */
export const nearestFonts = (family: string, fonts: readonly FontFamilyV2[] = DOC_FONTS, n = 3): string[] => {
  const q = family.trim().toLowerCase();
  return fonts
    .map((f, i) => {
      const name = f.family.toLowerCase();
      const d = q && name.includes(q) ? 0 : distance(q, name);
      return { family: f.family, d, i };
    })
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, n)
    .map((x) => x.family);
};

/** The faces of a family, as words: "400, 700, 400 italic". */
export const facesOf = (font: FontFamilyV2) => [...font.normal.map(String), ...font.italic.map((w) => `${w} italic`)].join(", ");

/** The stylesheet with every face, served by the backend: `{apiBase}/static/doc-fonts/fonts.css`. */
export const fontsCssUrl = (apiBase: string, digest?: string) =>
  `${apiBase.replace(/\/+$/, "")}/static/doc-fonts/fonts.css${digest ? `?v=${encodeURIComponent(digest)}` : ""}`;
