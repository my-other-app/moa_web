import { FONT_METRICS, LINE_HEIGHT, TICKET_FONTS } from "./fonts";
import {
  type AgendaLayer,
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

// ─── Agenda layout (shared with the renderer) ───────────────────────────

export interface AgendaEntry {
  startsAt: string | Date;
  endsAt: string | Date | null;
  title: string;
  speaker: string | null;
  location: string | null;
}

export type AgendaPieceRole = "time" | "title" | "detail" | "day" | "more";

/** One string to draw: the caller maps the role to a font and a colour. */
export interface AgendaPiece {
  role: AgendaPieceRole;
  text: string;
  x: number;
  /** Baseline, from the layer's top. */
  y: number;
  size: number;
  width: number;
}

export interface LaidOutAgenda {
  pieces: AgendaPiece[];
  /** Sessions that did not fit even after shrinking. */
  dropped: number;
  /** Title size after shrinking. */
  size: number;
  height: number;
}

export interface AgendaMeasure {
  title: MeasureText;
  time: MeasureText;
  detail: MeasureText;
}

/** The weights the agenda draws its three roles in, for a given family. */
export const agendaWeights = (font: keyof typeof TICKET_FONTS) => {
  const w = TICKET_FONTS[font].weights as readonly number[];
  return { title: w.includes(600) ? 600 : w.includes(700) ? 700 : w[0]!, detail: w.includes(400) ? 400 : w[0]! };
};

const partsOf = (d: Date, tz: string, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts })
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;

