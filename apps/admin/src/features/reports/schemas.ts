import { pictureSchema } from "@moa/app-kit";
import { z } from "zod";

/**
 * What app users report (GET /admin/reports): a thread, a comment, a person
 * or a club, for one of seven reasons. App Store guideline 1.2 expects each
 * to be acted on promptly; this is where an admin does.
 *
 * Resolving one report resolves every open report on the same thing, so a
 * comment reported by five people is decided once.
 */
export const TARGET_TYPES = ["thread", "comment", "user", "club"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const REPORT_REASONS = ["spam", "harassment", "hate", "sexual", "violence", "misinformation", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["open", "resolved"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * dismiss         nothing is taken down; the reports are closed
 * remove_content  the thread or comment is taken down (not a user or a club)
 * suspend_author  the author is signed out everywhere and cannot sign back
 *                 in; a reported thread or comment is taken down with it
 */
export const RESOLUTIONS = ["dismiss", "remove_content", "suspend_author"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** Open reports from this many people hide a comment from everyone but its author, until an admin decides. */
export const HIDE_AT = 3;

/** The longest note the server keeps on a resolution. */
export const NOTE_MAX = 500;

/** Severity, by colour: harm to a person reads red, spam amber, a false claim blue, the rest grey. */
export type ReasonTone = "refuse" | "caution" | "info" | "neutral";

export const REASON_META: Record<ReportReason, { label: string; tone: ReasonTone }> = {
  spam: { label: "Spam", tone: "caution" },
  harassment: { label: "Harassment", tone: "refuse" },
  hate: { label: "Hate", tone: "refuse" },
  sexual: { label: "Sexual content", tone: "refuse" },
  violence: { label: "Violence", tone: "refuse" },
  misinformation: { label: "Misinformation", tone: "info" },
  other: { label: "Other", tone: "neutral" },
};

export const TARGET_LABEL: Record<TargetType, string> = {
  thread: "Thread",
  comment: "Comment",
  user: "User",
  club: "Club",
};

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  dismiss: "Dismissed",
  remove_content: "Content removed",
  suspend_author: "Author suspended",
};

const words = (key: string) => key.replace(/_/g, " ");

/** A reason this build has a word for, else the server's own, readable. */
export function reasonLabel(reason: string): string {
  return (REASON_META as Record<string, { label: string }>)[reason]?.label ?? words(reason);
}

export function reasonTone(reason: string): ReasonTone {
  return (REASON_META as Record<string, { tone: ReasonTone }>)[reason]?.tone ?? "neutral";
}

export function targetLabel(type: string): string {
  return (TARGET_LABEL as Record<string, string>)[type] ?? words(type);
}

export function resolutionLabel(resolution: string): string {
  return (RESOLUTION_LABEL as Record<string, string>)[resolution] ?? words(resolution);
}

export function isTargetType(value: string | undefined | null): value is TargetType {
  return (TARGET_TYPES as readonly string[]).includes(value ?? "");
}

const person = z.object({
  id: z.coerce.number(),
  name: z.string().catch(""),
  /** Their picture, resolved by the API: a club account's logo, else their photo, else the avatar they picked. */
  avatar: pictureSchema,
});

export const reportSchema = z.object({
  id: z.coerce.number(),
  /* Kept as the server says them: a type or reason this build does not know still shows. */
  target_type: z.string(),
  /** A thread's or comment's UUID, or a user's or club's id, always as a string. */
  target_id: z.coerce.string(),
  reason: z.string(),
  note: z.string().nullish(),
  status: z.string(),
  reporter: person.nullish(),
  /** The reported words (a thread's or comment's text, a user's or club's name), as they stand even after removal. */
  target_preview: z.string().nullish().transform((v) => v ?? ""),
  /** For a thread or a club, the club's own account; for a user, that user. */
  target_author: person.nullish(),
  club: z.object({ id: z.coerce.number(), name: z.string(), slug: z.string().nullish() }).nullish(),
  /** Open reports on the same thing from different people, now. */
  report_count: z.number().catch(0),
  /** The thread, comment, user or club is gone: removed or deleted. */
  target_removed: z.boolean().catch(false),
  created_at: z.string(),
  resolved_at: z.string().nullish(),
  resolution: z.string().nullish(),
  resolution_note: z.string().nullish(),
});
export type Report = z.infer<typeof reportSchema>;

export const reportPageSchema = z.object({
  items: z.array(reportSchema),
  total: z.number().catch(0),
});

/** POST /admin/reports/{id}/resolve: how many open reports it closed (this one included), and this one as it now is. */
export const resolveResultSchema = z.object({
  resolved: z.number().catch(1),
  report: reportSchema,
});
export type ResolveResult = z.infer<typeof resolveResultSchema>;

/** Only a thread or a comment can be taken down; a person or a club is suspended instead (422 NOT_REMOVABLE). */
export function canRemoveContent(r: Pick<Report, "target_type" | "target_removed">): boolean {
  return (r.target_type === "thread" || r.target_type === "comment") && !r.target_removed;
}

/** Someone to suspend: without an author the server refuses (422 NO_AUTHOR). */
export function canSuspendAuthor(r: Pick<Report, "target_author">): boolean {
  return Boolean(r.target_author);
}

/** A comment reported by three or more people is hidden from everyone but its author while the reports are open. */
export function hiddenFromUsers(r: Pick<Report, "target_type" | "report_count">): boolean {
  return r.target_type === "comment" && r.report_count >= HIDE_AT;
}

/** A thread is posted by the club's account, and a club is its account: suspending it closes the club's dashboard. */
export function suspendsClubAccount(r: Pick<Report, "target_type">): boolean {
  return r.target_type === "thread" || r.target_type === "club";
}

/** Suspending the author of a thread or comment takes the content down too. */
export function suspendRemovesContent(r: Pick<Report, "target_type">): boolean {
  return r.target_type === "thread" || r.target_type === "comment";
}

export function reportCountText(n: number): string {
  return `${n} ${n === 1 ? "report" : "reports"}`;
}

/** What the toast says once a report is decided: what happened, and how many reports went with it. */
export function resolvedMessage(action: Resolution, result: ResolveResult): string {
  const { report, resolved } = result;
  const thing = targetLabel(report.target_type).toLowerCase();
  const also = resolved > 1 ? ` ${resolved} reports resolved.` : "";
  if (action === "dismiss") return resolved > 1 ? `Dismissed ${resolved} reports on this ${thing}.` : "Report dismissed.";
  if (action === "remove_content") return `The ${thing} was removed.${also}`;
  const who = report.target_author?.name || "The author";
  return `${who} was suspended and signed out.${also}`;
}

/** The server's refusals, by code. */
export const REPORT_ERRORS = {
  notFound: "REPORT_NOT_FOUND",
  alreadyResolved: "ALREADY_RESOLVED",
  notRemovable: "NOT_REMOVABLE",
  noAuthor: "NO_AUTHOR",
  cannotSuspendSelf: "CANNOT_SUSPEND_SELF",
  insufficientRole: "INSUFFICIENT_ADMIN_ROLE",
} as const;
