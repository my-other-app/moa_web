import { newLayer, type Canvas, type Layer } from "./layers";

/**
 * Canvas sizes and starting layouts.
 *
 * A club that has artwork uploads it and the canvas takes the image's size.
 * A club that has none had nothing to start from -- a blank area at whatever
 * size the renderer happened to use, which is the hardest possible place to
 * begin. These are the two halves of an answer to that: a size to work at,
 * and a layout already on it.
 */

export interface CanvasPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  kinds: ReadonlyArray<"ticket" | "certificate">;
}

/**
 * Pixel sizes, not millimetres, because every coordinate in a design is an
 * artwork pixel and the renderer scales against this. The print sizes are
 * their paper dimensions at 150dpi, which is what wkhtmltopdf renders at.
 */
export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: "ticket", label: "Ticket · 1560 × 690", width: 1560, height: 690, kinds: ["ticket"] },
  { id: "ticket-tall", label: "Ticket, upright · 690 × 1560", width: 690, height: 1560, kinds: ["ticket"] },
  { id: "badge", label: "Badge · 1004 × 1594", width: 1004, height: 1594, kinds: ["ticket"] },
  { id: "a4-landscape", label: "A4, landscape · 1754 × 1240", width: 1754, height: 1240, kinds: ["certificate", "ticket"] },
  { id: "a4-portrait", label: "A4, upright · 1240 × 1754", width: 1240, height: 1754, kinds: ["certificate", "ticket"] },
  { id: "square", label: "Square · 1080 × 1080", width: 1080, height: 1080, kinds: ["ticket", "certificate"] },
] as const;

export function presetsFor(kind: "ticket" | "certificate"): CanvasPreset[] {
  return CANVAS_PRESETS.filter((p) => p.kinds.includes(kind));
}

/** The preset matching this canvas exactly, if any -- otherwise it is custom. */
export function matchPreset(canvas: Canvas): CanvasPreset | null {
  return (
    CANVAS_PRESETS.find(
      (p) => p.width === canvas.width && p.height === canvas.height
    ) ?? null
  );
}

export interface StarterLayout {
  id: string;
  label: string;
  description: string;
  kinds: ReadonlyArray<"ticket" | "certificate">;
  build: (canvas: Canvas) => Layer[];
}

/**
 * Positions are fractions of the canvas, so a layout lands sensibly whatever
 * size it is dropped onto -- a starting point that only worked at one size
 * would be worse than none.
 */
function at(canvas: Canvas, fx: number, fy: number) {
  return {
    x: Math.round((canvas.width || 1560) * fx),
    y: Math.round((canvas.height || 690) * fy),
  };
}

function text(
  canvas: Canvas,
  opts: {
    name: string;
    text: string;
    fx: number;
    fy: number;
    fw: number;
    size: number;
    weight?: number;
    color?: string;
    align?: Layer["align"];
    letter?: number;
  }
): Layer {
  const base = newLayer("text", canvas);
  return {
    ...base,
    ...at(canvas, opts.fx, opts.fy),
    name: opts.name,
    text: opts.text,
    width: Math.round((canvas.width || 1560) * opts.fw),
    font_size: opts.size,
    weight: opts.weight ?? 400,
    bold: (opts.weight ?? 400) >= 600,
    color: opts.color ?? "#ffffff",
    align: opts.align ?? "left",
    letter_spacing: opts.letter ?? 0,
  };
}

