import type { Binding, DesignInfo, DesignOption, DesignToken, LayerDesign, PresetChoice } from "./schemas";

/**
 * The ready designs (the designer's templates) as the gallery and the
 * options panel use them: thumbnails, filters, the accent's contrast, the
 * defaults a fresh pick starts from, and what is wrong with a choice before
 * it is saved. Nothing here renders and nothing here fetches.
 */

/** "badge/06-thermal-mono" → "06-thermal-mono". */
export const fileIdOf = (id: string) => id.slice(id.lastIndexOf("/") + 1);

/**
 * The catalogue's own preview when it is an address the browser can load;
 * else the WebP shipped with the dashboard (public/designs). A path inside
 * the backend's package is not one: it would resolve against the dashboard.
 */
export const thumbnailOf = (d: DesignInfo) =>
  d.previewUrl && /^https:\/\//.test(d.previewUrl) ? d.previewUrl : `/designs/${d.kind}/${fileIdOf(d.id)}.webp`;

// ─── Colour ─────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};

/** The WCAG contrast ratio of two colours, 1 to 21. */
export const contrastRatio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Below this the accent's text or shapes start to fade into what they sit on. */
export const MIN_ACCENT_CONTRAST = 3;

/**
 * What each design's accent sits on or under, read from the templates and
 * the designer's notes: text in the accent on a light page, a dark page that
 * needs a light accent, or a fill behind dark or white type. Used only when
 * the catalogue does not say itself.
 */
const ACCENT_AGAINST: Record<string, string> = {
  "certificate/01-heritage": "#FBF8F1",
  "certificate/02-midnight-deco": "#0D111C",
  "certificate/04-verified-pass": "#111111",
  "certificate/05-botanical": "#FFFFFF",
  "certificate/06-blueprint": "#FFFFFF",
  "certificate/07-swiss-minimal": "#FFFFFF",
  "certificate/08-royal-ribbon": "#FFFFFF",
  "certificate/09-terminal": "#0B0F14",
  "certificate/10-confetti": "#1B1B3A",
  "badge/01-ticket-stub": "#0E1330",
  "badge/02-arch": "#12382B",
  "badge/03-role-rail": "#FFFFFF",
  "badge/04-big-name": "#15130D",
  "badge/05-monogram": "#FFFFFF",
  "badge/07-polaroid": "#FFFFFF",
  "badge/08-full-bleed": "#101418",
  "badge/09-boarding-pass": "#0F2440",
  "badge/11-night-grid": "#10142B",
  "badge/12-stamp": "#E9F0F7",
  "badge/13-sash": "#FFFFFF",
  "badge/14-fine-line": "#FBFBF9",
  "badge/15-race-bib": "#141414",
};

export const accentAgainst = (d: DesignInfo) => {
  const own = d.accent?.against;
  return isHex(own) ? own : (ACCENT_AGAINST[d.id] ?? null);
};

/** The accent's contrast with what it sits on, or null when there is nothing to measure. */
export const accentContrast = (d: DesignInfo, accent: string | null | undefined) => {
  const against = accentAgainst(d);
  return against && isHex(accent) ? contrastRatio(accent, against) : null;
};

// ─── The gallery ────────────────────────────────────────────────────────

/** Black on white only: the one design a black-only thermal printer can print. */
const MONO = new Set(["badge/06-thermal-mono"]);
export const isMono = (d: DesignInfo) => d.mono ?? MONO.has(d.id);

export type PhotoFilter = "all" | "photo" | "none";
export type ColourFilter = "all" | "colour" | "mono";

export const filterDesigns = (list: DesignInfo[], photo: PhotoFilter, colour: ColourFilter) =>
  list.filter(
    (d) =>
      (photo === "all" || (photo === "photo") === d.hasPhoto) && (colour === "all" || (colour === "mono") === isMono(d))
  );

const near = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) < 1;

