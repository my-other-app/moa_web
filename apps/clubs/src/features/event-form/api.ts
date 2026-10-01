import { api } from "@moa/app-kit";
import { z } from "zod";

import type { EventFormParsed } from "./schemas";

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
 *                      appended in the same order.
 *   reg_startdate      ISO string; parsed with datetime.fromisoformat.
 *   booleans           sent as "true"/"false".
 *
 * Optional fields are omitted entirely rather than sent empty: FastAPI's
 * Optional[float] = Form(None) rejects "" with a validation error.
 */
export function toEventFormData(values: EventFormParsed): FormData {
  const fd = new FormData();

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

  put("location_name", values.is_online ? undefined : values.location_name);
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

export async function createEvent(values: EventFormParsed) {
  const raw = await api.post<unknown>("/api/v1/events/create", toEventFormData(values));
  return createdSchema.parse(raw);
}

export async function updateEvent(eventId: number, values: EventFormParsed) {
  const raw = await api.put<unknown>(
    `/api/v1/events/update/${eventId}`,
    toEventFormData(values)
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

const interestSchema = z.object({ id: z.coerce.number(), name: z.string() }).passthrough();
const interestListSchema = z
  .union([
    z.array(interestSchema),
    z.object({ items: z.array(interestSchema) }),
    // /interests/list groups interests under categories in some deployments;
    // flatten so the picker has one list either way.
    z.array(z.object({ interests: z.array(interestSchema) }).passthrough()),
  ])
  .transform((v) => {
    if (Array.isArray(v)) {
      const first = v[0] as Record<string, unknown> | undefined;
      if (first && Array.isArray(first.interests)) {
        return (v as Array<{ interests: z.infer<typeof interestSchema>[] }>).flatMap(
          (c) => c.interests
        );
      }
      return v as z.infer<typeof interestSchema>[];
    }
    return v.items;
  });

export async function fetchInterests() {
  return interestListSchema.parse(await api.get<unknown>("/api/v1/interests/list"));
}
