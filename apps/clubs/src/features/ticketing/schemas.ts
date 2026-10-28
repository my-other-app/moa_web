import { z } from "zod";

/**
 * Ticket types, discount codes and waiting lists, as the club's API sends
 * them (the backend's docs/TICKETING.md, §8).
 *
 * Every event has at least one ticket type. While it has only its default
 * one, that type *follows the event*: its price is the event's fee and its
 * places the event's own `max_participants`, so the event form's "Places"
 * and "Paid entry" are what it sells. With several types each has its own
 * price and places, and the event's `max_participants` is an optional total
 * across them.
 *
 * Money is rupees. The server works out every price; nothing here is sent
 * to the payment.
 */

const num = z.coerce.number();
const optionalNum = z.coerce.number().nullish().transform((v) => v ?? null);
const optionalText = z.string().nullish().transform((v) => v ?? null);

// ─── Ticket types ───────────────────────────────────────────────────────

export const ticketTypeSchema = z.object({
  id: num,
  name: z.string(),
  description: optionalText,
  price: num.catch(0),
  capacity: optionalNum,
  sales_start: optionalText,
  sales_end: optionalText,
  is_hidden: z.boolean().catch(false),
  per_person_limit: optionalNum,
  sort_order: num.catch(0),
  is_default: z.boolean().catch(false),
  /** Holding a place now: paid, or confirmed with nothing to pay. */
  sold: num.catch(0),
  /** Left for someone new (null: no cap). */
  available: optionalNum,
  waiting: num.catch(0),
  offered: num.catch(0),
  /** Someone holds a ticket of it: it can be hidden, not removed. */
  has_registrations: z.boolean().catch(false),
});
export type TicketType = z.infer<typeof ticketTypeSchema>;

export const ticketTypesSchema = z.object({
  types: z.array(ticketTypeSchema),
  /** One type, the default: its price and places are the event's own. */
  follows_event: z.boolean().catch(true),
  event_capacity: optionalNum,
  event_available: optionalNum,
  /** The plan's cap on types per event (null: none). */
  max_types: optionalNum,
});
export type TicketTypes = z.infer<typeof ticketTypesSchema>;

export const typeSalesSchema = z.object({
  id: num,
  name: z.string(),
  price: num.catch(0),
  capacity: optionalNum,
  is_hidden: z.boolean().catch(false),
  sold: num.catch(0),
  paid: num.catch(0),
  revenue: num.catch(0),
  pending: num.catch(0),
  discount_total: num.catch(0),
  available: optionalNum,
  waiting: num.catch(0),
  offered: num.catch(0),
  /**
   * Places held for people the club confirmed on an event that confirms each
   * registration, until they pay: not the waiting list's offers. Null from a
   * server that doesn't count them apart.
   */
  held: optionalNum.catch(null),
});
export type TypeSales = z.infer<typeof typeSalesSchema>;

export const salesSchema = z.object({
  types: z.array(typeSalesSchema),
  totals: z.record(z.string(), z.number()).catch({}),
  codes: z.array(z.object({ id: num, code: z.string(), uses: num.catch(0), discount_total: num.catch(0) })).catch([]),
  event_capacity: optionalNum,
  event_available: optionalNum,
  waitlist_enabled: z.boolean().catch(false),
});
export type Sales = z.infer<typeof salesSchema>;

/** Whether an event's overview should show its tickets: more than the one type, or a code used, or a waiting list. */
export function salesWorthShowing(s: Sales): boolean {
  return s.types.length > 1 || s.codes.length > 0 || s.waitlist_enabled || s.types.some((t) => t.waiting > 0 || t.offered > 0 || (t.held ?? 0) > 0);
}

/** Whether the server counts held places apart (any type carries `held`). */
export const salesShowHeld = (s: Sales): boolean => s.types.some((t) => t.held !== null);

// ─── Discount codes ─────────────────────────────────────────────────────

export const CODE_KINDS = ["percent", "amount"] as const;
export type CodeKind = (typeof CODE_KINDS)[number];

export const CODE_STATUSES = ["active", "scheduled", "expired", "used_up", "inactive"] as const;
export type CodeStatus = (typeof CODE_STATUSES)[number];

export const CODE_STATUS_LABEL: Record<CodeStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  used_up: "Used up",
  inactive: "Off",
};

export const discountCodeSchema = z.object({
  id: num,
  code: z.string(),
  kind: z.enum(CODE_KINDS).catch("percent"),
  value: num.catch(0),
  event_id: optionalNum,
  event_name: optionalText,
  ticket_type_ids: z.array(num).nullish().transform((v) => v ?? null),
  starts_at: optionalText,
  ends_at: optionalText,
  max_uses: optionalNum,
  per_person_limit: optionalNum,
  is_active: z.boolean().catch(true),
  uses: num.catch(0),
  discount_total: num.catch(0),
  status: z.enum(CODE_STATUSES).catch("active"),
  created_at: optionalText,
});
export type DiscountCode = z.infer<typeof discountCodeSchema>;
export const discountCodesSchema = z.array(discountCodeSchema);

