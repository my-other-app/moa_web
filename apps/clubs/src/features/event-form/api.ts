import { api } from "@moa/app-kit";
import { z } from "zod";

// The api module, not the feature's surface: the agenda page imports events, which imports this form.
import { createAgendaItem } from "@/features/agenda/api";
import { pinWireFields } from "@/features/venue";
import { COLUMN_IMAGE_MAX, REQUEST_MAX, fitImage, sizeLabel } from "@/lib/images";

import type { AgendaDraftItem, EventFormParsed } from "./schemas";

/**
 * Encodes the form for POST /events/create and PUT /events/update/{id}.
 *
 * Both are multipart, and the field encodings are not uniform — these were
 * read off the backend's EventCreate.__init__ rather than inferred, because
 * two of them contradict their own inline comments:
 *
 *   interest_ids       comma-separated integers. The source comment says
 *                      "JSON string", but the code does .split(","), so a
 *                      JSON array 400s with "expected comma seperated integers".
 *   additional_details JSON array string.
 *   speakers           JSON array string. A newly uploaded photo is referenced
 *                      by `photo_index`, an index into the speaker_photos files
 *                      appended in the same order. `bio` and `link` are null
 *                      when empty, never omitted.
 *   reg_startdate      ISO string; parsed with datetime.fromisoformat.
 *   lat, lng           floats, both or neither, only for a pin the club set
 *                      (picked from the venue search or typed in). A pin
 *                      the server read off the map link or found from the
 *                      venue name is not sent back, or it would be frozen
 *                      as manual.
 *   clear_point        "true" to drop the club's own pin: Remove pin, a
 *                      pasted map link replacing it, or an online event.
 *   booleans           sent as "true"/"false".
 *   requires_approval  "true"/"false": confirm each registration. Sent
 *                      only when the form carries it: editing, as read
 *                      from the event's detail; making one, once its switch
 *                      (shown when the server has requests) was used.
 *   high_demand_label  "true"/"false": the "High demand" tag on the public
 *                      page. Sent only when the event's detail carried it.
 *   store_item_ids     JSON array string of the club's items the event
 *                      sells, in the order ticked. Sent only with
 *                      merch_enabled on and the list known: switching
 *                      merchandise off leaves the choice for when it comes
 *                      back on, and an edit that could not read the offers
 *                      must not wipe them.
 *
 * Optional fields are omitted entirely rather than sent empty: FastAPI's
 * Optional[float] = Form(None) rejects "" with a validation error.
 */
