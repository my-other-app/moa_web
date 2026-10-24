import { z } from "zod";

export const kioskContextSchema = z.object({
  device: z.object({ id: z.string(), name: z.string(), door: z.string(), expires_at: z.string() }),
  event: z.object({
    id: z.number(),
    name: z.string(),
    org_name: z.string().default(""),
    venue: z.string().nullish(),
    starts_at: z.string().nullish(),
    brand_primary: z.string().default("#1db9a0"),
    poster_url: z.string().nullish(),
    door_open: z.boolean(),
    reprint_policy: z.string().default("anyone"),
    auto_print_badges: z.boolean().default(false),
    has_fee: z.boolean().default(false),
  }),
  self_check_in: z.object({ self_check_in_enabled: z.boolean(), self_check_in_verify: z.string(), self_check_in_print: z.boolean(), has_pin: z.boolean() }),
  counters: z.object({ registered: z.number(), checked_in: z.number(), checked_in_here: z.number() }),
  /** What is still to come today, the running session first: shown while a card prints. */
  agenda: z.array(z.object({ starts_at: z.string(), ends_at: z.string().nullable(), title: z.string(), speaker: z.string().nullable(), location: z.string().nullable(), parallel: z.boolean() })).default([]),
  has_programme: z.boolean().default(false),
});
export type KioskContext = z.infer<typeof kioskContextSchema>;

export const redeemResultSchema = z.object({
  outcome: z.enum(["MATCHED", "NO_MATCH", "WRONG_EVENT", "REVOKED", "UNPAID", "EVENT_NOT_OPEN"]),
  guest: z
    .object({ id: z.string(), first_name: z.string(), display_name: z.string(), role: z.string(), role_label: z.string(), ticket_id: z.string(), already_checked_in: z.boolean(), has_card: z.boolean(), may_print: z.boolean() })
    .nullable(),
  other_event: z.object({ name: z.string(), starts_at: z.string().nullish() }).nullable(),
  redemption_token: z.string().nullable(),
  print_url: z.string().nullable(),
  auto_print: z.boolean().default(false),
});
export type RedeemResult = z.infer<typeof redeemResultSchema>;

export const selfQrSchema = z.object({
  enabled: z.boolean(),
  verify: z.string(),
  print: z.boolean(),
  url: z.string().nullable(),
  expires_at: z.string().nullable(),
  recent: z.array(z.object({ session: z.string(), registration_id: z.string().nullish(), name: z.string(), at: z.string(), print_requested: z.boolean() })),
});

export const staffSchema = z.object({ ok: z.boolean(), device: z.object({ name: z.string(), door: z.string() }), printed_today: z.number(), checked_in_here: z.number(), counters: z.object({ registered: z.number(), checked_in: z.number() }) });
export type StaffInfo = z.infer<typeof staffSchema>;

export const kioskDeviceSchema = z.object({
  id: z.string(),
  event_id: z.number(),
  name: z.string(),
  door_id: z.string().nullish(),
  door_label: z.string(),
  token_prefix: z.string(),
  expires_at: z.string(),
  last_seen_at: z.string().nullish(),
  revoked_at: z.string().nullish(),
  online: z.boolean(),
  active: z.boolean(),
  created_at: z.string().nullish(),
});
export type KioskDevice = z.infer<typeof kioskDeviceSchema>;
export const pairedKioskSchema = z.object({ device: kioskDeviceSchema, token: z.string(), url: z.string() });
export type PairedKiosk = z.infer<typeof pairedKioskSchema>;

export const kioskSettingsSchema = z.object({ self_check_in_enabled: z.boolean(), self_check_in_verify: z.enum(["name", "email", "phone"]), self_check_in_print: z.boolean(), has_pin: z.boolean() });
export type KioskSettings = z.infer<typeof kioskSettingsSchema>;

export type VerifyBy = "name" | "email" | "phone";
export const VERIFY_META: Record<VerifyBy, { label: string; note: string; available: boolean }> = {
  name: { label: "Name only", note: "Anyone who knows a guest's name can check in as them. For free, low-stakes meet-ups.", available: true },
  email: { label: "Code by email", note: "A six-digit code goes to the email on the guest list.", available: true },
  phone: { label: "Code by SMS or WhatsApp", note: "Needs an SMS or WhatsApp provider, which is not set up yet.", available: false },
};

export const newRef = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);