/** The printed size, in the words a club uses. */
export const pageLabel = (d: DesignInfo) => {
  const { widthMm: w, heightMm: h, widthPx, heightPx } = d.page;
  if (near(w, 101.6) && near(h, 152.4)) return "4 × 6 in";
  if (near(w, 297) && near(h, 210)) return "A4 landscape";
  if (near(w, 210) && near(h, 297)) return "A4 portrait";
  if (d.kind === "ticket") return "Landscape";
  return w && h ? `${Math.round(w)} × ${Math.round(h)} mm` : `${widthPx} × ${heightPx} px`;
};

// ─── Options ────────────────────────────────────────────────────────────

export type OptionKind = "text" | "textarea" | "toggle" | "image" | "choice";

export const optionKind = (o: DesignOption): OptionKind => {
  const t = o.type.toLowerCase();
  if (["toggle", "bool", "boolean", "switch", "checkbox"].includes(t)) return "toggle";
  if (["image", "upload", "image_src", "picture", "signature", "logo"].includes(t)) return "image";
  if (["textarea", "multiline", "lines", "paragraph"].includes(t)) return "textarea";
  if (["choice", "select", "enum", "radio"].includes(t) && o.choices?.length) return "choice";
  return "text";
};

export const choicesOf = (o: DesignOption) => (o.choices ?? []).map((c) => (typeof c === "string" ? { value: c, label: c } : c));

export type OptionGroup = "wording" | "signatories" | "pictures" | "printing";
export const OPTION_GROUPS: { key: OptionGroup; title: string }[] = [
  { key: "wording", title: "Wording" },
  { key: "signatories", title: "Signatories" },
  { key: "pictures", title: "Pictures" },
  { key: "printing", title: "Printing" },
];

/** The panel section an option sits in: the catalogue's group when it names one we know, else what the option is. */
export const optionGroup = (o: DesignOption): OptionGroup => {
  const g = (o.group ?? "").toLowerCase();
  if (g.startsWith("sign")) return "signatories";
  if (g === "wording" || g === "text" || g === "copy") return "wording";
  if (g === "pictures" || g === "images" || g === "image" || g === "logo") return "pictures";
  if (g === "printing" || g === "print" || g === "card" || g === "layout") return "printing";
  if (/signat/.test(o.key)) return "signatories";
  const k = optionKind(o);
  if (k === "image") return "pictures";
  if (k === "toggle") return "printing";
  return "wording";
};

const defaultOf = (o: DesignOption) => (o.default !== undefined && o.default !== null ? o.default : optionKind(o) === "toggle" ? false : "");

export const optionDefaults = (d: DesignInfo): Record<string, unknown> => Object.fromEntries(d.options.map((o) => [o.key, defaultOf(o)]));

/** A design just picked: its own defaults, every field automatic, its default accent. */
export const freshChoice = (d: DesignInfo): PresetChoice => ({ id: d.id, options: optionDefaults(d), bindings: {}, accent: d.accent?.default ?? null });

/** The saved settings when they are this design's, with any option the design gained since filled from its default; else a fresh pick. */
export const choiceFor = (d: DesignInfo, saved: PresetChoice | null | undefined): PresetChoice =>
  saved && saved.id === d.id
    ? { id: d.id, options: { ...optionDefaults(d), ...saved.options }, bindings: saved.bindings, accent: saved.accent ?? d.accent?.default ?? null }
    : freshChoice(d);

// ─── Fields ─────────────────────────────────────────────────────────────

/** Slots that are images or codes we always draw, or that an option already sets: never bound. */
const NOT_BINDABLE = /^(qr_code_src|qr_code_url|qr|logo_src|photo_url|accent_color|verify_url|initials)$/;

/** The optional slots a club may fill from elsewhere or hide. */
export const bindableSlots = (d: DesignInfo) => {
  const optionKeys = new Set(d.options.map((o) => o.key));
  return d.tokens.filter((t) => !t.required && !NOT_BINDABLE.test(t.key) && !optionKeys.has(t.key));
};