export function toEventFormData(values: EventFormParsed, status?: "draft" | "published"): FormData {
  const fd = new FormData();
  // Where the event starts on its status clock; only create reads it.
  if (status) fd.append("status", status);

  const put = (key: string, value: string | number | boolean | undefined | null) => {
    if (value === undefined || value === null || value === "") return;
    fd.append(key, typeof value === "boolean" ? String(value) : String(value));
  };

  put("name", values.name);
  put("category_id", values.category_id);
  put("about", values.about);
  put("event_tag", values.event_tag);

  put("event_datetime", values.event_datetime);
  put("duration", values.duration);
  if (values.reg_startdate) put("reg_startdate", values.reg_startdate);
  if (values.reg_enddate) put("reg_enddate", values.reg_enddate);

  // Booleans are always sent: omitting has_fee would leave a previously paid
  // event paid when the organiser just turned the fee off.
  fd.append("is_online", String(values.is_online));
  fd.append("has_fee", String(values.has_fee));
  fd.append("has_prize", String(values.has_prize));
  fd.append("merch_enabled", String(values.merch_enabled));
  if (values.merch_enabled && values.store_item_ids) fd.append("store_item_ids", JSON.stringify(values.store_item_ids));
  fd.append("swag_enabled", String(values.swag_enabled));
  // Only when the form carries it: an API without it never sees the field.
  if (values.requires_approval !== undefined) fd.append("requires_approval", String(values.requires_approval));
  if (values.high_demand_label !== undefined) fd.append("high_demand_label", String(values.high_demand_label));

  put("location_name", values.is_online ? undefined : values.location_name);
  // The map link, for an in-person event. Left empty (or the event went
  // online), the saved one is cleared rather than kept: an omitted field
  // means "unchanged" to the backend.
  const mapLink = values.is_online ? "" : (values.location_link ?? "").trim();
  if (mapLink) put("location_link", mapLink);
  else fd.append("clear_location_link", "true");
  // The pin: lat/lng only when the club set it, clear_point when it was
  // removed or the event went online, nothing when it was left alone.
  for (const [key, value] of pinWireFields(values, { online: values.is_online })) fd.append(key, value);
  put("url", values.url);
  put("reg_fee", values.has_fee ? values.reg_fee : undefined);
  put("prize_amount", values.has_prize ? values.prize_amount : undefined);
  put("max_participants", values.max_participants);

  put("contact_name", values.contact_name);
  put("contact_phone", values.contact_phone);
  put("contact_email", values.contact_email);
  put("event_guidelines", values.event_guidelines);

  if (values.interest_ids.length > 0) {
    fd.append("interest_ids", values.interest_ids.join(","));
  }

  fd.append(
    "additional_details",
    JSON.stringify(
      values.additional_details.map((q) => ({
        key: q.key,
        label: q.label,
        field_type: q.field_type,
        required: q.required,
        ...(q.options?.length ? { options: q.options } : {}),
      }))
    )
  );

  const speakerPhotos: File[] = [];
  const speakers = values.speakers.map((speaker) => {
    const base: Record<string, unknown> = {
      name: speaker.name,
      designation: speaker.designation || null,
      // Always sent, so emptying either clears the saved one on edit.
      bio: speaker.bio || null,
      link: speaker.link || null,
    };
    if (speaker.id !== undefined) base.id = speaker.id;

    if (speaker.photoFile) {
      base.photo_index = speakerPhotos.length;
      speakerPhotos.push(speaker.photoFile);
    } else if (speaker.photo_url) {
      // Keeps an existing photo on edit; without this the backend would treat
      // the speaker as having had its photo removed.
      base.photo_url = speaker.photo_url;
    }
    return base;
  });
  fd.append("speakers", JSON.stringify(speakers));
  for (const photo of speakerPhotos) fd.append("speaker_photos", photo);

  if (values.posterFile) fd.append("poster", values.posterFile);

  return fd;
}

const createdSchema = z.object({ id: z.coerce.number(), name: z.string() }).passthrough();

/** A poster is read on a phone and printed on a ticket: 2,400 px is plenty. */
export const POSTER_IMAGE = { maxBytes: 3 * 1024 * 1024, longestSide: 2400, limit: COLUMN_IMAGE_MAX };
/** A speaker's photo is shown small everywhere it appears. */
export const SPEAKER_IMAGE = { maxBytes: 600 * 1024, longestSide: 800, limit: COLUMN_IMAGE_MAX };

/**
 * The poster and the new speaker photos, ready to send: each converted when
 * the API does not keep its format (an SVG, a HEIC, an AVIF...) and redrawn
 * under its budget (lib/images). One that cannot be sent, or a save whose
 * pictures still come to more than one request may carry (REQUEST_MAX: the
 * server refuses a request over 10 MB), is refused here with words.
 */