/** "20% off", "₹100 off". */
export function codeValueText(c: Pick<DiscountCode, "kind" | "value">): string {
  return c.kind === "percent" ? `${trimNumber(c.value)}% off` : `${rupees(c.value)} off`;
}

/** "3 of 50", "3 used". */
export function usesText(c: Pick<DiscountCode, "uses" | "max_uses">): string {
  return c.max_uses ? `${c.uses.toLocaleString("en-IN")} of ${c.max_uses.toLocaleString("en-IN")}` : `${c.uses.toLocaleString("en-IN")} used`;
}

/** What a club types: letters and digits, no spaces, kept upper case (the server does the same). */
export function normaliseCode(text: string): string {
  return text.replace(/\s+/g, "").toUpperCase().slice(0, 40);
}

const emptyToUndefined = (v: unknown) => (v === "" || v === null || (typeof v === "number" && Number.isNaN(v)) ? undefined : v);

export const codeFormSchema = z
  .object({
    code: z.string().transform(normaliseCode).pipe(z.string().min(3, "At least 3 letters or digits").regex(/^[A-Z0-9_-]+$/, "Letters, digits, - and _ only")),
    kind: z.enum(CODE_KINDS),
    value: z.preprocess(emptyToUndefined, z.coerce.number({ required_error: "How much off?", invalid_type_error: "How much off?" }).positive("More than nothing")),
    /** "" for every event of the club. */
    event_id: z.string().default(""),
    ticket_type_ids: z.array(z.number()).default([]),
    starts_at: z.string().default(""),
    ends_at: z.string().default(""),
    max_uses: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1, "At least 1").optional()),
    per_person_limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1, "At least 1").optional()),
    is_active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "percent" && v.value > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "At most 100%" });
    if (v.starts_at && v.ends_at && v.ends_at <= v.starts_at) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ends_at"], message: "Must end after it starts" });
  });
export type CodeFormInput = z.input<typeof codeFormSchema>;
export type CodeForm = z.output<typeof codeFormSchema>;

// ─── Waiting lists ──────────────────────────────────────────────────────

export const ENTRY_STATUSES = ["waiting", "offered", "claimed", "expired", "removed", "left"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  waiting: "Waiting",
  offered: "Offered",
  claimed: "Claimed",
  expired: "Offer ran out",
  removed: "Removed",
  left: "Left",
};

export const waitlistEntrySchema = z.object({
  id: z.string(),
  ticket_type_id: num,
  ticket_type_name: optionalText,
  full_name: z.string(),
  email: optionalText,
  phone: optionalText,
  user_id: optionalNum,
  whatsapp_opt_in: z.boolean().catch(false),
  status: z.enum(ENTRY_STATUSES).catch("waiting"),
  position: optionalNum,
  offered_at: optionalText,
  offer_expires_at: optionalText,
  offers_made: num.catch(0),
  registration_id: optionalText,
  created_at: z.string(),
  closed_at: optionalText,
  /** The claim link of the standing offer, for the club to pass on. */
  offer_url: optionalText,
});
export type WaitlistEntry = z.infer<typeof waitlistEntrySchema>;

export const waitlistSettingsSchema = z.object({
  enabled: z.boolean().catch(false),
  offer_hours: num.catch(24),
  /** The club's plan has the waiting list. */
  allowed: z.boolean().catch(true),
});
export type WaitlistSettings = z.infer<typeof waitlistSettingsSchema>;

export const waitlistSchema = z.object({
  settings: waitlistSettingsSchema,
  counts: z.record(z.string(), z.number()).catch({}),
  entries: z.array(waitlistEntrySchema),
  total: num.catch(0),
});
export type Waitlist = z.infer<typeof waitlistSchema>;

/** How long an offer may hold a place, in hours, as the server takes it. */
export const OFFER_HOURS = { min: 1, max: 168 } as const;

// ─── The event form's editor ────────────────────────────────────────────

export const DEFAULT_TYPE_NAME = "General admission";

/** One type as the event form edits it: numbers as typed, windows as datetime-local. */
export const ticketTypeDraftSchema = z
  .object({
    id: z.number().optional(),
    name: z.string().trim().min(1, "Name this ticket").max(80, "At most 80 characters"),
    description: z.string().trim().max(500, "At most 500 characters").optional(),
    price: z.preprocess((v) => emptyToUndefined(v) ?? 0, z.coerce.number({ invalid_type_error: "Enter a price" }).nonnegative("Can't be below 0").max(1_000_000, "That is a lot: check the price")),
    capacity: z.preprocess(emptyToUndefined, z.coerce.number().int("Whole places").nonnegative("Can't be below 0").optional()),
    sales_start: z.string().optional(),
    sales_end: z.string().optional(),
    is_hidden: z.boolean().optional(),
    per_person_limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1, "At least 1").max(100, "At most 100").optional()),
    /** From the server, read only. */
    sold: z.number().optional(),
    has_registrations: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.sales_start && v.sales_end && v.sales_end <= v.sales_start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sales_end"], message: "Sales must end after they start" });
    }
  });