const words = (key: string) => {
  const s = key.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const slotLabel = (t: { key: string; label?: string | null }) => t.label || words(t.key);

export const bindingOf = (choice: PresetChoice, key: string): Binding => choice.bindings[key] ?? { source: "auto" };

/** The sign-up questions a field can be filled from, as the editor's tokens list them. */
export const questionFields = (tokens: DesignToken[]) => tokens.filter((t) => t.group === "Guest fields").map((t) => ({ key: t.key, label: t.label }));
export type QuestionField = ReturnType<typeof questionFields>[number];

/** Whether the event's form asks for a photo: the server's word, else a question that reads like one. */
export const hasPhotoQuestion = (design: Pick<LayerDesign, "photoQuestion" | "tokens">) =>
  design.photoQuestion ?? questionFields(design.tokens).some((f) => /photo|picture|headshot|selfie/i.test(f.label));

// ─── What is wrong ──────────────────────────────────────────────────────

export const MAX_FIXED_TEXT = 60;

export interface PresetProblem {
  /** "accent", "options.<key>" or "bindings.<key>", as the server names them too. */
  path: string;
  message: string;
}

/** Everything that stops a choice being saved, each said once, next to its field. */
export const presetProblems = (d: DesignInfo, choice: PresetChoice, fields: QuestionField[]): PresetProblem[] => {
  const out: PresetProblem[] = [];
  if (d.accent && !isHex(choice.accent)) out.push({ path: "accent", message: "Pick a colour, or type one as #RRGGBB." });
  for (const o of d.options) {
    const v = choice.options[o.key];
    const path = `options.${o.key}`;
    const kind = optionKind(o);
    if (kind === "toggle") continue;
    if (kind === "image") {
      if (o.required && !v) out.push({ path, message: `Upload the ${o.label.toLowerCase()}.` });
      continue;
    }
    const text = typeof v === "string" ? v : "";
    if (o.required && !text.trim()) out.push({ path, message: `${o.label} can't be empty.` });
    else if (o.maxLength && text.length > o.maxLength) out.push({ path, message: `${o.label} is ${text.length} characters; keep it to ${o.maxLength}.` });
    else if (kind === "choice" && text && !choicesOf(o).some((c) => c.value === text)) out.push({ path, message: `Pick one of the choices for ${o.label.toLowerCase()}.` });
  }
  const slots = new Map(bindableSlots(d).map((t) => [t.key, t]));
  for (const [key, b] of Object.entries(choice.bindings)) {
    const slot = slots.get(key);
    if (!slot) continue;
    const label = slotLabel(slot);
    const path = `bindings.${key}`;
    if (b.source === "text") {
      const text = (b.value ?? "").trim();
      if (!text) out.push({ path, message: `Type the text for ${label.toLowerCase()}, or pick another source.` });
      else if (text.length > MAX_FIXED_TEXT) out.push({ path, message: `${label} is ${text.length} characters; keep it to ${MAX_FIXED_TEXT}.` });
    } else if (b.source === "field" && !fields.some((f) => f.key === b.value)) {
      out.push({ path, message: `Pick the question that fills ${label.toLowerCase()}.` });
    }
  }
  return out;
};

/** Only what differs from the defaults is worth keeping: automatic bindings are dropped before a save. */
export const tidyChoice = (choice: PresetChoice): PresetChoice => ({
  ...choice,
  // The server keeps colours in lower case; so does the comparison with what is saved.
  accent: choice.accent ? choice.accent.toLowerCase() : null,
  bindings: Object.fromEntries(
    Object.entries(choice.bindings)
      .filter(([, b]) => b.source !== "auto")
      .map(([k, b]) => [k, b.source === "hidden" ? { source: "hidden" as const } : { source: b.source, value: (b.value ?? "").trim() }])
  ),
});