export async function fitEventImages(values: EventFormParsed): Promise<EventFormParsed> {
  const posterFile = values.posterFile ? await fitImage(values.posterFile, "poster", POSTER_IMAGE) : values.posterFile;
  const speakers = await Promise.all(
    values.speakers.map(async (speaker, index) =>
      speaker.photoFile
        ? { ...speaker, photoFile: await fitImage(speaker.photoFile, `photo of ${speaker.name || `speaker ${index + 1}`}`, SPEAKER_IMAGE) }
        : speaker,
    ),
  );
  const total = (posterFile?.size ?? 0) + speakers.reduce((sum, s) => sum + (s.photoFile?.size ?? 0), 0);
  if (total > REQUEST_MAX) {
    throw new Error(
      `The poster and the new speaker photos come to ${sizeLabel(total)}, more than the ${sizeLabel(REQUEST_MAX)} one save can send. Save with fewer new photos, then add the rest.`,
    );
  }
  return { ...values, posterFile, speakers };
}

export async function createEvent(values: EventFormParsed, status: "draft" | "published" = "published") {
  const raw = await api.post<unknown>("/api/v1/events/create", toEventFormData(await fitEventImages(values), status));
  return createdSchema.parse(raw);
}

/**
 * The running order typed (or drafted by AI) on a new event, saved to its
 * agenda once the event exists: each block at its time on the event's day,
 * in order, one request each (POST /events/{id}/agenda). The event is
 * already saved, so a block that fails is counted rather than thrown.
 */
export async function saveDraftAgenda(eventId: number, eventDatetime: string, items: readonly AgendaDraftItem[]): Promise<{ saved: number; failed: number }> {
  if (!items.length) return { saved: 0, failed: 0 };
  const day = /^\d{4}-\d{2}-\d{2}/.exec(eventDatetime)?.[0];
  if (!day) return { saved: 0, failed: items.length };
  let saved = 0;
  for (const item of items) {
    const starts = new Date(`${day}T${item.at}`);
    if (Number.isNaN(starts.getTime())) continue;
    try {
      await createAgendaItem(eventId, { starts_at: starts.toISOString(), ends_at: null, title: item.title, description: null, speaker: item.by?.trim() || null, location: null });
      saved++;
    } catch {
      // Counted below; the rest still go.
    }
  }
  return { saved, failed: items.length - saved };
}

/** A draft goes live from the console; the status clock lives under closeout. */
export async function publishEvent(eventId: number) {
  return z.object({ status: z.string() }).passthrough().parse(await api.patch<unknown>(`/api/v1/events/${eventId}/closeout/settings`, { status: "published" }));
}

export async function updateEvent(eventId: number, values: EventFormParsed) {
  const raw = await api.put<unknown>(
    `/api/v1/events/update/${eventId}`,
    toEventFormData(await fitEventImages(values))
  );
  return createdSchema.parse(raw);
}

export async function deleteEvent(eventId: number): Promise<void> {
  await api.del<void>(`/api/v1/events/delete/${eventId}`);
}

export async function fetchEvent(eventId: number): Promise<unknown> {
  return api.get<unknown>(`/api/v1/events/info/${eventId}`);
}

const categorySchema = z.object({ id: z.coerce.number(), name: z.string() }).passthrough();
const categoryListSchema = z
  .union([z.array(categorySchema), z.object({ items: z.array(categorySchema) })])
  .transform((v) => (Array.isArray(v) ? v : v.items));

export async function fetchCategories() {
  return categoryListSchema.parse(await api.get<unknown>("/api/v1/events/categories/list"));
}

const duplicatedSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  copied: z.record(z.number()),
  /** What the club's plan kept out of the copy, by flag or limit key ("swag", "badges", "merch_items_per_event"). */
  skipped: z.array(z.string()).catch([]),
});
export type Duplicated = z.infer<typeof duplicatedSchema>;
export interface DuplicateInput {
  name: string;
  event_datetime: string;
  duration?: number | null;
  copy_doors: boolean;
  copy_team: boolean;
  copy_agenda: boolean;
  copy_merch: boolean;
}
/** A new event from this one's setup; the venue, the guest list and every record of the day stay behind. */
export async function duplicateEvent(eventId: number, body: DuplicateInput) {
  return duplicatedSchema.parse(await api.post<unknown>(`/api/v1/events/${eventId}/duplicate`, body));
}
