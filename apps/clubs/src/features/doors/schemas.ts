import { pictureSchema } from "@moa/app-kit";
import { z } from "zod";

export const DOOR_KINDS = ["door", "desk", "kiosk"] as const;
export type DoorKind = (typeof DOOR_KINDS)[number];
export const DOOR_KIND_META: Record<DoorKind, { label: string; note: string }> = {
  door: { label: "Door", note: "Volunteers scan here. Walk-ups too, if switched on." },
  desk: { label: "Desk", note: "Spot registrations are admitted here — no QR to scan." },
  kiosk: { label: "Kiosk station", note: "Guests check themselves in. A paired kiosk stands here." },
};

export const VIA_LABEL: Record<string, string> = {
  gate: "Scanned at a door",
  kiosk: "Self check-in kiosk",
  walkup: "Walk-up at the door",
  offline_sync: "Scanned offline",
  desk: "By hand at the desk",
  phone: "From their phone",
  app: "Volunteer app",
};

export const doorSchema = z.object({
  id: z.string(),
  event_id: z.number(),
  name: z.string(),
  kind: z.enum(DOOR_KINDS),
  sort_order: z.number(),
  active: z.boolean(),
  volunteers: z.array(z.object({ id: z.number(), name: z.string() })).default([]),
  check_ins: z.number().default(0),
  link: z.object({ prefix: z.string(), can_walkup: z.boolean(), expires_at: z.string().nullish(), expired: z.boolean() }).nullable(),
  created_at: z.string().nullish(),
});
export type Door = z.infer<typeof doorSchema>;

export const linkSchema = z.object({ url: z.string(), key: z.string(), door_id: z.string(), expires_at: z.string().nullish(), can_walkup: z.boolean() });
export type GateLink = z.infer<typeof linkSchema>;

export const teamVolunteerSchema = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string().nullish(),
  user_id: z.number().nullish(),
  is_approved: z.boolean(),
  scope: z.enum(["event", "club"]),
  can_check_in: z.boolean(),
  can_walkup: z.boolean(),
  can_merch: z.boolean(),
  door_id: z.string().nullish(),
  check_ins: z.number().default(0),
  /** Their photo, else the avatar they picked (resolved by the API); null for an invite not yet accepted. */
  avatar: pictureSchema,
});
export type TeamVolunteer = z.infer<typeof teamVolunteerSchema>;

export const gateSettingsSchema = z.object({
  door_mode: z.enum(["open", "auto", "closed"]),
  close_after_minutes: z.number(),
  spot_registration_checks_in: z.boolean(),
  capture_contact_at_gate: z.boolean(),
  require_contact_at_gate: z.boolean(),
});
export type GateSettings = z.infer<typeof gateSettingsSchema>;

export const teamSchema = z.object({
  owner: z.object({ name: z.string(), email: z.string().nullish() }),
  volunteers: z.array(teamVolunteerSchema),
  doors: z.array(doorSchema),
  settings: gateSettingsSchema,
});
export type Team = z.infer<typeof teamSchema>;

export const checkInRowSchema = z.object({
  id: z.string(),
  registration_id: z.string(),
  name: z.string(),
  email: z.string().nullish(),
  ticket_id: z.string(),
  role: z.string(),
  door: z.object({ id: z.string().nullable(), name: z.string(), kind: z.string() }),
  via: z.string(),
  checked_in_at: z.string(),
  recorded_at: z.string(),
  by: z.object({ kind: z.string(), id: z.number().nullable(), name: z.string().nullable() }),
});
export type CheckInRow = z.infer<typeof checkInRowSchema>;

export const checkInLogSchema = z.object({
  items: z.array(checkInRowSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  facets: z.object({
    total: z.number(),
    doors: z.array(z.object({ id: z.string().nullable(), name: z.string(), kind: z.string(), count: z.number() })),
    methods: z.array(z.object({ via: z.string(), count: z.number() })),
    staff: z.array(z.object({ id: z.number(), name: z.string().nullable(), count: z.number() })),
    first_at: z.string().nullish(),
    last_at: z.string().nullish(),
  }),
});
export type CheckInLog = z.infer<typeof checkInLogSchema>;
