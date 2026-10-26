import { z } from "zod";
import type { Topic } from "@moa/app-kit";

import type { EventDraft } from "@/features/ai";
import { pinDetailShape, pinFromDetail } from "@/features/venue";

import { FIELD_TYPES, SPEAKER_BIO_MAX, questionKey, type EventFormValues, type FieldType } from "./schemas";

/**
 * Parses GET /events/info/{id} into the shape the edit form expects.
 *
 * Permissive on purpose: the endpoint returns many fields the form does not
 * edit (ticket urls, the viewer's own rating, downloads), and a strict schema
 * would reject the whole payload over a field the form never touches.
 */
const detailSchema = z
  .object({
    id: z.coerce.number(),
    name: z.string(),
    about: z.string().nullish(),
    event_tag: z.string().nullish(),
    event_datetime: z.string().nullish(),
    duration: z.coerce.number().nullish(),
    reg_startdate: z.string().nullish(),
    reg_enddate: z.string().nullish(),
    location_name: z.string().nullish(),
    location_link: z.string().nullish(),
    // lat, lng and geo_source: the pin, and where it came from.
    ...pinDetailShape,
    url: z.string().nullish(),
    is_online: z.boolean().nullish(),
    has_fee: z.boolean().nullish(),
    reg_fee: z.coerce.number().nullish(),
    has_prize: z.boolean().nullish(),
    prize_amount: z.coerce.number().nullish(),
    merch_enabled: z.boolean().nullish(),
    swag_enabled: z.boolean().nullish(),
    // Confirm each registration; absent from an API without it: off.
    requires_approval: z.boolean().nullish(),
    max_participants: z.coerce.number().nullish(),
    contact_name: z.string().nullish(),
    contact_phone: z.string().nullish(),
    contact_email: z.string().nullish(),
    event_guidelines: z.string().nullish(),
    category: z.object({ id: z.coerce.number() }).passthrough().nullish(),
    interests: z.array(z.object({ id: z.coerce.number() }).passthrough()).nullish(),
    additional_details: z
      .array(
        z
          .object({
            key: z.string(),
            label: z.string(),
            field_type: z.string(),
            required: z.boolean().nullish(),
            options: z.array(z.string()).nullish(),
          })
          .passthrough()
      )
      .nullish(),
    speakers: z
      .array(
        z
          .object({
            id: z.coerce.number().nullish(),
            name: z.string(),
            designation: z.string().nullish(),
            bio: z.string().nullish(),
            link: z.string().nullish(),
            photo: z.unknown().nullish(),
          })
          .passthrough()
      )
      .nullish(),
  })
  .passthrough();

/**
 * `datetime-local` inputs need "YYYY-MM-DDTHH:mm" in local time. The API
 * returns IST-offset ISO strings, so slicing the string would be wrong for
 * anyone outside IST -- parse and reformat from the local clock instead.
 */
