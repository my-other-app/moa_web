import type { Binding, DesignInfo, DesignOption, DesignSlot, DesignToken, LayerDesign, PresetChoice } from "./schemas";

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

/** Below this the accent's text or shapes start to fade into what they sit on, unless the design says otherwise. */
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

/** The colours the accent must stand out from: the catalogue's, else what the templates draw. */
export const accentAgainst = (d: DesignInfo): string[] => {
  const own = (d.accent?.against ?? []).filter(isHex);
  if (own.length) return own;
  const ours = ACCENT_AGAINST[d.id];
  return ours ? [ours] : [];
};

/** The accent's worst contrast with what it sits on, or null when there is nothing to measure. */
export const accentContrast = (d: DesignInfo, accent: string | null | undefined) => {
  const against = accentAgainst(d);
  return against.length && isHex(accent) ? Math.min(...against.map((c) => contrastRatio(accent, c))) : null;
};

/** The contrast below which the colour is said to be hard to see. */
export const minContrastOf = (d: DesignInfo) => d.accent?.minContrast ?? MIN_ACCENT_CONTRAST;

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

export type OptionKind = "text" | "textarea" | "toggle" | "image" | "choice" | "lines";

export const optionKind = (o: DesignOption): OptionKind => {
  // Lines of the wording in the club's own words: {line: words}.
  if (o.slots?.length) return "lines";
  const t = o.type.toLowerCase();
  if (["toggle", "bool", "boolean", "switch", "checkbox"].includes(t)) return "toggle";
  if (["image", "upload", "image_src", "picture", "signature", "logo"].includes(t)) return "image";
  if (["textarea", "multiline", "lines", "paragraph"].includes(t)) return "textarea";
  if (["choice", "select", "enum", "radio"].includes(t) && o.choices?.length) return "choice";
  return "text";
};

export const choicesOf = (o: DesignOption) => (o.choices ?? []).map((c) => (typeof c === "string" ? { value: c, label: words(c) } : c));

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
  if (k === "lines") return "wording";
  if (k === "image") return "pictures";
  if (k === "toggle") return "printing";
  return "wording";
};

const defaultOf = (o: DesignOption) => (o.default !== undefined && o.default !== null ? o.default : optionKind(o) === "toggle" ? false : "");

/** Each option's default; a picture or the club's own lines start unset. */
export const optionDefaults = (d: DesignInfo): Record<string, unknown> =>
  Object.fromEntries(d.options.filter((o) => !["lines", "image"].includes(optionKind(o))).map((o) => [o.key, defaultOf(o)]));

/** A design just picked: its own defaults, every field automatic, its default accent. */
export const freshChoice = (d: DesignInfo): PresetChoice => ({ id: d.id, options: optionDefaults(d), bindings: {}, accent: d.accent?.default ?? null });

/** The saved settings when they are this design's, with any option the design gained since filled from its default; else a fresh pick. */
export const choiceFor = (d: DesignInfo, saved: PresetChoice | null | undefined): PresetChoice =>
  saved && saved.id === d.id
    ? { id: d.id, options: { ...optionDefaults(d), ...saved.options }, bindings: saved.bindings, accent: saved.accent ?? d.accent?.default ?? null }
    : freshChoice(d);

// ─── Fields ─────────────────────────────────────────────────────────────

