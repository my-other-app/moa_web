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

/** The manifest's flat accent (`accent_default`, `accent_suggestions`), folded into one object. */
const foldAccent = (v: unknown) => {
  const o = camelKeys(v);
  if (!o || typeof o !== "object") return o;
  const r = { ...(o as Record<string, unknown>) };
  // The other names the manifest gives these: a certificate's "title", the preview image's path.
  if (r.name === undefined && typeof r.title === "string") r.name = r.title;
  if (r.previewUrl === undefined && typeof r.preview === "string") r.previewUrl = r.preview;
  if (r.accent !== undefined || !("accentDefault" in r)) return r;
  const { accentDefault, accentSuggestions, accentAgainst, accentNote, ...rest } = r;
  return {
    ...rest,
    accent: typeof accentDefault === "string" ? { default: accentDefault, suggestions: accentSuggestions ?? [], against: accentAgainst, note: accentNote } : null,
  };
};

export const designInfoSchema = z.preprocess(
  foldAccent,
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
        /** The colour the accent sits on or under, for the contrast check. */
        against: z.string().nullish(),
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
  catalogue: z.array(designInfoSchema).default([]),
  /** The ready design used when nothing is saved anywhere (D7). */
  defaultPreset: z.string().nullish(),
  /** The event's sign-up form asks for a photo; unknown on a backend that does not say. */
  photoQuestion: z.boolean().nullish(),
});
export type LayerDesign = z.infer<typeof layerDesignSchema>;

export const uploadedImageSchema = z.object({
  key: z.string(),
  url: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});
