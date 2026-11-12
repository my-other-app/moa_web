import type { ZodIssue } from "zod";

import { gFmt } from "./css";
import { DOC_FONTS, facesOf, findFont, type FontFamilyV2, hasFace, nearestFonts } from "./fonts";
import { checkSvg } from "./sanitize";
import { type DocKind, type FillV2, type LayerV2, LayoutV2, pyRepr, shadowsOf, V2_LIMITS } from "./schema";
import { canonicalV2, parseV2, showIfNames } from "./tokens";

/**
 * Whether a v2 layout is right for its kind: the backend's
 * `layout_v2/validate.py`, word for word. `problems(layout, kind)` ->
 * `[{code, field, message, level, layer?}]`: "error"s stop a save;
 * "warning"s are shown and may be saved. `field` is a dotted path into the
 * wire form ("layers.3.font.family"); `layer` the layer's id when there is
 * one.
 *
 * Codes: schema (the shape is wrong: its messages are pydantic's), page_shape,
 * qr_missing, qr_extra, duplicate_id, unknown_token, unknown_font, font_face,
 * template, svg_unsafe, image_missing, photo_preprinted, qr_hidden, qr_small,
 * qr_outside, accent_missing; warnings: off_canvas, empty_text, invisible,
 * svg_cleaned, qr_small (under 15 mm), qr_square.
 */

export interface ProblemV2 {
  code: string;
  field: string;
  message: string;
  level: "error" | "warning";
  /** The layer's id, when the problem is a layer's. */
  layer?: string;
}

export interface ValidateOptions {
  /** The font list to check against (fontsFromApi of the API's `fonts`); the built-in list otherwise. */
  fonts?: readonly FontFamilyV2[];
}

/** Kinds whose documents are scanned at a gate: exactly one QR. */
export const QR_KINDS: readonly string[] = ["ticket", "badge"];
/** A QR smaller than this on paper is refused; smaller than WARN_QR_MM, warned. */
export const MIN_QR_MM = 10;
export const WARN_QR_MM = 15;

const p = (code: string, field: string, message: string, level: "error" | "warning" = "error", layer?: string | null): ProblemV2 => {
  const out: ProblemV2 = { code, field, message, level };
  if (layer) out.layer = layer;
  return out;
};

// ─── The shape, in pydantic's words ─────────────────────────────────────────

const quoted = (v: unknown) => (typeof v === "string" ? pyRepr(v) : String(v));
const orList = (vals: readonly unknown[]) => {
  const q = vals.map(quoted);
  return q.length <= 1 ? q.join("") : `${q.slice(0, -1).join(", ")} or ${q[q.length - 1]}`;
};
const plural = (n: number | bigint, word: string) => `${n} ${word}${Number(n) === 1 ? "" : "s"}`;

const TYPE_WORD: Record<string, string> = {
  number: "a valid number",
  integer: "a valid integer",
  string: "a valid string",
  boolean: "a valid boolean",
  array: "a valid list",
  object: "a valid dictionary",
};

/** A schema issue as pydantic words it, so both sides say the same. */
export const pydanticMessage = (issue: ZodIssue, input?: unknown): string => {
  switch (issue.code) {
    case "invalid_type":
      if (issue.received === "undefined") return "Field required";
      if (issue.expected === "integer" && issue.received === "float") return "Input should be a valid integer, got a number with a fractional part";
      return `Input should be ${TYPE_WORD[issue.expected] ?? `a valid ${issue.expected}`}`;
    case "too_small":
      if (issue.type === "string") return `String should have at least ${plural(issue.minimum, "character")}`;
      if (issue.type === "array") return `List should have at least ${plural(issue.minimum, "item")} after validation, not ${Array.isArray(input) ? input.length : "fewer"}`;
      return `Input should be greater than ${issue.inclusive ? "or equal to " : ""}${issue.minimum}`;
    case "too_big":
      if (issue.type === "string") return `String should have at most ${plural(issue.maximum, "character")}`;
      if (issue.type === "array") return `List should have at most ${plural(issue.maximum, "item")} after validation, not ${Array.isArray(input) ? input.length : "more"}`;
      return `Input should be less than ${issue.inclusive ? "or equal to " : ""}${issue.maximum}`;
    case "invalid_literal":
      return `Input should be ${quoted(issue.expected)}`;
    case "invalid_enum_value":
      return `Input should be ${orList(issue.options)}`;
    case "invalid_union_discriminator": {
      const tag = issue.options.includes("text") ? "kind" : "type";
      if (input === undefined) return `Unable to extract tag using discriminator ${quoted(tag)}`;
      return `Input tag ${quoted(input)} found using ${quoted(tag)} does not match any of the expected tags: ${issue.options.map(quoted).join(", ")}`;
    }
    case "invalid_string":
      return issue.message;
    case "unrecognized_keys":
      return "Extra inputs are not permitted";
    case "custom":
      return issue.message;
    default:
      return issue.message;
  }
};

