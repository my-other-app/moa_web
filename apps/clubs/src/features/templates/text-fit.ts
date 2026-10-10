/**
 * Shrinking text to fit its box -- the editor's copy of the renderer's rule.
 *
 * This is a deliberate port of `app/api/templates_fit.py` in the backend, not
 * an independent implementation. The preview and the PDF have to shrink by the
 * same amount or the editor lies: a club sets a 40px name field, the preview
 * shows 40px, and the certificate arrives at 28px.
 *
 * The browser could measure text properly with `canvas.measureText`, which is
 * why this looks like the wrong approach. It is the right one: the renderer is
 * wkhtmltopdf and has no metrics available, so it estimates. Measuring
 * accurately here would make the preview disagree with the output.
 *
 * Both sides are pinned by the same table of cases -- `text-fit.test.ts` here
 * and `tests/test_text_fitting.py` there. Tuning one without the other fails
 * that side's tests, which is the only thing keeping them honest.
 */

const NARROW = new Set("iljtfIr.,;:'\"`!|()[]{}/\\ ");
const WIDE = new Set("mwMW@%&");
const UPPER = new Set("ABCDEFGHJKLNOPQRSTUVXYZ");
const DIGITS = new Set("0123456789");

const W_NARROW = 0.3;
const W_WIDE = 0.92;
const W_UPPER = 0.67;
const W_DIGIT = 0.56;
const W_DEFAULT = 0.52;

const BOLD_FACTOR = 1.06;

const FLOOR_RATIO = 0.45;
const ABSOLUTE_FLOOR = 8;

/** Approximate rendered width of `text`, in pixels. */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  { bold = false, letterSpacing = 0 }: { bold?: boolean; letterSpacing?: number } = {}
): number {
  let units = 0;
  for (const char of text) {
    if (NARROW.has(char)) units += W_NARROW;
    else if (WIDE.has(char)) units += W_WIDE;
    else if (UPPER.has(char)) units += W_UPPER;
    else if (DIGITS.has(char)) units += W_DIGIT;
    else units += W_DEFAULT;
  }

  let width = units * fontSize;
  if (bold) width *= BOLD_FACTOR;
  // Spacing sits between characters, so one fewer gap than characters.
  if (letterSpacing && text.length > 1) width += letterSpacing * (text.length - 1);
  return width;
}

/**
 * How many lines `text` wraps onto in a box this wide.
 *
 * Greedy word wrap. A single word wider than the box counts as one line
 * rather than being broken, because the renderer does not break words either.
 */
export function linesNeeded(
  text: string,
  boxWidth: number,
  fontSize: number,
  { bold = false, letterSpacing = 0 }: { bold?: boolean; letterSpacing?: number } = {}
): number {
  if (boxWidth <= 0) return 1;

  const width = (value: string) =>
    estimateTextWidth(value, fontSize, { bold, letterSpacing });

  let lines = 1;
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = `${current} ${word}`.trim();
    if (current && width(candidate) > boxWidth) {
      lines += 1;
      current = word;
    } else {
      current = candidate;
    }
  }
  return lines;
}

/**
 * The largest size at or below `fontSize` where `text` fits.
 *
 * Returns `fontSize` unchanged when the text already fits, when there is no
 * box to fit it into, or when there is no text.
 */
export function fitFontSize(
  text: string,
  {
    fontSize,
    boxWidth,
    maxLines = 1,
    bold = false,
    letterSpacing = 0,
  }: {
    fontSize: number;
    boxWidth: number | null | undefined;
    maxLines?: number;
    bold?: boolean;
    letterSpacing?: number;
  }
): number {
  if (!text || !text.trim()) return fontSize;
  if (!boxWidth || boxWidth <= 0) return fontSize;

  const opts = { bold, letterSpacing };
  if (linesNeeded(text, boxWidth, fontSize, opts) <= maxLines) return fontSize;

  const floor = Math.max(ABSOLUTE_FLOOR, Math.ceil(fontSize * FLOOR_RATIO));
  for (let candidate = fontSize - 1; candidate >= floor; candidate -= 1) {
    if (linesNeeded(text, boxWidth, candidate, opts) <= maxLines) return candidate;
  }
  return floor;
}
