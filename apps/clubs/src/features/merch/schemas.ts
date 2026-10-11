import { z } from "zod";

export const merchVariantSchema = z.object({ id: z.string(), label: z.string(), stock: z.number(), collected: z.number() });
export type MerchVariant = z.infer<typeof merchVariantSchema>;

export const merchItemSchema = z.object({
  id: z.string(),
  event_id: z.number(),
  name: z.string(),
  photo_key: z.string().nullable(),
  photo_url: z.string().nullable(),
  /** Null when variants exist; stock then lives per variant. */
  stock: z.number().nullable(),
  collected: z.number(),
  total: z.number(),
  eligibility_field: z.string().nullable(),
  eligibility_value: z.string().nullable(),
  variant_field: z.string().nullable(),
  variants: z.array(merchVariantSchema),
  created_at: z.string().nullish(),
});
export type MerchItem = z.infer<typeof merchItemSchema>;

export const merchFieldSchema = z.object({ name: z.string(), key: z.string(), kind: z.enum(["role", "choice", "text"]), values: z.array(z.string()) });
export type MerchField = z.infer<typeof merchFieldSchema>;

export interface MerchItemInput {
  name: string;
  photo_key?: string | null;
  stock?: number | null;
  eligibility_field?: string | null;
  eligibility_value?: string | null;
  variant_field?: string | null;
  variants?: { label: string; stock: number }[];
}

export const MERCH_STATUSES = ["COLLECTABLE", "ALREADY_COLLECTED", "NOT_ELIGIBLE", "NO_VARIANT_VALUE", "NO_MATCHING_VARIANT", "OUT_OF_STOCK"] as const;
export type MerchStatus = (typeof MERCH_STATUSES)[number];

export const merchStatusRowSchema = z.object({
  item_id: z.string(),
  name: z.string(),
  photo_url: z.string().nullable(),
  status: z.enum(MERCH_STATUSES),
  variant_label: z.string().nullable(),
  remaining: z.number().nullable(),
  on_file: z.string().nullable(),
  choices: z.array(z.object({ label: z.string(), remaining: z.number() })),
});
export type MerchStatusRow = z.infer<typeof merchStatusRowSchema>;

export const attendeeMerchSchema = z.object({
  attendee: z.object({ id: z.string(), name: z.string(), ticket_id: z.string(), role: z.string(), role_label: z.string() }),
  items: z.array(merchStatusRowSchema),
});
export type AttendeeMerch = z.infer<typeof attendeeMerchSchema>;

export const collectResultSchema = z.object({ status: z.enum(MERCH_STATUSES), collected: z.boolean(), variant_label: z.string().nullable(), remaining: z.number().nullable() });
export type CollectResult = z.infer<typeof collectResultSchema>;

export const merchLogRowSchema = z.object({
  id: z.string(),
  registration_id: z.string(),
  name: z.string(),
  ticket_id: z.string(),
  role: z.string(),
  item: z.object({ id: z.string(), name: z.string() }),
  variant: z.object({ id: z.string(), label: z.string() }).nullable(),
  door: z.object({ id: z.string().nullable(), name: z.string(), kind: z.string() }).nullable(),
  collected_at: z.string(),
  by: z.object({ kind: z.string(), id: z.number().nullable(), name: z.string().nullable() }),
});
export type MerchLogRow = z.infer<typeof merchLogRowSchema>;

export const merchLogSchema = z.object({
  items: z.array(merchLogRowSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  facets: z.object({
    total: z.number(),
    items: z.array(z.object({ id: z.string(), name: z.string(), count: z.number() })),
    variants: z.array(z.object({ id: z.string(), item_id: z.string(), label: z.string(), count: z.number() })),
    doors: z.array(z.object({ id: z.string().nullable(), name: z.string(), kind: z.string(), count: z.number() })),
    staff: z.array(z.object({ id: z.number(), name: z.string().nullable(), count: z.number() })),
    without_door: z.number(),
    first_at: z.string().nullable(),
    last_at: z.string().nullable(),
  }),
});
export type MerchLog = z.infer<typeof merchLogSchema>;

export const merchAnalyticsSchema = z.object({
  collectors: z.number(),
  handovers: z.number(),
  by_item: z.array(z.object({ id: z.string(), name: z.string(), collected: z.number(), stock: z.number().nullable(), variants: z.array(z.object({ id: z.string(), label: z.string(), collected: z.number(), stock: z.number().nullable() })) })),
  by_door: z.array(z.object({ id: z.string().nullable(), name: z.string(), count: z.number() })),
  by_hour: z.array(z.object({ hour: z.string(), count: z.number() })),
});
export type MerchAnalytics = z.infer<typeof merchAnalyticsSchema>;

/** What the gate says about a status that is not collectable. */
export const STATUS_COPY: Record<Exclude<MerchStatus, "COLLECTABLE">, { note: string; chip: string | null }> = {
  ALREADY_COLLECTED: { note: "Already collected", chip: "Collected" },
  NOT_ELIGIBLE: { note: "Not eligible for this item", chip: null },
  NO_VARIANT_VALUE: { note: "No size on file — ask them, and tap it.", chip: "No size" },
  NO_MATCHING_VARIANT: { note: "Their size isn’t one of the options — pick what they take.", chip: "No match" },
  OUT_OF_STOCK: { note: "Out of stock in their size", chip: "None left" },
};
