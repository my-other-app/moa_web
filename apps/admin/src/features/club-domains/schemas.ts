import { z } from "zod";

/**
 * Clubs' websites on domains of their own (GET /admin/club-domains). Every
 * club's site is at {slug}.myotherapp.in; a club on Growth and up can add
 * www.theirclub.org as well.
 *
 * pending  waiting for the club's DNS records to resolve
 * active   live at the club's domain, certificate issued
 * failed   the check gave up; `last_error` says why
 * paused   the club's plan lost the feature; visitors go to the default address
 * removed  taken off by the club or an admin
 */
export const DOMAIN_STATUSES = ["pending", "active", "failed", "paused", "removed"] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

export const clubDomainRowSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  club: z.object({ id: z.coerce.number(), name: z.string(), slug: z.string().nullish() }),
  host: z.string(),
  /* Kept as the server says it: a status this build does not know still shows. */
  status: z.string(),
  ssl_status: z.string().nullish(),
  last_error: z.string().nullish(),
  verified_at: z.string().nullish(),
  created_at: z.string().nullish(),
});
export type ClubDomainRow = z.infer<typeof clubDomainRowSchema>;

export const clubDomainPageSchema = z.object({
  items: z.array(clubDomainRowSchema),
  total: z.number().catch(0),
});

type Tone = "default" | "info" | "success" | "warning" | "destructive";

export const STATUS_LABEL: Record<DomainStatus, string> = {
  pending: "Pending DNS",
  active: "Active",
  failed: "Failed",
  paused: "Paused",
  removed: "Removed",
};

const STATUS_TONE: Record<DomainStatus, Tone> = {
  pending: "info",
  active: "success",
  failed: "destructive",
  paused: "warning",
  removed: "default",
};

export function statusLabel(status: string): string {
  return (STATUS_LABEL as Record<string, string>)[status] ?? status.replace(/_/g, " ");
}

export function statusTone(status: string): Tone {
  return (STATUS_TONE as Record<string, Tone>)[status] ?? "default";
}

/** The certificate's state, as Cloudflare reports it through the server, in a word. */
export function sslLabel(status: string | null | undefined): { label: string; tone: Tone } | null {
  const s = (status ?? "").toLowerCase();
  if (!s) return null;
  if (s === "active") return { label: "Active", tone: "success" };
  if (s === "initializing" || s === "pending" || s.startsWith("pending_")) return { label: "Issuing", tone: "info" };
  if (s.includes("fail") || s.includes("timed_out") || s === "expired" || s === "deleted") return { label: s.replace(/_/g, " "), tone: "destructive" };
  return { label: s.replace(/_/g, " "), tone: "default" };
}

/** A removed domain has nothing left to check or take off. */
export function canAct(row: Pick<ClubDomainRow, "status">): boolean {
  return row.status !== "removed";
}