/** A time as the event prints it: 09:00, or 9:00 AM when the event asks for it. The backend writes the same. */
export const formatEventTime = (d: Date, tz: string, hour12 = false) => {
  const p = partsOf(d, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const h = Number(p.hour) % 24;
  if (hour12) return `${h % 12 || 12}:${p.minute} ${h < 12 ? "AM" : "PM"}`;
  return `${String(h).padStart(2, "0")}:${p.minute}`;
};
/** A day heading as en-GB writes it: Saturday 11 October. */
export const formatAgendaDay = (d: Date, tz: string) => {
  const p = partsOf(d, tz, { weekday: "long", day: "numeric", month: "long" });
  return `${p.weekday} ${p.day} ${p.month}`;
};
/** The calendar day, in the event's zone, that two sessions are compared on. */
export const dayKey = (d: Date, tz: string) => {
  const p = partsOf(d, tz, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
};

/**
 * Lays the run of show into the layer's box. Left: time in a column, title
 * beside it, detail under the title. Right: the mirror. Centre: time, title
 * and detail stacked. Columns fill top to bottom, then left to right. If the
 * whole thing will not fit, the type shrinks (to half size) before sessions
 * are dropped, and a last line says how many were.
 */
export const layoutAgenda = (layer: AgendaLayer, entries: AgendaEntry[], tz: string, measure: AgendaMeasure, hour12?: boolean): LaidOutAgenda => {
  const weights = agendaWeights(layer.font);
  const titleFile = `${TICKET_FONTS[layer.font].stem}-${weights.title}`;
  const detailFile = `${TICKET_FONTS[layer.font].stem}-${weights.detail}`;
  const metrics = FONT_METRICS[titleFile] ?? { unitsPerEm: 1000, ascent: 950, descent: -250 };
  const colGap = layer.size * 1.5;
  const colWidth = (layer.width - colGap * (layer.columns - 1)) / layer.columns;
  const multiDay = layer.showDayHeadings && new Set(entries.map((e) => dayKey(new Date(e.startsAt), tz))).size > 1;

  const timeOf = (e: AgendaEntry) => `${formatEventTime(new Date(e.startsAt), tz, hour12)}${e.endsAt ? ` – ${formatEventTime(new Date(e.endsAt), tz, hour12)}` : ""}`;

  type Block = { role: AgendaPieceRole; lines: { text: string; width: number }[]; size: number; advance: number; ascent: number; indent: number; lineHeightPx: number };

  /** Every session as a stack of text blocks at a title size; heights follow from that. */
  const build = (size: number) => {
    const timeSize = size * 0.78;
    const detailSize = size * 0.72;
    const daySize = size * 0.7;
    const asc = (sz: number) => (metrics.ascent / metrics.unitsPerEm) * sz;
    const desc = (sz: number) => (-metrics.descent / metrics.unitsPerEm) * sz;
    // The time column is as wide as the widest time it holds, so start-only times do not leave a gap.
    const timeW = Math.max(measure.time("00:00", timeSize), ...entries.map((e) => measure.time(timeOf(e), timeSize)));
    const gutter = size * 0.9;
    const titleWidth = layer.align === "center" ? colWidth : Math.max(20, colWidth - timeW - gutter);
    const items: { blocks: Block[]; height: number }[] = [];
    let lastDay: string | null = null;
    for (const e of entries) {
      const start = new Date(e.startsAt);
      const key = dayKey(start, tz);
      if (multiDay && key !== lastDay) {
        lastDay = key;
        const text = formatAgendaDay(start, tz).toUpperCase();
        items.push({
          blocks: [{ role: "day", lines: [{ text, width: measure.time(text, daySize) }], size: daySize, advance: daySize * LINE_HEIGHT, ascent: asc(daySize), indent: 0, lineHeightPx: daySize * LINE_HEIGHT }],
          height: daySize * LINE_HEIGHT + layer.rowGap * 0.5,
        });
      }
      const time = timeOf(e);
      const title = layoutText(e.title, { width: titleWidth, size, maxLines: 2, lineSpacing: 0, letterSpacing: 0, fit: "shrink", fontFile: titleFile }, measure.title);
      const detailText = [layer.showSpeaker ? e.speaker : null, layer.showLocation ? e.location : null].filter(Boolean).join(" · ");
      const detail = detailText ? layoutText(detailText, { width: titleWidth, size: detailSize, maxLines: 1, lineSpacing: 0, letterSpacing: 0, fit: "truncate", fontFile: detailFile }, measure.detail) : null;
      // Left and right both keep a time column; centre stacks the time above the title instead.
      const indent = layer.align === "center" ? 0 : timeW + gutter;
      const blocks: Block[] = [];
      let h = 0;
      if (layer.align === "center") {
        blocks.push({ role: "time", lines: [{ text: time, width: measure.time(time, timeSize) }], size: timeSize, advance: timeSize * LINE_HEIGHT, ascent: asc(timeSize), indent: 0, lineHeightPx: timeSize * LINE_HEIGHT });
        h += timeSize * LINE_HEIGHT;
      }
      blocks.push({ role: "title", lines: title.lines, size: title.size, advance: title.size * LINE_HEIGHT, ascent: asc(title.size), indent, lineHeightPx: title.size * LINE_HEIGHT });
      h += title.lines.length * title.size * LINE_HEIGHT;
      if (detail) {
        blocks.push({ role: "detail", lines: detail.lines, size: detail.size, advance: detail.size * LINE_HEIGHT, ascent: asc(detail.size), indent, lineHeightPx: detail.size * LINE_HEIGHT });
        h += detail.size * LINE_HEIGHT;
      }
      if (layer.align !== "center") {
        // The time sits on the title's first line, in its own column.
        blocks.unshift({ role: "time", lines: [{ text: time, width: measure.time(time, timeSize) }], size: timeSize, advance: 0, ascent: asc(title.size), indent: 0, lineHeightPx: 0 });
      }
      items.push({ blocks, height: h + desc(size) * 0.3 + layer.rowGap });
    }
    return items;
  };

  const fits = (items: ReturnType<typeof build>) => items.reduce((n, it) => n + it.height, 0) <= layer.height * layer.columns + layer.rowGap;

  let size = layer.size;
  let items = build(size);
  while (!fits(items) && size > layer.size * MIN_SCALE) {
    size = Math.max(layer.size * MIN_SCALE, size * 0.92);
    items = build(size);
  }

  // Fill columns; anything past the last column is dropped and counted. When
  // everything fits, the columns are balanced, so a short programme does not
  // sit in the first column with the rest of the page empty.
  const moreLine = size * 0.72 * LINE_HEIGHT;
  const isDay = (i: number) => items[i]?.blocks[0]?.role === "day";
  const place = (target: number) => {
    const pieces: AgendaPiece[] = [];
    let col = 0;
    let y = 0;
    let tallest = 0;
    let dropped = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      const remaining = items.length - i;
      const needMore = remaining > 1 ? moreLine : 0;
      // A day heading never ends a column: it moves with the session under it.
      const need = isDay(i) && items[i + 1] ? it.height + items[i + 1]!.height : it.height;
      const overflows = y + need - layer.rowGap > layer.height + 0.5;
      const balanced = y > 0 && col < layer.columns - 1 && y + need / 2 > target;
      if (overflows || balanced) {
        col += 1;
        y = 0;
        if (col >= layer.columns) {
          dropped = remaining;
          break;
        }
      }
      // The last thing in the last column must leave room for the "+N more" line if anything follows.
      if (col === layer.columns - 1 && y + it.height - layer.rowGap + needMore > layer.height + 0.5 && remaining > 1) {
        dropped = remaining;
        break;
      }
      const colX = col * (colWidth + colGap);
      let cursor = y;
      for (const b of it.blocks) {
        if (b.role === "time" && layer.align !== "center") {
          // Beside the title's first line: right-aligned mirrors the column to the far side.
          const w = b.lines[0]!.width;
          const x = layer.align === "right" ? colX + colWidth - w : colX;
          pieces.push({ role: "time", text: b.lines[0]!.text, x, y: cursor + b.ascent, size: b.size, width: w });
          continue;
        }
        b.lines.forEach((line, li) => {
          const x = layer.align === "center" ? colX + (colWidth - line.width) / 2 : layer.align === "right" ? colX + colWidth - b.indent - line.width : colX + b.indent;
          pieces.push({ role: b.role, text: line.text, x, y: cursor + li * b.advance + b.ascent, size: b.size, width: line.width });
        });
        cursor += b.lines.length * b.lineHeightPx;
      }
      y += it.height;
      tallest = Math.max(tallest, y - layer.rowGap);
    }
    if (dropped > 0) {
      const text = `+ ${dropped} more session${dropped === 1 ? "" : "s"}`;
      const sz = size * 0.72;
      const w = measure.detail(text, sz);
      const colX = Math.min(col, layer.columns - 1) * (colWidth + colGap);
      const x = layer.align === "center" ? colX + (colWidth - w) / 2 : layer.align === "right" ? colX + colWidth - w : colX;
      pieces.push({ role: "more", text, x, y: Math.min(y, layer.height - sz * 0.3) + (metrics.ascent / metrics.unitsPerEm) * sz, size: sz, width: w });
    }
    return { pieces, dropped, height: Math.min(layer.height, tallest) };
  };

  const total = items.reduce((n, it) => n + it.height, 0);
  let placed = place(Infinity);
  if (layer.columns > 1 && placed.dropped === 0) {
    const target = Math.max(total / layer.columns, ...items.map((it) => it.height));
    const even = place(target);
    // Balancing can, rarely, push the last session past the last column; then the plain fill stands.
    if (even.dropped === 0) placed = even;
  }
  return { pieces: placed.pieces, dropped: placed.dropped, size, height: placed.height };
};

/** The instant that reads as the given wall-clock time in a timezone, on the day of `base`. */
export const atWallClock = (base: Date, tz: string, hour: number, minute: number) => {
  const p = partsOf(base, tz, { year: "numeric", month: "2-digit", day: "2-digit" });
  const guess = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, minute);
  const seen = partsOf(new Date(guess), tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const h = Number(seen.hour) % 24;
  const m = Number(seen.minute);
  // The guess was UTC; shift it by however far the zone's reading is from the wall clock wanted.
  return new Date(guess - ((h - hour) * 60 + (m - minute)) * 60_000);
};

/** Sessions for the editor when the event has none yet, on the event's day in its own timezone. */
export const sampleAgenda = (startsAt: string | Date, tz = "UTC"): AgendaEntry[] => {
  const base = new Date(startsAt);
  const at = (h: number, m = 0) => atWallClock(base, tz, h, m);
  return [
    { startsAt: at(9, 0), endsAt: at(9, 30), title: "Registration and coffee", speaker: null, location: "Foyer" },
    { startsAt: at(9, 30), endsAt: at(10, 15), title: "Opening keynote — the year ahead", speaker: "Ananya Iyer", location: "Main hall" },
    { startsAt: at(10, 30), endsAt: at(11, 30), title: "Workshop: designing for the door", speaker: "Arjun Sharma", location: "Studio 2" },
    { startsAt: at(12, 0), endsAt: at(13, 0), title: "Lunch", speaker: null, location: "Terrace" },
    { startsAt: at(13, 0), endsAt: at(14, 0), title: "Panel: what volunteers see", speaker: "Kavya Reddy, Imran Khan", location: "Main hall" },
    { startsAt: at(14, 15), endsAt: at(15, 0), title: "Closing remarks and certificates", speaker: "Ananya Iyer", location: "Main hall" },
  ];
};

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
  const agendas = layers.flatMap((l, i) => (l.kind === "agenda" ? [i] : []));
  if (agendas.length > 1) out.push({ path: ["layers", agendas[1]!], message: "A design lists the run of show once." });
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
      case "agenda":
        if (offTicket(l, l.width, l.height)) at("x", "this agenda sits entirely outside the page.");
        break;
    }
  });
  return out;
};

let seq = 0;
export const newLayerId = (kind: string) => `${kind}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
