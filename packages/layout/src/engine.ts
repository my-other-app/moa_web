import { FONT_METRICS, LINE_HEIGHT, TICKET_FONTS } from "./fonts";
import {
  contrastRatio,
  luminance,
  minQrSize,
  type PageSpec,
  TICKET_PAGE,
  type TextLayer,
  type TicketCanvas,
  type TicketLayer,
  ticketArea,
} from "./ticket-layout";
import { parseTicketTemplate } from "./ticket-tokens";

/**
 * Laying text out, and judging a design -- shared with the renderer.
 *
 * `layoutText` is the same algorithm the backend runs, so a line that wraps
 * on screen wraps on paper. `layoutProblems` is what makes a design wrong.
 */

/** Width of a string at a size, without letter spacing. The editor measures in the browser, the renderer with the embedded font. */
export type MeasureText = (text: string, size: number) => number;

export interface LaidOutText {
  size: number;
  letterSpacing: number;
  lines: { text: string; width: number }[];
  /** Distance from the layer's top to each line's baseline. */
  baselines: number[];
  height: number;
  /** Text was cut short even after shrinking. */
  truncated: boolean;
}

const MIN_SCALE = 0.5;

export const layoutText = (
  text: string,
  opts: { width: number; size: number; maxLines: number; lineSpacing: number; letterSpacing: number; fit: "shrink" | "truncate"; fontFile: string },
  measure: MeasureText
): LaidOutText => {
  const metrics = FONT_METRICS[opts.fontFile] ?? { unitsPerEm: 1000, ascent: 950, descent: -250 };
  const widthAt = (s: string, size: number, ls: number) => measure(s, size) + ls * [...s].length;

  const wrap = (size: number, ls: number) => {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(/ +/);
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (widthAt(candidate, size, ls) <= opts.width || !current) {
          if (!current && widthAt(word, size, ls) > opts.width) {
            let chunk = "";
            for (const ch of [...word]) {
              if (chunk && widthAt(chunk + ch, size, ls) > opts.width) {
                lines.push(chunk);
                chunk = ch;
              } else chunk += ch;
            }
            current = chunk;
          } else current = candidate;
        } else {
          lines.push(current);
          current = word;
          if (widthAt(word, size, ls) > opts.width) {
            let chunk = "";
            for (const ch of [...word]) {
              if (chunk && widthAt(chunk + ch, size, ls) > opts.width) {
                lines.push(chunk);
                chunk = ch;
              } else chunk += ch;
            }
            current = chunk;
          }
        }
      }
      lines.push(current);
    }
    return lines;
  };

  let size = opts.size;
  let ls = opts.letterSpacing;
  let lines = text ? wrap(size, ls) : [];
  if (opts.fit === "shrink") {
    while (lines.length > opts.maxLines && size > opts.size * MIN_SCALE) {
      size = Math.max(opts.size * MIN_SCALE, size * 0.95);
      ls = opts.letterSpacing * (size / opts.size);
      lines = wrap(size, ls);
    }
  }
  let truncated = false;
  if (lines.length > opts.maxLines) {
    truncated = true;
    lines = lines.slice(0, opts.maxLines);
    let lastLine = lines[lines.length - 1]!;
    while (lastLine && widthAt(`${lastLine}…`, size, ls) > opts.width) lastLine = [...lastLine].slice(0, -1).join("");
    lines[lines.length - 1] = `${lastLine.trimEnd()}…`;
  }
  const ascent = (metrics.ascent / metrics.unitsPerEm) * size;
  const descent = (-metrics.descent / metrics.unitsPerEm) * size;
  const advance = size * LINE_HEIGHT + opts.lineSpacing;
  const baselines = lines.map((_, i) => ascent + i * advance);
  return {
    size,
    letterSpacing: ls,
    lines: lines.map((l) => ({ text: l, width: widthAt(l, size, ls) })),
    baselines,
    height: lines.length ? ascent + descent + (lines.length - 1) * advance : ascent + descent,
    truncated,
  };
};

/** Where a line starts, given its width and the layer's alignment. */
export const lineX = (layer: Pick<TextLayer, "x" | "width" | "align">, lineWidth: number) =>
  layer.align === "center" ? layer.x + (layer.width - lineWidth) / 2 : layer.align === "right" ? layer.x + layer.width - lineWidth : layer.x;

