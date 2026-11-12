import { z } from "zod";
import { PageSpec, TicketCanvas, TicketLayer } from "@moa/layout";

/**
 * Who a design is for.
 *
 * `event_default` is one design for the whole event, which is the common case
 * and stays the default. The rest are variants, used only when a club wants a
 * speaker's badge to differ from an attendee's.
 */
export const AUDIENCES = [
  { value: "event_default", label: "Everyone" },
  { value: "attendee", label: "Attendees" },
  { value: "speaker", label: "Speakers" },
  { value: "staff", label: "Staff" },
] as const;
export type Audience = (typeof AUDIENCES)[number]["value"];

export const DESIGN_KINDS = ["ticket", "badge", "certificate", "agenda"] as const;
export type DesignKind = (typeof DESIGN_KINDS)[number];

/**
 * Whose design the editor is on: one event's own, or the club's default
 * that every event starts from. The routes differ; the editor does not.
 */
export type DesignScope = { kind: "event"; eventId: number } | { kind: "club" };

export const starterSchema = z.object({
  canvas: TicketCanvas,
  layers: z.array(TicketLayer),
  page: PageSpec,
});

const tokenSchema = z.object({
  key: z.string(),
  group: z.string(),
  label: z.string(),
  sample: z.string(),
  note: z.string().nullish(),
});
export type DesignToken = z.infer<typeof tokenSchema>;

// ─── Ready designs (feature-register/doc-designs-contract.md) ───────────────

/** The kinds that have the designer's templates: a gallery before the canvas. */
export const PRESET_KINDS = ["ticket", "badge", "certificate"] as const;
export type PresetKind = (typeof PRESET_KINDS)[number];
export const isPresetKind = (k: DesignKind): k is PresetKind => (PRESET_KINDS as readonly string[]).includes(k);

/**
 * The backend writes Python's snake_case in places and camelCase in others;
 * the manifest keys are read either way, one level deep -- never the keys
 * inside options or bindings, which are the designer's token names.
 */
const camelKeys = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), x]))
    : v;
/** Read in camelCase, with the other names a field goes by filled in where the usual one is missing. */
const camel = <T extends z.ZodTypeAny>(schema: T, aliases: Record<string, string> = {}) =>
  z.preprocess((v) => {
    const o = camelKeys(v);
    if (!o || typeof o !== "object" || Array.isArray(o)) return o;
    const r = { ...(o as Record<string, unknown>) };
    for (const [from, to] of Object.entries(aliases)) if (r[to] === undefined && r[from] !== undefined) r[to] = r[from];
    return r;
  }, schema);

/** Where an optional field's value comes from: what we know, a fixed text, a sign-up question, or nowhere. */
export const BINDING_SOURCES = ["auto", "text", "field", "hidden"] as const;
export type BindingSource = (typeof BINDING_SOURCES)[number];
export const bindingSchema = z.object({ source: z.enum(BINDING_SOURCES), value: z.string().nullish() });
export type Binding = z.infer<typeof bindingSchema>;

/** A chosen ready design, as saved: `config.preset`. */
export const presetChoiceSchema = z.object({
  id: z.string(),
  options: z.record(z.unknown()).default({}),
  bindings: z.record(bindingSchema).default({}),
  accent: z.string().nullish(),
});
export type PresetChoice = z.infer<typeof presetChoiceSchema>;

/** One thing a club may set on a design: a line of wording, a signatory, a picture, the lanyard slot. */
export const designOptionSchema = camel(
  z.object({
    key: z.string(),
    label: z.string(),
    /** text, textarea, toggle (also bool/boolean), image, choice. Anything else is offered as text. */
    type: z.string().default("text"),
    group: z.string().nullish(),
    default: z.unknown().optional(),
    hint: z.string().nullish(),
    maxLength: z.number().nullish(),
    required: z.boolean().default(false),
    choices: z.array(z.union([z.string(), z.object({ value: z.string(), label: z.string() })])).nullish(),
    /** Lines of the design's wording a club may write in its own words: the option's value maps a line to its words. */
    slots: z.array(z.string()).nullish(),
  }),
  { name: "key", help: "hint", note: "hint", description: "hint", max: "maxLength", maxChars: "maxLength", values: "choices", options: "choices" }
);
export type DesignOption = z.infer<typeof designOptionSchema>;

