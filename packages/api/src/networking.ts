import { z } from "zod";

/**
 * Profiles and event networking (feature-register/profiles-networking-contract.md),
 * as the dashboards read it: the club's per-event counts, the admin's
 * platform summary, and the profile a report points at.
 *
 * Parsed tolerantly on purpose. The dashboards may deploy before the
 * backend that serves these, and a field the backend renames or drops must
 * cost one figure on screen, never the page around it: an absent or odd
 * count reads 0, an absent list reads empty.
 */

/** A count from the server: a whole number, never below zero; absent or odd, 0. */
const count = z.coerce
  .number()
  .catch(0)
  .transform((v) => (Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0));

/** Text that may be missing: absent, null or not a string reads null. */
const text = z
  .string()
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);

/** A list whose bad items are dropped one by one rather than failing the lot. */
const tolerantList = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .default([])
    .transform((list) =>
      list.flatMap((raw) => {
        const r = item.safeParse(raw);
        return r.success ? [r.data as z.output<T>] : [];
      })
    );

// ─── GET /events/{event_id}/networking/stats (club: owner, admin, editor, door) ───

export const networkingHourSchema = z.object({
  /** The hour's start, with its offset: "2026-11-28T10:00:00+05:30". */
  hour: z.string().min(1),
  saves: count,
});
export type NetworkingHour = z.infer<typeof networkingHourSchema>;

/** One event's networking, in counts only: never a name. */
export const networkingStatsSchema = z.object({
  checked_in: count,
  /** Checked-in guests who saved someone or were saved at this event. */
  people_networked: count,
  saves: count,
  /** Pairs who saved each other. */
  mutual_pairs: count,
  by_hour: tolerantList(networkingHourSchema),
});
export type NetworkingStats = z.infer<typeof networkingStatsSchema>;

// ─── GET /admin/networking/summary ───────────────────────────────────────────

/** A percentage, 0 to 100 (the backend's convention for a `_rate`); absent or odd, null. */
const percent = z
  .number()
  .nullish()
  .catch(null)
  .transform((v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.min(100, Math.max(0, v))));

export const networkingSummarySchema = z.object({
  profiles_completed: count,
  profiles_total: count,
  /** Personal QR codes in use (not replaced). */
  codes_active: count,
  saves_7d: count,
  saves_30d: count,
  /** Of the saves, the share that are mutual, as a percentage. */
  mutual_rate: percent,
  /** Open reports on profiles. */
  reports_open: count,
});
export type NetworkingSummary = z.infer<typeof networkingSummarySchema>;

// ─── AdminReport.profile (reports with target_type=profile) ──────────────────

/** The reports queue's name for a reported profile. */
export const PROFILE_TARGET_TYPE = "profile" as const;

export const reportedProfileLinkSchema = z.object({
  id: z.coerce.number(),
  type: z.string().catch("other"),
  url: z.string().catch(""),
  label: text,
});
export type ReportedProfileLink = z.infer<typeof reportedProfileLinkSchema>;

export const reportedProfileProjectSchema = z.object({
  id: z.coerce.number(),
  title: z.string().catch(""),
  url: text,
});
export type ReportedProfileProject = z.infer<typeof reportedProfileProjectSchema>;

/**
 * The profile a report is about, as moderation needs it: its owner, its
 * handle, whether it is hidden, and the links and projects an admin may
 * take down one by one.
 */
export const reportedProfileSchema = z.object({
  user_id: z.coerce.number(),
  handle: z.string().catch(""),
  /** Hidden by an admin (suspended_at set): the profile, its vCard and its code all 404. */
  suspended: z.boolean().catch(false).default(false),
  links: tolerantList(reportedProfileLinkSchema),
  projects: tolerantList(reportedProfileProjectSchema),
});
export type ReportedProfile = z.infer<typeof reportedProfileSchema>;

/** AdminReport.profile: set only on a profile's reports; absent (an older server) or malformed, null. */
export const reportedProfileField = reportedProfileSchema
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);