export const STARTER_LAYOUTS: readonly StarterLayout[] = [
  {
    id: "classic",
    label: "Classic",
    description: "Name, event and date down the left, QR on the right.",
    kinds: ["ticket"],
    build: (canvas) => [
      text(canvas, { name: "Guest name", text: "{{name}}", fx: 0.06, fy: 0.18, fw: 0.5, size: Math.round((canvas.height || 690) * 0.09), weight: 700 }),
      text(canvas, { name: "Event", text: "{{event_name}}", fx: 0.06, fy: 0.36, fw: 0.5, size: Math.round((canvas.height || 690) * 0.05) }),
      text(canvas, { name: "Date & venue", text: "{{event_date}} · {{venue}}", fx: 0.06, fy: 0.5, fw: 0.5, size: Math.round((canvas.height || 690) * 0.04), color: "#cccccc" }),
      text(canvas, { name: "Ticket code", text: "{{ticket_code}}", fx: 0.06, fy: 0.75, fw: 0.4, size: Math.round((canvas.height || 690) * 0.045), weight: 700, letter: 2 }),
      {
        ...newLayer("qr", canvas),
        ...at(canvas, 0.74, 0.2),
        name: "QR code",
        width: Math.round((canvas.height || 690) * 0.42),
      },
    ],
  },
  {
    id: "stub",
    label: "Stub",
    description: "A tear-off band down one side, with the code on it.",
    kinds: ["ticket"],
    build: (canvas) => [
      {
        ...newLayer("shape", canvas),
        ...at(canvas, 0.68, 0),
        name: "Stub divider",
        width: Math.max(2, Math.round((canvas.width || 1560) * 0.004)),
        height: canvas.height || 690,
        fill: "#ffffff",
        opacity: 35,
      },
      text(canvas, { name: "Guest name", text: "{{name}}", fx: 0.06, fy: 0.2, fw: 0.55, size: Math.round((canvas.height || 690) * 0.1), weight: 700 }),
      text(canvas, { name: "Event", text: "{{event_name}}", fx: 0.06, fy: 0.42, fw: 0.55, size: Math.round((canvas.height || 690) * 0.05) }),
      text(canvas, { name: "Date", text: "{{event_date}}", fx: 0.06, fy: 0.58, fw: 0.55, size: Math.round((canvas.height || 690) * 0.04), color: "#cccccc" }),
      {
        ...newLayer("qr", canvas),
        ...at(canvas, 0.75, 0.18),
        name: "QR code",
        width: Math.round((canvas.height || 690) * 0.4),
      },
      text(canvas, { name: "Stub code", text: "{{ticket_code}}", fx: 0.72, fy: 0.78, fw: 0.24, size: Math.round((canvas.height || 690) * 0.04), align: "center", letter: 2 }),
    ],
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Just the name and the code, centred.",
    kinds: ["ticket", "certificate"],
    build: (canvas) => [
      text(canvas, { name: "Guest name", text: "{{name}}", fx: 0.1, fy: 0.38, fw: 0.8, size: Math.round((canvas.height || 690) * 0.11), weight: 700, align: "center" }),
      text(canvas, { name: "Event", text: "{{event_name}}", fx: 0.1, fy: 0.58, fw: 0.8, size: Math.round((canvas.height || 690) * 0.045), align: "center", color: "#cccccc" }),
    ],
  },
  {
    id: "formal",
    label: "Formal",
    description: "Title, recipient and body, centred, with the date below.",
    kinds: ["certificate"],
    build: (canvas) => [
      text(canvas, { name: "Title", text: "Certificate of Participation", fx: 0.1, fy: 0.18, fw: 0.8, size: Math.round((canvas.height || 1240) * 0.07), weight: 700, align: "center", letter: 4 }),
      text(canvas, { name: "Presented to", text: "This is to certify that", fx: 0.1, fy: 0.34, fw: 0.8, size: Math.round((canvas.height || 1240) * 0.03), align: "center", color: "#cccccc" }),
      text(canvas, { name: "Recipient", text: "{{name}}", fx: 0.1, fy: 0.42, fw: 0.8, size: Math.round((canvas.height || 1240) * 0.075), weight: 700, align: "center" }),
      text(canvas, { name: "Body", text: "has participated in {{event_name}}", fx: 0.12, fy: 0.56, fw: 0.76, size: Math.round((canvas.height || 1240) * 0.032), align: "center", color: "#cccccc" }),
      text(canvas, { name: "Date", text: "{{event_date}}", fx: 0.1, fy: 0.72, fw: 0.8, size: Math.round((canvas.height || 1240) * 0.03), align: "center" }),
      text(canvas, { name: "Certificate ID", text: "{{certificate_id}}", fx: 0.1, fy: 0.88, fw: 0.8, size: Math.round((canvas.height || 1240) * 0.022), align: "center", color: "#999999", letter: 2 }),
    ],
  },
] as const;

export function startersFor(kind: "ticket" | "certificate"): StarterLayout[] {
  return STARTER_LAYOUTS.filter((l) => l.kinds.includes(kind));
}