function words(key: string) {
  const s = key.replace(/[_-]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The designer's token names in a club's words, where the name alone reads oddly. */
const SLOT_WORDS: Record<string, string> = {
  app_name: "Organiser",
  doors_time: "Doors open",
  doors_open_time: "Doors open",
  start_time: "Start time",
  ticket_type: "Ticket type",
  org_name: "Club name",
  org_founded_year: "Club founded",
  organization: "Organisation",
  institute_name: "Club name",
  event_tagline: "Event tagline",
  table_no: "Table",
  booth_no: "Booth",
  team_name: "Team",
  day_label: "Day",
  session_hall: "Session hall",
  session_time: "Session time",
  bib_number: "Bib number",
  rank_or_grade: "Rank or grade",
  duration_hours: "Hours",
  issue_city: "City",
  member_id: "Member number",
  member_since_year: "Member since",
  membership_tier: "Membership",
  valid_thru: "Valid until",
  valid_year: "Valid year",
  joined_date: "Joined",
  second_signatory_name: "Second signatory",
  second_signatory_designation: "Second signatory's title",
  signatory_designation: "Signatory's title",
  checkin_time: "Check-in time",
  kiosk_id: "Kiosk",
  logo_src: "Logo",
  signature_src: "Signature",
  second_signature_src: "Second signature",
  title: "Title",
  subtitle: "Subtitle",
  statement: "Statement",
};
export const slotLabel = (t: { key: string; label?: string | null }) => t.label || SLOT_WORDS[t.key] || words(t.key);

/**
 * What "Automatic" fills a field with (contract D5), for a catalogue that
 * does not say. A field missing here has nothing to fill it with, so
 * automatic leaves it off.
 */
const AUTO_MEANING: Record<string, string> = {
  app_name: "your club's name",
  org_name: "your club's name",
  institute_name: "your club's name",
  tagline: "the event's short line, when it has one",
  event_tagline: "the event's short line, when it has one",
  start_time: "the event's start time",
  venue: "the venue, or Online",
  event_venue: "the venue, or Online",
  gate: "the guest's seat, when one is assigned",
  row: "the guest's seat, when one is assigned",
  seat: "the guest's seat, when one is assigned",
  ticket_type: "the ticket type",
  access_level: "the ticket type",
  role: "attendee, speaker or staff, from the registration",
  badge_id: "the admission number, else the ticket code",
  member_id: "the badge number",
  organization: "the guest's organisation, when we have it",
  event_name: "the event's name",
  course_title: "the event's name",
  event_title: "the event's name",
  event_date: "the event's date",
  event_year: "the event's year",
  issue_date: "the event's date",
  issue_year: "the event's year",
  start_date: "the event's start date",
  end_date: "the event's end date",
  completion_date: "the event's end date",
  valid_thru: "the event's date",
  issue_city: "the event's city",
  city: "the event's city",
  grade: "their placing in a competition, when there is one",
  rank_or_grade: "their placing in a competition, when there is one",
  checkin_time: "the time it prints",
  kiosk_id: "the kiosk that prints it",
  logo_src: "your club's logo, or the one uploaded above",
  signature_src: "the signature uploaded above, when there is one",
  second_signature_src: "the signature uploaded above, when there is one",
};

/**
 * Never bound: the QR and the codes under it, the pictures (the guest's
 * photo, the logo, signatures, a sponsor's mark -- the design refuses any
 * binding on those), the accent.
 */
const NOT_BINDABLE = /^(qr|qr_src|qr_code_src|qr_code_url|photo_url|logo_src|signature_src|second_signature_src|sponsor_src|accent_color|verify_url|initials|ticket_id|certificate_id)$/;
const IMAGE_TOKEN = /_src$|_url$/;

/** An optional field of a design, as the bindings editor lists it. */
export interface Slot {
  key: string;
  label: string;
  /** What "automatic" fills it with, in words; null when nothing does, so it is left off. */
  auto: string | null;
  /** A picture: it can only be left automatic or hidden. */
  image: boolean;
}

/**
 * The optional fields of this design a club may fill from elsewhere or
 * hide: the design's own optional tokens that the backend can bind (when it
 * lists them), less those an option sets. What "automatic" means is the
 * backend's word, else ours (contract D5).
 */
export const bindableSlots = (d: DesignInfo, bindable: LayerDesign["bindable"] = []): Slot[] => {
  const known = new Map(bindable.map((b) => [b.token, b]));
  const optionKeys = new Set(d.options.map((o) => o.key));
  return d.tokens
    .filter(
      (t: DesignSlot) =>
        !t.required && !NOT_BINDABLE.test(t.key) && !IMAGE_TOKEN.test(t.key) && !known.get(t.key)?.image && !optionKeys.has(t.key) && (!known.size || known.has(t.key))
    )
    .map((t) => {
      const b = known.get(t.key);
      return { key: t.key, label: slotLabel(t), auto: b?.auto ?? t.auto ?? AUTO_MEANING[t.key] ?? null, image: b?.image ?? IMAGE_TOKEN.test(t.key) };
    });
};

/** "the ticket's name" → "The ticket's name." */
export const sentence = (s: string) => {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".");
};

export const bindingOf = (choice: PresetChoice, key: string): Binding => choice.bindings[key] ?? { source: "auto" };

export interface QuestionField {
  /**
   * What a binding names: the question's slug. The renderer reads the
   * answer as `field.<slug>`, and the API takes the slug with or without
   * that prefix, so the bare slug is what is saved.
   */
  key: string;
  label: string;
}

const slugOf = (token: string) => token.replace(/^field\./, "");

/**
 * The sign-up questions a field can be filled from: the backend's list, else
 * the editor's guest-field tokens. Photo and file answers are left out --
 * printed, they would be an address.
 */
export const questionFields = (d: Pick<LayerDesign, "questions" | "tokens">): QuestionField[] =>
  d.questions.length
    ? d.questions.filter((q) => q.type !== "image" && q.type !== "file").map((q) => ({ key: slugOf(q.token), label: q.label || q.key || q.token }))
    : d.tokens.filter((t: DesignToken) => t.group === "Guest fields").map((t) => ({ key: slugOf(t.key), label: t.label }));

/** Whether the event's form asks for a photo: the server's word, else a question that reads like one. */
export const hasPhotoQuestion = (d: Pick<LayerDesign, "hasPhotoQuestion" | "questions" | "tokens">) =>
  d.hasPhotoQuestion ?? questionFields(d).some((f) => /photo|picture|headshot|selfie/i.test(f.label));

// ─── Where the design comes from ────────────────────────────────────────

/** The built-in design's id (D7). */
export const defaultIdOf = (d: Pick<LayerDesign, "presetDefault">) => d.presetDefault?.id ?? null;

/** In use is the built-in design, exactly as it comes: nothing chosen here or up the chain. */
export const usesBuiltIn = (d: Pick<LayerDesign, "active" | "preset" | "presetDefault">) =>
  d.active === "preset" && !!d.preset && !!d.presetDefault && JSON.stringify(tidyChoice(d.preset)) === JSON.stringify(tidyChoice(d.presetDefault));

// ─── What is wrong ──────────────────────────────────────────────────────

export const MAX_FIXED_TEXT = 60;

export interface PresetProblem {
  /** "accent", "options.<key>" or "bindings.<key>", as the server names them too. */
  path: string;
  message: string;
}

/** Everything that stops a choice being saved, each said once, next to its field. */
export const presetProblems = (d: DesignInfo, choice: PresetChoice, fields: QuestionField[], bindable: LayerDesign["bindable"] = []): PresetProblem[] => {
  const out: PresetProblem[] = [];
  if (d.accent && !isHex(choice.accent)) out.push({ path: "accent", message: "Pick a colour, or type one as #RRGGBB." });
  for (const o of d.options) {
    const v = choice.options[o.key];
    const path = `options.${o.key}`;
    const kind = optionKind(o);
    // Pictures are uploaded as the design's artwork, not set as options.
    if (kind === "toggle" || kind === "image") continue;
    if (kind === "lines") {
      const lines = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
      for (const slot of o.slots ?? []) {
        const text = typeof lines[slot] === "string" ? (lines[slot] as string) : "";
        const max = o.maxLength ?? 200;
        if (text.length > max) out.push({ path: `options.${o.key}.${slot}`, message: `${words(slot)} is ${text.length} characters; keep it to ${max}.` });
      }
      continue;
    }
    const text = typeof v === "string" ? v : "";
    if (o.required && !text.trim()) out.push({ path, message: `${o.label} can't be empty.` });
    else if (o.maxLength && text.length > o.maxLength) out.push({ path, message: `${o.label} is ${text.length} characters; keep it to ${o.maxLength}.` });
    else if (kind === "choice" && text && !choicesOf(o).some((c) => c.value === text)) out.push({ path, message: `Pick one of the choices for ${o.label.toLowerCase()}.` });
  }
  const slots = new Map(bindableSlots(d, bindable).map((t) => [t.key, t]));
  for (const [key, b] of Object.entries(choice.bindings)) {
    const slot = slots.get(key);
    if (!slot) continue;
    const label = slot.label;
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

/**
 * What is sent and compared: bindings left automatic are dropped, fixed
 * texts trimmed, the colour in lower case (the server keeps it so). With the
 * design, the club's own lines keep only those written, and options the
 * design does not have are dropped.
 */
export const tidyChoice = (choice: PresetChoice, design?: DesignInfo): PresetChoice => {
  let options = choice.options;
  if (design) {
    options = {};
    for (const o of design.options) {
      const v = choice.options[o.key];
      if (v === undefined) continue;
      if (optionKind(o) === "lines") {
        const written = Object.entries(v && typeof v === "object" ? (v as Record<string, unknown>) : {}).filter(
          ([slot, t]) => (o.slots ?? []).includes(slot) && typeof t === "string" && t.trim()
        );
        if (written.length) options[o.key] = Object.fromEntries(written.map(([slot, t]) => [slot, (t as string).trim()]));
      } else options[o.key] = v;
    }
  }
  return {
    ...choice,
    options,
    accent: choice.accent ? choice.accent.toLowerCase() : null,
    bindings: Object.fromEntries(
      Object.entries(choice.bindings)
        .filter(([, b]) => b.source !== "auto")
        .map(([k, b]) => [k, b.source === "hidden" ? { source: "hidden" as const } : { source: b.source, value: (b.value ?? "").trim() }])
    ),
  };
};