// ─── Validation ─────────────────────────────────────────────────────────

export interface LayoutProblem {
  path: (string | number)[];
  message: string;
}

/** Problems that make a ticket wrong or unscannable. Each carries the path of the field to fix. */
export const layoutProblems = (
  canvas: TicketCanvas,
  layers: TicketLayer[],
  page: PageSpec = TICKET_PAGE,
  opts: { qrRequired?: boolean } = {}
): LayoutProblem[] => {
  const out: LayoutProblem[] = [];
  const area = ticketArea(canvas);
  if (page.heightMm) {
    const want = page.widthMm / page.heightMm;
    const have = area.width / area.height;
    if (Math.abs(want - have) / want > 0.015)
      out.push({
        path: ["canvas", "area"],
        message: `The ${canvas.area ? "ticket area" : "canvas"} is ${Math.round(area.width)} × ${Math.round(area.height)}, which is not the shape of a ${page.widthMm} × ${page.heightMm} mm page. Resize it, or draw a frame of the right shape.`,
      });
  }
  if (area.x < 0 || area.y < 0 || area.x + area.width > canvas.width + 0.5 || area.y + area.height > canvas.height + 0.5)
    out.push({ path: ["canvas", "area"], message: "The ticket area must sit inside the template." });
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const offTicket = (l: { x: number; y: number }, w: number, h: number) => l.x >= right || l.y >= bottom || l.x + w <= area.x || l.y + h <= area.y;
  const qrs = layers.flatMap((l, i) => (l.kind === "qr" ? [{ l, i }] : []));
  if (qrs.length === 0 && opts.qrRequired !== false) out.push({ path: ["layers"], message: "Every ticket needs its QR code — it is what the gate scans." });
  if (qrs.length > 1) out.push({ path: ["layers", qrs[1]!.i], message: "A ticket has exactly one QR code." });
  const ids = new Set<string>();
  layers.forEach((l, i) => {
    if (ids.has(l.id)) out.push({ path: ["layers", i, "id"], message: `Two layers share the id "${l.id}".` });
    ids.add(l.id);
    const at = (field: string, message: string) => out.push({ path: ["layers", i, field], message: `${l.name}: ${message}` });
    switch (l.kind) {
      case "qr": {
        const min = minQrSize(canvas, page);
        if (l.hidden) at("hidden", "the QR code cannot be hidden.");
        if (l.size < min) at("size", `at least ${min} px on this canvas, or phones struggle to read it.`);
        if (l.x < area.x || l.y < area.y || l.x + l.size > right + 0.5 || l.y + l.size > bottom + 0.5) at("x", "the whole QR code must sit inside the ticket area.");
        if (l.light !== "transparent") {
          if (contrastRatio(l.dark, l.light) < 4) at("dark", "the two QR colours are too close for a scanner to tell apart.");
          else if (luminance(l.dark) > luminance(l.light)) at("dark", "the dark modules must be darker than the background — inverted codes do not scan everywhere.");
        }
        break;
      }
      case "text": {
        for (const e of parseTicketTemplate(l.text).errors) at("text", e);
        if (!(TICKET_FONTS[l.font].weights as readonly number[]).includes(l.weight))
          at("weight", `${TICKET_FONTS[l.font].label} has weights ${TICKET_FONTS[l.font].weights.join(", ")}.`);
        if (offTicket(l, l.width, l.size * LINE_HEIGHT)) at("x", "this text sits entirely outside the ticket area.");
        break;
      }
      case "image":
        if (l.source === "upload" && !l.imageKey && !l.hidden) at("imageKey", "choose an image to show.");
        if (l.source === "guest_photo" && l.preprinted) at("preprinted", "a guest photo cannot be on the card stock.");
        if (offTicket(l, l.width, l.height)) at("x", "this image sits entirely outside the ticket area.");
        break;
      case "shape":
        if (!l.fill && !(l.stroke && l.strokeWidth > 0)) at("fill", "a shape needs a fill or an outline.");
        if (offTicket(l, l.width, l.height)) at("x", "this shape sits entirely outside the ticket area.");
        break;
    }
  });
  return out;
};

let seq = 0;
export const newLayerId = (kind: string) => `${kind}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