const at = (root: unknown, path: (string | number)[]) => path.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string | number, unknown>)[k] : undefined), root);

/** pydantic's error locations name a union's member; the backend drops those (and so any field spelled like one). */
const TAGS = new Set(["text", "shape", "svg", "image", "qr", "solid", "linear", "radial"]);
const fieldOf = (path: readonly (string | number)[]) => path.filter((x) => !(typeof x === "string" && TAGS.has(x))).join(".") || "layout";

/** The schema's problems: one per issue (one per extra field), code "schema", field the dotted path as the backend writes it. */
export const schemaProblems = (issues: readonly ZodIssue[], raw: unknown): ProblemV2[] =>
  issues.flatMap((i) => {
    if (i.code === "unrecognized_keys") return i.keys.map((k) => p("schema", fieldOf([...i.path, k]), "Extra inputs are not permitted"));
    const input = at(raw, i.path);
    // A tag's issue is the union's, one level up, in pydantic.
    const path = i.code === "invalid_union_discriminator" ? i.path.slice(0, -1) : i.path;
    return [p("schema", fieldOf(path), pydanticMessage(i, input))];
  });

// ─── The meaning ────────────────────────────────────────────────────────────

const colorsOf = (layer: LayerV2): string[] => {
  const out: string[] = [];
  const fill = (f: FillV2 | null) => {
    if (!f) return;
    if (f.type === "solid") out.push(f.color);
    else out.push(...f.stops.map((s) => s.color));
  };
  for (const s of shadowsOf(layer)) out.push(s.color);
  switch (layer.kind) {
    case "text":
      out.push(layer.color);
      fill(layer.background);
      for (const s of layer.spans ?? []) if (s.color) out.push(s.color);
      break;
    case "shape":
      fill(layer.fill);
      if (layer.stroke) out.push(layer.stroke.color);
      break;
    case "svg":
      out.push(...Object.values(layer.recolor ?? {}));
      break;
    case "image":
      if (layer.border) out.push(layer.border.color);
      if (layer.placeholderStyle) {
        out.push(layer.placeholderStyle.color);
        fill(layer.placeholderStyle.background);
      }
      break;
    case "qr":
      fill(layer.background);
      break;
  }
  return out;
};

const fontProblems = (fonts: readonly FontFamilyV2[], family: string, weight: number, style: string, field: string, name: string, lid: string): ProblemV2[] => {
  const font = findFont(family, fonts);
  if (!font) return [p("unknown_font", `${field}.family`, `${name}: there is no font called ${pyRepr(family)}. The nearest are ${nearestFonts(family, fonts).join(", ")}.`, "error", lid)];
  if (!hasFace(font, weight, style)) {
    const have = facesOf(font)
      .map((f) => `${f.weight}${f.style === "italic" ? " italic" : ""}`)
      .join(", ");
    return [p("font_face", `${field}.weight`, `${name}: ${family} has ${have}, not ${weight}${style === "italic" ? " italic" : ""}.`, "error", lid)];
  }
  return [];
};

/** Python's format(v, ".0f"): halves to even. */
const fixed0 = (v: number) => {
  const f = Math.floor(v);
  const d = v - f;
  const r = d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f;
  return String(r === 0 ? 0 : r);
};