/** A slot of the design: required ones are always ours to fill; optional ones the club can bind. */
export const designSlotSchema = z.preprocess(
  // A slot may come as its bare name.
  (v) => (typeof v === "string" ? { key: v } : v),
  camel(
    z.object({
      key: z.string(),
      label: z.string().nullish(),
      required: z.boolean().default(false),
      /** What "automatic" fills it with, in words; empty when we have nothing for it, so it hides. */
      auto: z.string().nullish(),
    }),
    { name: "key", token: "key", autoLabel: "auto", meaning: "auto" }
  )
);
export type DesignSlot = z.infer<typeof designSlotSchema>;

const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * A manifest entry, read the ways it comes: the designer's packages, the
 * backend's catalogue (tokens as {token: "required"|"optional"}, options as
 * {name: spec}, `colour: "mono"`), and a flat accent (`accent_default`,
 * `accent_suggestions`) folded into one object.
 */
const normaliseDesign = (v: unknown) => {
  const o = camelKeys(v);
  if (!isMap(o)) return o;
  const r = { ...o };
  // The other names the manifest gives these: a certificate's "title", the preview image's path.
  if (r.name === undefined && typeof r.title === "string") r.name = r.title;
  if (r.previewUrl === undefined && typeof r.preview === "string") r.previewUrl = r.preview;
  if (r.mono === undefined && typeof r.colour === "string") r.mono = r.colour === "mono";
  if (isMap(r.tokens)) r.tokens = Object.entries(r.tokens).map(([key, need]) => ({ key, required: need === "required" || need === true }));
  if (isMap(r.options)) r.options = Object.entries(r.options).map(([key, spec]) => ({ ...(isMap(spec) ? spec : {}), key }));
  if (r.accent !== undefined || !("accentDefault" in r)) return r;
  const { accentDefault, accentSuggestions, accentAgainst, accentNote, ...rest } = r;
  return {
    ...rest,
    accent: typeof accentDefault === "string" ? { default: accentDefault, suggestions: accentSuggestions ?? [], against: accentAgainst, note: accentNote } : null,
  };
};

export const designInfoSchema = z.preprocess(
  normaliseDesign,
  z.object({
    /** "<kind>/<file id>", e.g. "badge/06-thermal-mono". */
    id: z.string(),
    name: z.string(),
    kind: z.enum(PRESET_KINDS),
    page: camel(
      z.object({
        widthPx: z.number(),
        heightPx: z.number(),
        widthMm: z.number().nullish(),
        heightMm: z.number().nullish(),
      }),
      { width: "widthPx", height: "heightPx" }
    ),
    hasPhoto: z.boolean().default(false),
    use: z.string().nullish(),
    /** Black on white only: prints on a thermal label printer. */
    mono: z.boolean().nullish(),
    accent: camel(
      z.object({
        default: z.string(),
        suggestions: z.array(z.string()).default([]),
        /** The colours the accent sits on or under, for the contrast check. */
        against: z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string())).nullish(),
        /** Below this contrast with any of them, the club is warned (it may still save). */
        minContrast: z.number().nullish(),
        note: z.string().nullish(),
      }),
      { contrastNote: "note", contrastWith: "against", on: "against" }
    ).nullish(),
    tokens: z.array(designSlotSchema).default([]),
    options: z.array(designOptionSchema).default([]),
    previewUrl: z.string().nullish(),
  })
);
export type DesignInfo = z.infer<typeof designInfoSchema>;

