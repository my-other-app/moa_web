import { z } from "zod";

import { FIELD_TYPES, type EventFormValues, type FieldType } from "./schemas";

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
    url: z.string().nullish(),
    is_online: z.boolean().nullish(),
    has_fee: z.boolean().nullish(),
    reg_fee: z.coerce.number().nullish(),
    has_prize: z.boolean().nullish(),
    prize_amount: z.coerce.number().nullish(),
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
    url: d.url ?? "",

    has_fee: d.has_fee ?? false,
    reg_fee: d.reg_fee ?? undefined,
    has_prize: d.has_prize ?? false,
    prize_amount: d.prize_amount ?? undefined,
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
      photo_url: photoUrlOf(s.photo),
    })),
  };
}