/** Problems in a layout whose shape holds (parsed). */
export const layoutProblemsV2 = (lay: LayoutV2, kind: DocKind | string = "ticket", opts: ValidateOptions = {}): ProblemV2[] => {
  const fonts = opts.fonts ?? DOC_FONTS;
  const out: ProblemV2[] = [];
  const c = lay.canvas;
  const page = lay.page;
  const want = page.widthMm / page.heightMm;
  const have = c.width / c.height;
  if (Math.abs(want - have) / want > V2_LIMITS.aspectTolerance)
    out.push(
      p(
        "page_shape",
        "canvas",
        `The canvas is ${gFmt(c.width)} × ${gFmt(c.height)}, which is not the shape of a ${gFmt(page.widthMm)} × ${gFmt(page.heightMm)} mm page. Resize it, or change the page.`,
      ),
    );
  const pxPerMm = c.width / page.widthMm;
  const qrs = lay.layers.flatMap((l, i) => (l.kind === "qr" ? [i] : []));
  if (QR_KINDS.includes(kind) && !qrs.length) out.push(p("qr_missing", "layers", "This design needs its QR code: it is what the gate scans."));
  if (qrs.length > 1) out.push(p("qr_extra", `layers.${qrs[1]}`, "A design has one QR code.", "error", lay.layers[qrs[1]!]!.id));
  const ids = new Set<string>();
  let usesAccent = false;
  lay.layers.forEach((layer, i) => {
    const where = `layers.${i}`;
    const name = layer.name;
    const lid = layer.id;
    if (ids.has(layer.id)) out.push(p("duplicate_id", `${where}.id`, `Two layers share the id "${layer.id}".`, "error", lid));
    ids.add(layer.id);
    if (colorsOf(layer).includes("var:accent")) usesAccent = true;
    for (const t of showIfNames(layer.showIf)) if (canonicalV2(t, kind) === null) out.push(p("unknown_token", `${where}.showIf`, `${name}: ${t} is not a token.`, "error", lid));
    if ((layer.x >= c.width || layer.y >= c.height || layer.x + layer.width <= 0 || layer.y + layer.height <= 0) && !layer.rotation)
      out.push(p("off_canvas", `${where}.x`, `${name}: this layer is outside the canvas.`, "warning", lid));
    switch (layer.kind) {
      case "text": {
        out.push(...fontProblems(fonts, layer.font.family, layer.font.weight, layer.font.style, `${where}.font`, name, lid));
        const sources: [string, string][] = !layer.spans ? [[`${where}.text`, layer.text]] : layer.spans.map((s, j) => [`${where}.spans.${j}.text`, s.text]);
        for (const [field, src] of sources) for (const e of parseV2(src, kind).errors) out.push(p("template", field, `${name}: ${e}`, "error", lid));
        (layer.spans ?? []).forEach((s, j) => {
          if (s.family || s.weight || s.style)
            out.push(...fontProblems(fonts, s.family || layer.font.family, s.weight || layer.font.weight, s.style || layer.font.style, `${where}.spans.${j}`, name, lid));
        });
        if (!layer.text.trim()) out.push(p("empty_text", `${where}.text`, `${name}: this text says nothing.`, "warning", lid));
        break;
      }
      case "shape":
        if (layer.fill === null && layer.stroke === null && !shadowsOf(layer).length)
          out.push(p("invisible", `${where}.fill`, `${name}: a shape needs a fill or an outline.`, "warning", lid));
        break;
      case "svg": {
        const r = checkSvg(layer.markup);
        if (!r.ok) out.push(p("svg_unsafe", `${where}.markup`, `${name}: ${r.error}.`, "error", lid));
        else if (r.removed.length) out.push(p("svg_cleaned", `${where}.markup`, `${name}: removed what a design may not hold: ${r.removed.slice(0, 5).join(", ")}.`, "warning", lid));
        break;
      }
      case "image": {
        if (layer.source === "upload" && !layer.imageKey && !layer.hidden) out.push(p("image_missing", `${where}.imageKey`, `${name}: choose an image to show.`, "error", lid));
        if (layer.source === "guest_photo" && layer.preprinted)
          out.push(p("photo_preprinted", `${where}.preprinted`, `${name}: a guest photo cannot be on the card stock.`, "error", lid));
        const st = layer.placeholderStyle;
        if (st) out.push(...fontProblems(fonts, st.family, st.weight, "normal", `${where}.placeholderStyle`, name, lid));
        break;
      }
      case "qr": {
        if (layer.hidden || layer.showIf) out.push(p("qr_hidden", `${where}.hidden`, `${name}: the QR code is always printed.`, "error", lid));
        const sideMm = Math.min(layer.width, layer.height) / pxPerMm;
        if (sideMm < MIN_QR_MM)
          out.push(p("qr_small", `${where}.width`, `${name}: ${fixed0(sideMm)} mm on paper; at least ${gFmt(MIN_QR_MM)} mm, or phones struggle to read it.`, "error", lid));
        else if (sideMm < WARN_QR_MM) out.push(p("qr_small", `${where}.width`, `${name}: ${fixed0(sideMm)} mm on paper; ${gFmt(WARN_QR_MM)} mm or more scans best.`, "warning", lid));
        if (Math.abs(layer.width - layer.height) > 0.5) out.push(p("qr_square", `${where}.height`, `${name}: a QR code is square.`, "warning", lid));
        if (layer.x < 0 || layer.y < 0 || layer.x + layer.width > c.width + 0.5 || layer.y + layer.height > c.height + 0.5)
          out.push(p("qr_outside", `${where}.x`, `${name}: the whole QR code must be on the page.`, "error", lid));
        break;
      }
    }
  });
  if (usesAccent && !lay.vars.accent) out.push(p("accent_missing", "vars.accent", "Colours say var:accent, but the design has no accent colour."));
  return out;
};

/** Anything as a v2 layout for a kind: the shape first (its problems alone when it fails), then the meaning. */
export const validate = (raw: unknown, kind: DocKind | string = "ticket", opts: ValidateOptions = {}): ProblemV2[] => {
  const parsed = LayoutV2.safeParse(raw);
  if (!parsed.success) return schemaProblems(parsed.error.issues, raw);
  return layoutProblemsV2(parsed.data as LayoutV2, kind, opts);
};

/** The backend's `problems` by its own name. */
export const problems = validate;

/** Only the errors (what stops a save). */
export const errorsV2 = (raw: unknown, kind: DocKind | string = "ticket", opts: ValidateOptions = {}) => validate(raw, kind, opts).filter((x) => x.level === "error");

/** Whether problems allow saving: no errors. */
export const canSave = (list: readonly ProblemV2[]) => !list.some((x) => x.level === "error");