export type TicketTypeDraft = z.input<typeof ticketTypeDraftSchema>;

/** A server time as the datetime-local input shows it, in the browser's zone (as the event's own times are). */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function draftOf(t: TicketType): TicketTypeDraft {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? "",
    price: t.price,
    capacity: t.capacity ?? undefined,
    sales_start: toLocalInput(t.sales_start),
    sales_end: toLocalInput(t.sales_end),
    is_hidden: t.is_hidden,
    per_person_limit: t.per_person_limit ?? undefined,
    sold: t.sold,
    has_registrations: t.has_registrations,
  };
}

/** The event form's starting point for its types: undefined when the server has none to offer (left alone then). */
export function formDefaultsFrom(types: TicketTypes | null | undefined): { several_types?: boolean; ticket_types?: TicketTypeDraft[] } {
  if (!types) return {};
  return { several_types: types.types.length > 1, ticket_types: types.types.map(draftOf) };
}

/** A blank new type for the editor. */
export function blankType(): TicketTypeDraft {
  return { name: "", description: "", price: 0, capacity: undefined, sales_start: "", sales_end: "", is_hidden: false, per_person_limit: undefined };
}

/** What the event form holds that saving its types reads. */
export interface TicketFormValues {
  has_fee?: boolean;
  reg_fee?: unknown;
  max_participants?: unknown;
  several_types?: boolean;
  ticket_types?: TicketTypeDraft[];
}

export interface TicketTypeItemBody {
  id?: number;
  name: string;
  description: string | null;
  price: number;
  capacity: number | null;
  sales_start: string | null;
  sales_end: string | null;
  is_hidden: boolean;
  per_person_limit: number | null;
}

export interface SaveTypesBody {
  types: TicketTypeItemBody[];
  event_capacity?: number | null;
}

const asNumber = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

function itemOf(t: TicketTypeDraft): TicketTypeItemBody {
  return {
    ...(t.id !== undefined ? { id: t.id } : {}),
    name: (t.name ?? "").trim(),
    description: t.description?.trim() || null,
    price: asNumber(t.price) ?? 0,
    capacity: asNumber(t.capacity),
    sales_start: t.sales_start || null,
    sales_end: t.sales_end || null,
    is_hidden: Boolean(t.is_hidden),
    per_person_limit: asNumber(t.per_person_limit),
  };
}

/**
 * PUT /events/{id}/ticketing/types, from the event form: the types as the
 * editor holds them, with the form's "Places" as the total across them; or,
 * with one kind of ticket, that one type at the event's own fee and places.
 * Null when the form has nothing to say about types (a server without them).
 */
export function saveTypesBody(values: TicketFormValues): SaveTypesBody | null {
  const drafts = values.ticket_types;
  if (drafts === undefined) return null;
  if (values.several_types && drafts.length > 0) {
    return { types: drafts.map(itemOf), event_capacity: asNumber(values.max_participants) };
  }
  const first = drafts[0];
  const price = values.has_fee ? (asNumber(values.reg_fee) ?? 0) : 0;
  return {
    types: [{ ...itemOf(first ?? { name: DEFAULT_TYPE_NAME, price: 0 }), name: (first?.name ?? "").trim() || DEFAULT_TYPE_NAME, price, capacity: asNumber(values.max_participants) }],
  };
}

/**
 * The event's own fee, as its types say: with several, paid when any type
 * is, at the lowest price. Sent with the event, so it never reads as free
 * while its types are being saved.
 */
export function feeFromTypes<T extends TicketFormValues>(values: T): T {
  if (!values.several_types || !values.ticket_types?.length) return values;
  const paid = values.ticket_types.map((t) => asNumber(t.price) ?? 0).filter((p) => p > 0).sort((a, b) => a - b);
  return { ...values, has_fee: paid.length > 0, reg_fee: paid.length ? paid[0] : undefined };
}

// ─── Words ──────────────────────────────────────────────────────────────

const RUPEES = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** ₹250, ₹99.50, Free. */
export function rupees(value: number): string {
  return RUPEES.format(value);
}

export function priceText(value: number): string {
  return value > 0 ? rupees(value) : "Free";
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** "12 of 100 sold", "12 sold". */
export function soldText(sold: number, capacity: number | null): string {
  return capacity === null ? `${sold.toLocaleString("en-IN")} sold` : `${sold.toLocaleString("en-IN")} of ${capacity.toLocaleString("en-IN")} sold`;
}

/** The server's refusals for ticketing, in the club's words. */
export const TICKETING_ERRORS: Record<string, string> = {
  TICKET_TYPE_HAS_REGISTRATIONS: "People hold tickets of that type, so it can't be removed. Hide it instead: nobody else can buy it, and their tickets stay.",
  LAST_TICKET_TYPE: "An event keeps at least one ticket type.",
  DISCOUNT_CODE_TAKEN: "You already have a code with that name.",
  WAITLIST_NO_ROOM: "No place is free. Raise the type's places (or the event's total) first, then offer it.",
};
