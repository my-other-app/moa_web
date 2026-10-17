import { z } from "zod";

import { pinFormShape, refinePin } from "@/features/venue";

/** Mirrors the backend's FieldTypes enum (app/api/events/schemas.py). */
export const FIELD_TYPES = [
  "text",
  "number",
  "email",
  "url",
  "tel",
  "date",
  "time",
  "datetime",
  "checkbox",
  "radio",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** A custom registration question — one entry of `additional_details`. */
export const questionSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, "Required")
      .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers and underscores only"),
    label: z.string().trim().min(1, "Give the question a label"),
    field_type: z.enum(FIELD_TYPES),
    required: z.boolean().default(true),
    options: z.array(z.string().trim().min(1)).optional(),
  })
  .superRefine((value, ctx) => {
    // radio and checkbox are meaningless without choices, and the attendee
    // would be shown an unanswerable question.
    if ((value.field_type === "radio" || value.field_type === "checkbox") && !value.options?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Add at least one option for this field type",
      });
    }
  });

/** The most a speaker's short bio may run to; the server refuses more. */
export const SPEAKER_BIO_MAX = 600;

export const speakerSchema = z.object({
  id: z.number().optional(),
  name: z.string().trim().min(1, "Speaker name is required").max(100),
  designation: z.string().trim().max(200).optional(),
  /** A few lines on who they are, under their name on the event page. */
  bio: z.string().trim().max(SPEAKER_BIO_MAX, `Keep the bio to ${SPEAKER_BIO_MAX} characters`).optional(),
  /** Where to read more about them: a profile, a site. http(s) only, as the server accepts. */
  link: z
    .string()
    .trim()
    .url("Paste the full link, starting https://")
    .refine((v) => /^https?:\/\//i.test(v), "Paste the full link, starting https://")
    .or(z.literal(""))
    .optional(),
  /** Existing photo kept on edit; a newly picked File is held separately. */
  photo_url: z.string().nullish(),
  photoFile: z.instanceof(File).optional(),
});

export const eventFormSchema = z
  .object({
    // --- basics
    name: z.string().trim().min(3, "At least 3 characters").max(100),
    category_id: z.coerce.number({ invalid_type_error: "Choose a category" }).int().positive("Choose a category"),
    about: z.string().trim().max(5000).optional(),
    event_tag: z.string().trim().max(50).optional(),
    posterFile: z.instanceof(File).optional(),
    interest_ids: z.array(z.number()).default([]),

    // --- schedule
    event_datetime: z.string().min(1, "Pick a date and time"),
    duration: z.coerce.number().positive("Duration must be greater than zero"),
    reg_startdate: z.string().optional(),
    reg_enddate: z.string().optional(),

    // --- place
    is_online: z.boolean().default(false),
    location_name: z.string().trim().max(200).optional(),
    /** The venue on Google Maps; it puts the event on the map for "near you" on the events site. */
    location_link: z.string().trim().url("Paste the full map link").or(z.literal("")).optional(),
    /**
     * The venue's pin: lat/lng, where it came from, and whether to drop one
     * the club set. Picked from the venue search or set by hand; see
     * pinWireFields for what a save sends.
     */
    ...pinFormShape,
    url: z.string().trim().url("Enter a full URL").or(z.literal("")).optional(),

    // --- entry
    has_fee: z.boolean().default(false),
    reg_fee: z.coerce.number().nonnegative().optional(),
    has_prize: z.boolean().default(false),
    prize_amount: z.coerce.number().nonnegative().optional(),
    max_participants: z.coerce.number().int().positive().optional(),
    /** Sell merchandise at registration, paid with the ticket. */
    merch_enabled: z.boolean().default(false),
    /** Free giveaways counted out at the door. */
    swag_enabled: z.boolean().default(false),

    // --- contact
    contact_name: z.string().trim().max(100).optional(),
    contact_phone: z.string().trim().max(20).optional(),
    contact_email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),

    event_guidelines: z.string().trim().max(5000).optional(),
    additional_details: z.array(questionSchema).default([]),
    speakers: z.array(speakerSchema).default([]),
  })
  .superRefine((value, ctx) => {
    refinePin(value, ctx);
    // An online event with no joining link, or a physical one with no venue,
    // is unusable for the attendee even though the API accepts both.
    if (value.is_online && !value.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "Online events need a joining link",
      });
    }
    if (!value.is_online && !value.location_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["location_name"],
        message: "Add a venue, or mark the event as online",
      });
    }
    if (value.has_fee && !(value.reg_fee && value.reg_fee > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reg_fee"],
        message: "Set the fee amount",
      });
    }
    if (value.has_prize && !(value.prize_amount && value.prize_amount > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prize_amount"],
        message: "Set the prize amount",
      });
    }
    // Registration closing after the event starts lets people register for
    // something already under way.
    if (value.reg_enddate && value.event_datetime && value.reg_enddate > value.event_datetime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reg_enddate"],
        message: "Registration must close before the event starts",
      });
    }
    if (value.reg_startdate && value.reg_enddate && value.reg_startdate >= value.reg_enddate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reg_enddate"],
        message: "Registration must close after it opens",
      });
    }
    // Duplicate keys would silently overwrite each other in the stored JSON.
    const keys = value.additional_details.map((q) => q.key);
    const dupe = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dupe) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["additional_details"],
        message: `Duplicate question key “${dupe}”`,
      });
    }
  });

export type EventFormValues = z.input<typeof eventFormSchema>;
export type EventFormParsed = z.output<typeof eventFormSchema>;
