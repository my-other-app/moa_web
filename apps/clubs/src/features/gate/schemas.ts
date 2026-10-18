import { z } from "zod";

/** The door's answers, as the server speaks them (snake_case, like the rest of the event API). */
export const SCAN_OUTCOMES = ["CHECKED_IN", "ALREADY_CHECKED_IN", "WRONG_EVENT", "REVOKED", "UNPAID", "INVALID", "EVENT_NOT_OPEN"] as const;
export type ScanOutcome = (typeof SCAN_OUTCOMES)[number];

/**
 * INVALID with this hint: the code was the admission number printed beside
 * the QR, not a ticket. Nobody was admitted; `attendee` is who holds it, for
 * staff to confirm and check in by hand. Absent on an API from before.
 */
export const ADMISSION_NUMBER_HINT = "ADMISSION_NUMBER";

export const attendeeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  ticket_id: z.string(),
  role: z.string(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  has_contact: z.boolean().default(false),
  is_paid: z.boolean().default(true),
  checked_in_at: z.string().nullish(),
  badge_printed_at: z.string().nullish(),
  admission_no: z.string().nullish(),
});
export type AttendeeSummary = z.infer<typeof attendeeSummarySchema>;

export const scanResultSchema = z.object({
  outcome: z.enum(SCAN_OUTCOMES),
  attendee: attendeeSummarySchema.nullable(),
  checked_in_at: z.string().nullable(),
  checked_in_by: z.object({ name: z.string(), door: z.string() }).nullable(),
  other_event: z.object({ name: z.string(), starts_at: z.string().nullish() }).nullable(),
  revoked_at: z.string().nullable(),
  capture: z.object({ ask: z.boolean(), required: z.boolean(), reason: z.string() }),
  replayed: z.boolean().default(false),
  /** What the console should do about the ID card. */
  badge: z.object({ auto: z.boolean(), may_print: z.boolean(), printed_at: z.string().nullish(), policy: z.string() }).default({ auto: false, may_print: false, printed_at: null, policy: "anyone" }),
  /** Why a refusal is what it is, when the server says: ADMISSION_NUMBER_HINT. */
  hint: z.string().nullish(),
});
export type ScanResult = z.infer<typeof scanResultSchema>;

export const scanBatchResultSchema = z.object({
  results: z.array(z.object({ client_ref: z.string(), response: scanResultSchema })),
});

export const walkupResultSchema = z.object({
  outcome: z.enum(["REGISTERED", "DUPLICATE", "EVENT_NOT_OPEN"]),
  attendee: attendeeSummarySchema.nullable(),
  duplicate_of: z.object({ id: z.string(), name: z.string() }).nullable(),
  duplicate_by: z.enum(["CONTACT", "NAME"]).nullable(),
  checked_in: z.boolean().default(false),
  ticket_sent: z.boolean().default(false),
});
export type WalkupResult = z.infer<typeof walkupResultSchema>;

export const doorOptionSchema = z.object({ id: z.string(), name: z.string(), kind: z.string() });

export const gateContextSchema = z.object({
  event: z.object({
    id: z.number(),
    name: z.string(),
    code: z.string(),
    org_name: z.string().default(""),
    door_open: z.boolean(),
    door_mode: z.string(),
    close_after_minutes: z.number(),
    spot_registration_checks_in: z.boolean(),
    capture_contact_at_gate: z.boolean(),
    require_contact_at_gate: z.boolean(),
    has_fee: z.boolean().default(false),
    starts_at: z.string().nullish(),
    ticket_example: z.string().default("MOA-XXXXX-XXXXX"),
    auto_print_badges: z.boolean().default(false),
    reprint_policy: z.string().default("anyone"),
  }),
  permissions: z.object({ check_in: z.boolean(), walkup: z.boolean(), merch: z.boolean(), full: z.boolean() }),
  counters: z.object({ registered: z.number(), checked_in: z.number() }),
  walkup_roles: z.array(z.string()),
  doors: z.array(doorOptionSchema),
  expected_door_id: z.string().nullable(),
  guest_fields: z.array(z.object({ key: z.string(), label: z.string(), field_type: z.string().optional(), options: z.array(z.string()).optional(), required: z.boolean().optional() }).passthrough()),
  me: z.object({ name: z.string(), kind: z.enum(["user", "door"]) }),
  /** Whether there is anything to hand out; the console shows the merch tab only then. */
  has_merch: z.boolean().default(false),
  /** Whether the event sells merchandise: the walk-up form shows the shelf, and the merch tab shows paid orders. */
  has_store: z.boolean().default(false),
});
export type GateContext = z.infer<typeof gateContextSchema>;

export const captureResultSchema = z.object({ phone: z.string(), shared_with: z.array(z.string()).default([]) });

export interface ScanBody {
  code: string;
  door?: string | null;
  scanned_at: string;
  client_ref: string;
}

export interface WalkupBody {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  /** The event's own questions; a several-choices one answered with more than one tick is a list. */
  custom_fields?: Record<string, string | string[]>;
  confirm_new?: boolean;
  door?: string | null;
  client_ref: string;
  /** What they take from the shelf, paid at the desk with the ticket. */
  store?: { item_id: string; variant_id: string | null; qty: number }[];
}

export const gateStoreOrderSchema = z.object({
  id: z.string(),
  guest: z.string(),
  status: z.string(),
  total: z.number(),
  summary: z.string(),
  lines: z.array(z.object({ item_name: z.string(), variant_label: z.string().nullable(), qty: z.number(), is_free: z.boolean() })),
  handed_over_at: z.string().nullable(),
});
export type GateStoreOrder = z.infer<typeof gateStoreOrderSchema>;

export const gateCatalogSchema = z.object({
  enabled: z.boolean(),
  items: z.array(z.object({ id: z.string(), name: z.string(), price: z.number(), left: z.number().nullable(), variants: z.array(z.object({ id: z.string(), label: z.string(), left: z.number() })) })),
});
export type GateCatalog = z.infer<typeof gateCatalogSchema>;

export const ROLE_LABEL: Record<string, string> = { attendee: "Attendee", speaker: "Speaker", staff: "Staff" };

export const newRef = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