function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function photoUrlOf(photo: unknown): string | null {
  if (!photo || typeof photo !== "object") return null;
  const p = photo as Record<string, unknown>;
  for (const key of ["medium", "thumbnail", "original", "large"]) {
    const v = p[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

export function eventDetailToFormValues(raw: unknown): EventFormValues {
  const d = detailSchema.parse(raw);

  return {
    name: d.name,
    category_id: d.category?.id as number,
    about: d.about ?? "",
    event_tag: d.event_tag ?? "",
    interest_ids: (d.interests ?? []).map((i) => i.id),

    event_datetime: toDateTimeLocal(d.event_datetime),
    duration: d.duration ?? 1,
    reg_startdate: toDateTimeLocal(d.reg_startdate),
    reg_enddate: toDateTimeLocal(d.reg_enddate),

    is_online: d.is_online ?? false,
    location_name: d.location_name ?? "",
    location_link: d.location_link ?? "",
    // No pin, or half of one, reads as none; clear_point starts false.
    ...pinFromDetail(d),
    url: d.url ?? "",

    has_fee: d.has_fee ?? false,
    reg_fee: d.reg_fee ?? undefined,
    has_prize: d.has_prize ?? false,
    prize_amount: d.prize_amount ?? undefined,
    merch_enabled: d.merch_enabled ?? false,
    swag_enabled: d.swag_enabled ?? false,
    // Only what the event said: absent (an API without it), it stays unset and is never sent,
    // so a save can't switch off what it never read.
    requires_approval: d.requires_approval ?? undefined,
    max_participants: d.max_participants ?? undefined,

    contact_name: d.contact_name ?? "",
    contact_phone: d.contact_phone ?? "",
    contact_email: d.contact_email ?? "",
    event_guidelines: d.event_guidelines ?? "",

    additional_details: (d.additional_details ?? []).map((q) => ({
      key: q.key,
      label: q.label,
      // Guard the enum: a field_type the UI does not know would otherwise
      // crash the select. Falling back to text keeps the question editable.
      field_type: (FIELD_TYPES as readonly string[]).includes(q.field_type)
        ? (q.field_type as FieldType)
        : "text",
      required: q.required ?? true,
      ...(q.options?.length ? { options: q.options } : {}),
    })),

    speakers: (d.speakers ?? []).map((s) => ({
      // Carrying the id through is what makes the backend update the existing
      // speaker rather than create a duplicate.
      ...(s.id != null ? { id: s.id } : {}),
      name: s.name,
      designation: s.designation ?? "",
      bio: s.bio ?? "",
      link: s.link ?? "",
      photo_url: photoUrlOf(s.photo),
    })),
  };
}

// ─── An AI draft onto the form ──────────────────────────────────────────

export interface DraftFillContext {
  /** The form as it is now. */
  current: EventFormValues;
  /** Top-level fields the organiser has changed (react-hook-form's dirtyFields). */
  dirty: ReadonlySet<string>;
  /**
   * keep: what the organiser typed stays; AI fills what is empty or still
   * the default, and adds speakers, questions and blocks they do not have.
   * replace: AI's version wins wherever it found something.
   */
  mode: "keep" | "replace";
  /** The kinds of event (GET /events/categories/list). */
  categories: ReadonlyArray<{ id: number; name: string; slug?: string | null }>;
  /** The topic tree, to turn interest slugs into ids. */
  tree: readonly Topic[] | undefined;
  /** Paid entry is not on the plan: a fee on the poster is reported rather than switched on. */
  feeLocked: boolean;
  /** The image the draft was read from, to use as the poster. */
  poster?: File | null;
}

export interface DraftFill {
  /** Only the fields to set, with their new values. */
  patch: Partial<EventFormValues>;
  /** What the dashboard could not place, for the organiser to check. */
  notes: string[];
}

/** The answer types the draft speaks, as the form's. A select is one choice of several, which the form calls radio. */
const DRAFT_FIELD_TYPE: Record<string, FieldType> = {
  text: "text",
  select: "radio",
  radio: "radio",
  checkbox: "checkbox",
  number: "number",
  url: "url",
  date: "date",
};

const blank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Maps POST /clubs/ai/event-draft's `draft` onto the form.
 *
 *   name, about, guidelines        name, about, event_guidelines (cut to the form's limits)
 *   event_datetime (+05:30)        event_datetime, on this browser's clock as the form keeps it
 *   duration_hours                 duration
 *   format                         is_online
 *   venue_name, venue_address      location_name ("Name, address"); online_link → url
 *   fee                            has_fee + reg_fee, unless paid entry is locked on the plan
 *   capacity                       max_participants
 *   category                       category_id, by name or slug among the kinds of event
 *   interests (slugs)              interest_ids, through the topic tree; topics follow from them
 *   agenda {at, title, by}         agenda, saved to the Agenda tab with the event
 *   speakers                       speakers (no photo, no link)
 *   questions                      additional_details (select reads as radio; a choice
 *                                  question with no choices becomes text)
 *
 * Pure, so every rule is tested without rendering.
 */
export function draftToFormValues(draft: EventDraft, ctx: DraftFillContext): DraftFill {
  const { current, mode } = ctx;
  const patch: Partial<EventFormValues> = {};
  const notes: string[] = [];
  const may = (field: keyof EventFormValues) => mode === "replace" || !ctx.dirty.has(field) || blank(current[field]);
  const set = <K extends keyof EventFormValues>(field: K, value: EventFormValues[K] | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    if (may(field)) patch[field] = value;
  };

  set("name", draft.name?.slice(0, 100));

  if (draft.category) {
    const want = words(draft.category);
    const hit =
      ctx.categories.find((c) => words(c.name) === want || (c.slug ? words(c.slug) === want : false)) ??
      ctx.categories.find((c) => words(c.name).includes(want) || want.includes(words(c.name)));
    if (hit) set("category_id", hit.id);
    else notes.push(`“${draft.category}” isn't one of the kinds of event. Choose the closest one.`);
  }

  set("about", draft.about?.slice(0, 5000));
  set("event_guidelines", draft.guidelines?.slice(0, 5000));

  const when = toDateTimeLocal(draft.event_datetime);
  set("event_datetime", when || null);
  if (draft.duration_hours && draft.duration_hours > 0) set("duration", Math.round(draft.duration_hours * 100) / 100);

  if (draft.format) set("is_online", draft.format === "online");
  const online = patch.is_online ?? current.is_online ?? false;
  if (online) {
    if (draft.online_link && /^https?:\/\//i.test(draft.online_link)) set("url", draft.online_link);
  } else {
    const place = [draft.venue_name, draft.venue_address].filter(Boolean).join(", ").slice(0, 200);
    if (place && may("location_name")) {
      patch.location_name = place;
      // A pin picked for the old venue would point at the wrong place.
      if (current.lat != null || current.lng != null) Object.assign(patch, { lat: null, lng: null, geo_source: null });
    }
  }

  if (draft.fee !== null) {
    if (draft.fee > 0) {
      if (ctx.feeLocked) notes.push(`It mentions a ${rupees(draft.fee)} fee, but paid entry isn't on your plan, so the event is free for now.`);
      else if (may("has_fee") && may("reg_fee")) Object.assign(patch, { has_fee: true, reg_fee: draft.fee });
    } else if (current.has_fee && may("has_fee")) {
      patch.has_fee = false;
    }
  }
  if (draft.capacity && draft.capacity > 0) set("max_participants", Math.round(draft.capacity));

  // Interests, through the tree. Topics are not a field: they follow from the interests picked.
  if (draft.interests.length) {
    const all = (ctx.tree ?? []).flatMap((t) => t.interests);
    const ids = draft.interests
      .map((slug) => all.find((i) => i.slug === slug || words(i.name) === words(slug))?.id)
      .filter((id): id is number => typeof id === "number");
    if (ids.length) {
      const base = mode === "replace" ? [] : (current.interest_ids ?? []);
      const next = [...new Set([...base, ...ids])];
      if (next.length !== base.length || mode === "replace") patch.interest_ids = next;
    } else {
      notes.push("None of the interests it suggested are on the list. Pick them under Reach and rules.");
    }
  }

  // The lists: in keep mode, AI's items are added after the organiser's, skipping ones they already have.
  const merge = <T,>(field: "agenda" | "speakers" | "additional_details", mine: T[], theirs: T[], same: (a: T, b: T) => boolean) => {
    if (!theirs.length) return;
    if (mode === "replace") {
      (patch as Record<string, unknown>)[field] = theirs;
      return;
    }
    const added = theirs.filter((t) => !mine.some((m) => same(m, t)));
    if (added.length) (patch as Record<string, unknown>)[field] = [...mine, ...added];
  };

  const agenda = draft.agenda
    .map((a) => {
      const m = /^(\d{1,2}):(\d{2})/.exec(a.at.trim());
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
      return { at: `${m[1]!.padStart(2, "0")}:${m[2]}`, title: a.title.trim().slice(0, 200), by: a.by?.slice(0, 100) ?? "" };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null && a.title.length > 0);
  if (agenda.length < draft.agenda.length) notes.push("Some agenda items had no clear time and were left out.");
  merge("agenda", current.agenda ?? [], agenda, (a, b) => words(a.title) === words(b.title));

  const speakers = draft.speakers
    .filter((s) => s.name.trim())
    .map((s) => ({ name: s.name.trim().slice(0, 100), designation: s.designation?.slice(0, 200) ?? "", bio: s.bio?.slice(0, SPEAKER_BIO_MAX) ?? "", link: "" }));
  merge("speakers", current.speakers ?? [], speakers, (a, b) => words(a.name) === words(b.name));

  const mine = mode === "replace" ? [] : (current.additional_details ?? []);
  const keys = new Set(mine.map((q) => q.key));
  const questions = draft.questions
    .filter((q) => q.label.trim())
    .map((q) => {
      const label = q.label.trim().slice(0, 200);
      const options = q.options.map((o) => o.trim()).filter(Boolean);
      let fieldType = DRAFT_FIELD_TYPE[q.type] ?? "text";
      if ((fieldType === "radio" || fieldType === "checkbox") && !options.length) fieldType = "text";
      // A key no other question has: the stored answers are keyed by it.
      const root = questionKey(label) || "question";
      let key = root;
      for (let n = 2; keys.has(key); n++) key = `${root}_${n}`;
      keys.add(key);
      return { key, label, field_type: fieldType, required: q.required, ...(fieldType === "radio" || fieldType === "checkbox" ? { options } : {}) };
    });
  merge("additional_details", mine, questions, (a, b) => words(a.label) === words(b.label));

  if (ctx.poster && (mode === "replace" || !current.posterFile)) patch.posterFile = ctx.poster;

  return { patch, notes };
}