/** The design and everything the editor needs around it -- what GET /layout answers. */
export const layerDesignSchema = z.object({
  eventId: z.number(),
  kind: z.enum(DESIGN_KINDS),
  audience: z.string(),
  canvas: TicketCanvas,
  layers: z.array(TicketLayer),
  page: PageSpec,
  version: z.number().default(0),
  /** True once the event owns this design for this audience, so a reset has something to undo. */
  isOwn: z.boolean().default(false),
  /** Nothing saved yet anywhere up the chain: the editor opened on a starter. */
  fromStarter: z.boolean().default(false),
  templateUrl: z.string().nullish(),
  /** Image keys the layers point at, resolved to URLs the browser can show. */
  imageUrls: z.record(z.string()).default({}),
  brand: z.object({
    orgName: z.string().default(""),
    primary: z.string(),
    secondary: z.string(),
    logoUrl: z.string().nullish(),
  }),
  eventIconUrl: z.string().nullish(),
  starters: z.record(z.object({ label: z.string(), note: z.string() })),
  tokens: z.array(tokenSchema),
  qrRequired: z.boolean(),
  /** What the canvas fills tokens with, made by the same code the renderer uses. */
  sampleValues: z.record(z.string()).default({}),
  /** The run of show an agenda layer draws on the stage: the event's own sessions, or samples while it has none. */
  agenda: z.array(z.object({ startsAt: z.string(), endsAt: z.string().nullable(), title: z.string(), speaker: z.string().nullable(), location: z.string().nullable() })).default([]),
  /** The zone an agenda layer's times read in. */
  timezone: z.string().default("Asia/Kolkata"),
  /**
   * Which design is in use: one of the ready designs (`preset`) or the
   * canvas. A backend from before the designs sends neither, and reads as the
   * canvas with an empty gallery.
   */
  active: z.enum(["preset", "custom"]).default("custom"),
  preset: presetChoiceSchema.nullish(),
  /** The ready design, as it would be saved, used when nothing is saved anywhere (D7). */
  presetDefault: presetChoiceSchema.nullish(),
  catalogue: z.array(designInfoSchema).default([]),
  /**
   * Every field of this kind a binding can name, and what "automatic" fills
   * it with (null: the backend does not say). A picture can only be hidden.
   */
  bindable: z.array(z.object({ token: z.string(), auto: z.string().nullish(), image: z.boolean().default(false) })).default([]),
  /** A custom canvas is saved, so Custom design opens on it. */
  hasLayout: z.boolean().nullish(),
  /** The sign-up form's questions; `token` is what a binding to one names (field.<slug>). */
  questions: z.array(z.object({ key: z.string().nullish(), label: z.string().nullish(), type: z.string().nullish(), token: z.string() })).default([]),
  /** The sign-up form has a photo question; unknown on a backend that does not say. */
  hasPhotoQuestion: z.boolean().nullish(),
});
export type LayerDesign = z.infer<typeof layerDesignSchema>;

/** What GET /events/{id}/designs/{kind} answers: the stored design's config, with its pictures' addresses. */
export const storedDesignSchema = z.object({
  config: z.record(z.unknown()).default({}),
  source: z.string().nullish(),
  is_own: z.boolean().default(false),
});

export const uploadedImageSchema = z.object({
  key: z.string(),
  url: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});

// ─── Layout v2: the board (feature-register/layout-v2-contract.md) ──────────

/** The kinds drawn on the board; the programme keeps the canvas editor. */
export const BOARD_KINDS = ["ticket", "badge", "certificate"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];
export const isBoardKind = (k: DesignKind): k is BoardKind => (BOARD_KINDS as readonly string[]).includes(k);

/** A design to start from: the 35 designs converted, the CR80 card and a blank canvas. */
export const starterMetaSchema = z.preprocess(
  (v) => {
    const o = camelKeys(v);
    if (!isMap(o)) return o;
    const r = { ...o };
    if (r.name === undefined && typeof r.title === "string") r.name = r.title;
    if (r.preview === undefined && typeof r.previewUrl === "string") r.preview = r.previewUrl;
    if (r.mono === undefined && typeof r.colour === "string") r.mono = r.colour === "mono";
    return r;
  },
  z.object({
    id: z.string(),
    name: z.string(),
    /** The picture of it: a URL, or a path under the dashboard's /designs. */
    preview: z.string().nullish(),
    page: camel(z.object({ widthMm: z.number(), heightMm: z.number() })).nullish(),
    hasPhoto: z.boolean().nullish(),
    mono: z.boolean().nullish(),
    note: z.string().nullish(),
  })
);
export type StarterMeta = z.infer<typeof starterMetaSchema>;

