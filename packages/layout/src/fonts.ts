/** The ticket fonts: the same files the renderer embeds. */

export const TICKET_FONTS = {
  inter: { label: "Inter", note: "Clean sans — the default", stem: "inter", weights: [400, 500, 600, 700] },
  google_sans: { label: "Google Sans Flex", note: "Google events · the 24pt optical size", stem: "google-sans", weights: [400, 500, 600, 700] },
  mono: { label: "Roboto Mono", note: "Codes, numbers, seats", stem: "roboto-mono", weights: [400, 700] },
  dm_serif: { label: "DM Serif Display", note: "Invitations and galas · Latin only", stem: "dm-serif", weights: [400] },
  bebas: { label: "Bebas Neue", note: "Tall capitals for headlines · Latin only", stem: "bebas", weights: [400] },
} as const;
export type TicketFont = keyof typeof TICKET_FONTS;

/** Vertical metrics of each file. Baselines are placed with these on both sides. */
export const FONT_METRICS: Record<string, { unitsPerEm: number; ascent: number; descent: number }> = {
  "bebas-400": { unitsPerEm: 1000, ascent: 900, descent: -300 },
  "dm-serif-400": { unitsPerEm: 1000, ascent: 1036, descent: -335 },
  "google-sans-400": { unitsPerEm: 2000, ascent: 1932, descent: -572 },
  "google-sans-500": { unitsPerEm: 2000, ascent: 1932, descent: -572 },
  "google-sans-600": { unitsPerEm: 2000, ascent: 1932, descent: -572 },
  "google-sans-700": { unitsPerEm: 2000, ascent: 1932, descent: -572 },
  "inter-400": { unitsPerEm: 2048, ascent: 1984, descent: -494 },
  "inter-500": { unitsPerEm: 2048, ascent: 1984, descent: -494 },
  "inter-600": { unitsPerEm: 2048, ascent: 1984, descent: -494 },
  "inter-700": { unitsPerEm: 2048, ascent: 1984, descent: -494 },
  "roboto-mono-400": { unitsPerEm: 2048, ascent: 2146, descent: -555 },
  "roboto-mono-700": { unitsPerEm: 2048, ascent: 2146, descent: -555 },
};

/** The nearest weight a family actually has. */
export const fontWeightOf = (font: TicketFont, weight: number) =>
  (TICKET_FONTS[font].weights as readonly number[]).reduce(
    (best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best),
    TICKET_FONTS[font].weights[0] as number
  );

/** File stem for a family and weight: inter-600. */
export const fontFileOf = (font: TicketFont, weight: number) =>
  `${TICKET_FONTS[font].stem}-${fontWeightOf(font, weight)}`;

/** CSS family name the editor registers each font under. */
export const cssFontFamily = (font: TicketFont) => `MoaTicket-${font}`;

/**
 * OpenType features are switched off on both sides. Kerning and contextual
 * alternates move glyphs in a browser in ways the PDF does not; plain
 * advances match exactly.
 */
export const CSS_FONT_FEATURES = '"calt" 0, "case" 0, "liga" 0, "kern" 0';

/** Line advance before extra spacing, as a multiple of the font size. */
export const LINE_HEIGHT = 1.2;