/** A font as the API lists it. */
const apiFontSchema = z.object({
  family: z.string(),
  weights: z.array(z.number()).default([]),
  styles: z.array(z.string()).default(["normal"]),
  faces: z
    .array(z.object({ weight: z.number(), style: z.string() }))
    .nullish()
    .transform((v) => v ?? undefined),
});

/**
 * GET …/layout answers the canvas's fields as before and the board's under
 * `v2`: the layout (converted when what prints is a v1 canvas or a preset),
 * where it came from, the gallery, the fonts, the tokens, the pictures'
 * links, and the sample guest's values and context. Read flat here.
 */
const flattenBoard = (v: unknown) => {
  const o = camelKeys(v);
  if (!isMap(o)) return o;
  const v2 = camelKeys(o.v2);
  // A backend from before the board: the canvas as saved, which the board converts.
  if (!isMap(v2)) return { ...o, layout: o.layout ?? { canvas: o.canvas, layers: o.layers, page: o.page }, convertedFrom: o.layout ? null : "v1" };
  return {
    ...o,
    layout: v2.layout ?? o.layout,
    convertedFrom: v2.from ?? null,
    version: typeof v2.revision === "number" ? v2.revision : o.version,
    fromStarter: v2.from === undefined ? o.fromStarter : v2.from === "default",
    starters: v2.starters ?? o.starters,
    fonts: v2.fonts ?? o.fonts,
    tokens: v2.tokens ?? o.tokens,
    images: v2.images ?? null,
    values: v2.values ?? null,
    context: v2.context ?? null,
  };
};

/** The pictures a layout shows, as links signed now: by source, and uploads by key. */
const boardImagesSchema = z.object({
  org_logo: z.string().nullish(),
  event_icon: z.string().nullish(),
  guest_photo: z.string().nullish(),
  signature_1: z.string().nullish(),
  signature_2: z.string().nullish(),
  sponsor: z.string().nullish(),
  uploads: z.record(z.string().nullable()).default({}),
});

/** What the server fills the design with for the sample guest, so the stage reads as the PDF does. */
const boardContextSchema = z.object({
  qr: z.string().nullish(),
  colors: z.record(z.string()).default({}),
  initials: z.string().nullish(),
});

/** What GET …/layout answers for the board: the design as v2 (converted if it was v1 or a preset) and what the board needs around it. */
export const boardDesignSchema = z.preprocess(
  flattenBoard,
  z.object({
    eventId: z.number().default(0),
    kind: z.enum(DESIGN_KINDS),
    audience: z.string().default("event_default"),
    /** Parsed by the board: v2, or v1 from a backend that sends it as saved. */
    layout: z.unknown(),
    version: z.number().default(0),
    isOwn: z.boolean().default(false),
    /** Nothing saved anywhere up the chain: the layout is the default design. */
    fromStarter: z.boolean().default(false),
    /** Where the layout came from: "saved" (v2), "v1" or "preset" (converted), "default" (nothing saved). */
    convertedFrom: z.string().nullish(),
    images: boardImagesSchema.nullish(),
    /** The sample guest's values, made by the renderer's own code. */
    values: z.record(z.string()).nullish(),
    context: boardContextSchema.nullish(),
    imageUrls: z.record(z.string()).default({}),
    brand: z
      .object({ orgName: z.string().default(""), primary: z.string(), secondary: z.string(), logoUrl: z.string().nullish() })
      .default({ orgName: "", primary: "#1B6B47", secondary: "#1DB9A0" }),
    eventIconUrl: z.string().nullish(),
    starters: z.array(starterMetaSchema).default([]),
    fonts: z.array(apiFontSchema).default([]),
    tokens: z.array(tokenSchema).default([]),
    qrRequired: z.boolean().nullish(),
    sampleValues: z.record(z.string()).default({}),
    questions: z.array(z.object({ key: z.string().nullish(), label: z.string().nullish(), type: z.string().nullish(), token: z.string() })).default([]),
    hasPhotoQuestion: z.boolean().nullish(),
    /** Which is in use: the board's design, or a preset still saved from before (it opens converted). */
    active: z.string().nullish(),
  })
);
export type BoardDesign = z.infer<typeof boardDesignSchema>;
