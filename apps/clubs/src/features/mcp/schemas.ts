import { z } from "zod";
import { ApiError } from "@moa/api";

/**
 * Connected AI assistants (MCP), as the dashboard sees them: what an
 * assistant asked a person to approve, and which assistants are connected.
 * The backend's contract is docs/MCP.md, section 7.
 *
 * An assistant drafts; it never publishes or sends. For those it makes a
 * pending action and hands its person a link to /confirm/{token}, where
 * someone on the club's team approves it or turns it down.
 */

// ─── A pending action ────────────────────────────────────────────────────

/**
 * The kinds this page knows. Any other fails the parse, so the page says it
 * can't show the request and offers no Approve (isUnreadable).
 */
export const ACTION_KINDS = ["publish_event", "send_announcement", "issue_certificates", "resend_review_email"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_STATUSES = ["pending", "confirmed", "rejected", "expired", "superseded", "failed"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const AUDIENCES = ["all", "attendees", "non_attendees"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "Everyone registered",
  attendees: "Only those who checked in",
  non_attendees: "Only those who registered but haven't checked in",
};

const personSchema = z.object({
  name: z.string().nullable().catch(null),
  email: z.string().nullable().catch(null),
  role: z.string().nullable().catch(null),
});
export type Person = z.infer<typeof personSchema>;

export const CERTIFICATE_AUDIENCES = ["checked_in", "everyone", "roles"] as const;
export type CertificateAudience = (typeof CERTIFICATE_AUDIENCES)[number];
/** As the Certificates page names them. */
export const CERTIFICATE_AUDIENCE_LABEL: Record<CertificateAudience, string> = {
  checked_in: "Everyone who checked in",
  everyone: "Everyone registered",
  roles: "Certain roles",
};
const ROLE_WORD_PLURAL: Record<string, string> = { attendee: "attendees", speaker: "speakers", staff: "staff" };

/**
 * issue_certificates: who gets one, counted when the page asked. Strict on
 * who and how many, the two things the person approves: a shape the page
 * doesn't know reads as null, and the action as unreadable (below).
 */
const certificatesAskSchema = z.object({
  audience: z.enum(CERTIFICATE_AUDIENCES),
  roles: z.array(z.string()).catch([]),
  to_issue: z.number(),
  /** Null when it couldn't be counted (a deleted event). */
  already_issued: z.number().nullable().catch(null),
});
export type CertificatesAsk = z.infer<typeof certificatesAskSchema>;

/** resend_review_email: which review email, and who it reaches now. Strict, as above. */
const reviewEmailAskSchema = z.object({
  /** "REQUEST_DECLINED" */
  stage: z.string().min(1),
  /** "Not confirmed" */
  label: z.string().min(1),
  /** "everyone you declined" */
  who: z.string().min(1),
  /** How many it goes to, counted when the page asked. */
  eligible: z.number(),
});
export type ReviewEmailAsk = z.infer<typeof reviewEmailAskSchema>;

const eventTargetSchema = z.object({
  type: z.literal("event"),
  id: z.number(),
  name: z.string(),
  status: z.string().catch("draft"),
  deleted: z.boolean().catch(false),
  starts_at: z.string().nullable().catch(null),
  venue: z.string().nullable().catch(null),
  online: z.boolean().catch(false),
  paid: z.boolean().catch(false),
  fee: z.number().nullable().catch(null),
  capacity: z.number().nullable().catch(null),
  dashboard_url: z.string().nullable().catch(null),
  public_url: z.string().nullable().catch(null),
  /** Only on issue_certificates. */
  certificates: certificatesAskSchema.nullish().catch(null),
  /** Only on resend_review_email. */
  email: reviewEmailAskSchema.nullish().catch(null),
});
export type EventTarget = z.infer<typeof eventTargetSchema>;

const announcementTargetSchema = z.object({
  type: z.literal("announcement"),
  id: z.string(),
  status: z.string().catch("draft"),
  /** Written by an assistant: shown as plain text, never as markup. */
  title: z.string(),
  body: z.string(),
  audience: z.enum(AUDIENCES).catch("all"),
  event: z.object({ id: z.number(), name: z.string() }).nullable().catch(null),
  people: z.number().catch(0),
  reachable: z.number().catch(0),
});
export type AnnouncementTarget = z.infer<typeof announcementTargetSchema>;

/**
 * `{}` when the event or draft no longer exists: read as null. Anything else
 * must be a target the page can read; one it can't fails the parse, so it is
 * never shown half-read with Approve beside it.
 */
const targetSchema = z
  .union([eventTargetSchema, announcementTargetSchema, z.object({}).strict().transform(() => null)])
  .nullish()
  .transform((t): EventTarget | AnnouncementTarget | null => t ?? null);

/** What each kind is about, when it still exists. */
const TARGET_OF: Record<ActionKind, "event" | "announcement"> = {
  publish_event: "event",
  send_announcement: "announcement",
  issue_certificates: "event",
  resend_review_email: "event",
};

/** Whether a target is the one its kind is about, with the details that kind is approved on. */
function targetFits(kind: ActionKind, t: EventTarget | AnnouncementTarget): boolean {
  if (t.type !== TARGET_OF[kind]) return false;
  if (kind === "issue_certificates") return t.type === "event" && !!t.certificates;
  if (kind === "resend_review_email") return t.type === "event" && !!t.email;
  return true;
}

export const pendingActionSchema = z
  .object({
    id: z.string(),
    kind: z.enum(ACTION_KINDS),
    status: z.enum(ACTION_STATUSES),
    title: z.string(),
    effects: z.array(z.string()).catch([]),
    target: targetSchema,
    requested: z.object({
      app: z.string().catch("An assistant"),
      by: personSchema.nullable().catch(null),
      at: z.string().nullable().catch(null),
    }),
    expires_at: z.string().nullable().catch(null),
    expired: z.boolean().catch(false),
    can_decide: z.boolean().catch(false),
    cannot_decide_reason: z.string().nullable().catch(null),
    decided: z
      .object({ at: z.string().nullable().catch(null), by: personSchema.nullable().catch(null) })
      .nullable()
      .catch(null),
    /** What confirming did, why it failed, or that the app was disconnected. Loose on purpose. */
    result: z.record(z.unknown()).nullable().catch(null),
  })
  // A target the page would show wrongly (another kind's, or without the
  // figures it is approved on) fails the parse: unreadable, never approvable.
  .superRefine((a, ctx) => {
    if (a.target && !targetFits(a.kind, a.target))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["target"], message: `Not what a ${a.kind} request is about.` });
  });
export type PendingAction = z.infer<typeof pendingActionSchema>;

/**
 * Whether the server's answer is one this page can't read: a kind it doesn't
 * know, or a shape it can't show. It is shown as such, and never approved.
 */
export function isUnreadable(error: unknown): boolean {
  return error instanceof z.ZodError;
}

const ASK: Record<ActionKind, string> = {
  publish_event: "publish this event",
  send_announcement: "send this announcement",
  issue_certificates: "issue certificates for this event",
  resend_review_email: "send this email again",
};

/** "Claude wants to publish this event. Check it, then approve." */
export function askLine(a: Pick<PendingAction, "kind" | "requested">): string {
  return `${a.requested.app} wants to ${ASK[a.kind]}. Check it, then approve.`;
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** "speakers and staff"; "attendees, speakers and staff". */
function wordList(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Who gets a certificate, as the person approving reads it: "Everyone who checked in", "Only speakers and staff". */
export function certificateAudienceLine(c: Pick<CertificatesAsk, "audience" | "roles">): string {
  if (c.audience !== "roles") return CERTIFICATE_AUDIENCE_LABEL[c.audience];
  const words = c.roles.map((r) => ROLE_WORD_PLURAL[r] ?? r);
  return words.length ? `Only ${wordList(words)}` : "Only certain roles";
}

/** "everyone you declined" → "Everyone you declined". */
export const sentenceCase = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** The event's review email in the dashboard: /events/{id}/emails/review/{stage}, lower case as the emails pages link it. */
export const reviewEmailHref = (eventId: number, stage: string) => `/events/${eventId}/emails/review/${encodeURIComponent(stage.toLowerCase())}`;

/** What confirming issued: {"issued", "refreshed", "already_issued"}. Refreshed ones already had one too. */
function issuedLine(r: Record<string, unknown>): string {
  const issued = num(r.issued);
  if (issued === null) return "The certificates were issued. They aren't emailed yet: send them from the Certificates page.";
  if (issued === 0) return "No new certificates: everyone in this group already had one.";
  const had = (num(r.already_issued) ?? 0) + (num(r.refreshed) ?? 0);
  return [
    `Issued ${count(issued, "certificate", "certificates")}.`,
    had > 0 ? `${count(had, "person", "people")} already had one.` : null,
    "They aren't emailed yet: send them from the Certificates page.",
  ]
    .filter(Boolean)
    .join(" ");
}

const REJECTED: Record<ActionKind, string> = {
  publish_event: "Nothing was published. The event is still a draft.",
  send_announcement: "Nothing was sent. The announcement is still a draft.",
  issue_certificates: "Nothing was issued.",
  resend_review_email: "Nothing was sent.",
};

const FAILED: Record<ActionKind, string> = {
  publish_event: "It couldn't be done: the event changed while this was waiting.",
  send_announcement: "It couldn't be done: the event or the announcement changed while this was waiting.",
  issue_certificates: "It couldn't be done: the event changed while this was waiting.",
  resend_review_email: "It couldn't be done: the event or the email changed while this was waiting.",
};

const ROLE_WORD: Record<string, string> = { owner: "the club account", admin: "admin", editor: "editor", door: "door team" };

/** "Eddie Editor (editor)", or "the club account" for the owner's own login. */
export function personLabel(p: Person | null | undefined): string {
  if (!p) return "someone";
  if (p.role === "owner" && !p.name && !p.email) return "the club account";
  const who = p.name || p.email || "a team member";
  return p.role && p.role !== "owner" ? `${who} (${ROLE_WORD[p.role] ?? p.role})` : who;
}

/** What the result says, in words, for a decided action. */
export function resultLine(a: PendingAction): string | null {
  const r = a.result ?? {};
  if (r.reason === "app_disconnected") return "The app was disconnected, so its request was turned down.";
  if (a.status === "failed") return typeof r.message === "string" && r.message ? r.message : FAILED[a.kind];
  if (a.status === "confirmed") {
    switch (a.kind) {
      case "publish_event":
        return "The event is published: on the club's page, the website and the app.";
      case "issue_certificates":
        return issuedLine(r);
      case "resend_review_email": {
        // Queued: it goes out over the next minutes, and the event's emails page shows how far it got.
        const people = num(r.people);
        return people !== null ? `It's going out again to ${count(people, "person", "people")}, by email.` : "The email is going out again.";
      }
      case "send_announcement": {
        const people = num(r.people);
        const pushed = num(r.pushed);
        if (people !== null) return `Sent to ${count(people, "person", "people")}${pushed !== null ? `, ${pushed.toLocaleString("en-IN")} by push on their phones` : ""}.`;
        return "The announcement was sent.";
      }
    }
  }
  if (a.status === "rejected") return REJECTED[a.kind];
  return null;
}

// ─── The server's refusals ───────────────────────────────────────────────

export const MCP_DISABLED = "MCP_DISABLED";
export const ACTION_NOT_FOUND = "ACTION_NOT_FOUND";
export const ACTION_DECIDED = "ACTION_DECIDED";
export const ACTION_EXPIRED = "ACTION_EXPIRED";
/** The club's emails this month can't cover a resend: the request stays waiting. */
export const MESSAGE_QUOTA_EXCEEDED = "MESSAGE_QUOTA_EXCEEDED";
/**
 * The target changed while the request waited: the action is `failed` now.
 * The last six are the certificates' and the review email's (the event no
 * longer reviews registrations, nobody is at that step any more…).
 */
export const TARGET_CHANGED = [
  "EVENT_NOT_FOUND",
  "EVENT_NOT_DRAFT",
  "DRAFT_NOT_FOUND",
  "DRAFT_NOT_PENDING",
  "ISSUE_REFUSED",
  "NOT_A_REVIEW_EMAIL",
  "NOT_RESENDABLE",
  "NOT_REVIEWED",
  "NOBODY",
  "RESEND_REFUSED",
] as const;

/**
 * Whether the server has connected assistants switched off: 503
 * MCP_DISABLED, or a 404 with no code of ours (a server without them, or
 * one that answers 404 for the whole feature while off).
 */
export function isMcpOff(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.errorCode === MCP_DISABLED) return true;
  return error.status === 404 && !error.errorCode;
}

/**
 * A refusal after which the page should read the action again: it was
 * decided, it expired, or its target changed. Or an answer the page couldn't
 * read: what the action is now is only known by reading it again.
 */
export function needsReload(error: unknown): boolean {
  if (isUnreadable(error)) return true;
  return error instanceof ApiError && (error.errorCode === ACTION_DECIDED || error.errorCode === ACTION_EXPIRED || (TARGET_CHANGED as readonly string[]).includes(error.errorCode ?? ""));
}

/** {"needed", "available"} of a 402 MESSAGE_QUOTA_EXCEEDED, when it carries them. */
export function quotaShortfall(error: unknown): { needed: number; available: number } | null {
  const f = error instanceof ApiError ? (error.fieldErrors as unknown as Record<string, unknown> | null) : null;
  const needed = num(f?.needed);
  const available = num(f?.available);
  return needed !== null && available !== null ? { needed, available } : null;
}

/** The plan page a PLAN_LIMIT_REACHED points at: its `upgrade_url` when it is ours, else Plan & billing. */
export function upgradeHref(error: unknown): string {
  const raw = error instanceof ApiError ? (error.fieldErrors as unknown as Record<string, unknown> | null)?.upgrade_url : null;
  if (typeof raw === "string") {
    try {
      const url = new URL(raw, "https://club-dashboard.myotherapp.in");
      if (url.hostname.endsWith("myotherapp.in")) return `${url.pathname}${url.search}`;
    } catch {
      // fall through
    }
  }
  return "/billing";
}

// ─── Connected apps ──────────────────────────────────────────────────────

export const connectedAppSchema = z.object({
  id: z.string(),
  app: z.object({
    name: z.string().catch("An assistant"),
    client_id: z.string().nullable().catch(null),
    uri: z.string().nullable().catch(null),
    logo_uri: z.string().nullable().catch(null),
    registration: z.string().nullable().catch(null),
  }),
  connected_by: z
    .object({
      type: z.enum(["member", "owner"]).catch("owner"),
      member_id: z.number().nullable().optional().catch(null),
      name: z.string().nullable().optional().catch(null),
      email: z.string().nullable().optional().catch(null),
      role: z.string().nullable().optional().catch(null),
    })
    .catch({ type: "owner" }),
  scopes: z.array(z.object({ key: z.string(), label: z.string() })).catch([]),
  connected_at: z.string().nullable().catch(null),
  last_used_at: z.string().nullable().catch(null),
  pending_actions: z.number().catch(0),
});
export type ConnectedApp = z.infer<typeof connectedAppSchema>;

export const connectedAppsSchema = z.object({
  can_manage_all: z.boolean().catch(false),
  apps: z.array(connectedAppSchema).catch([]),
});

/** "claude.ai", from the app's own address; null when it has none worth showing. */
export function appHost(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || u.protocol === "http:" ? u.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/** Who connected it, after "Connected by": "Eddie Editor (editor)", or "the club account". */
export function connectedByLabel(c: ConnectedApp["connected_by"]): string {
  if (c.type === "owner") return "the club account";
  const who = c.name || c.email || "A team member";
  return c.role ? `${who} (${ROLE_WORD[c.role] ?? c.role})` : who;
}

/** The address assistants connect to. */
export const MCP_URL = "https://api.myotherapp.in/mcp";

/** How to connect each assistant, from docs/MCP.md section 1. */
export const HOW_TO: { app: string; steps: string[] }[] = [
  {
    app: "Claude",
    steps: [
      "In Claude, open Settings → Connectors → Add custom connector.",
      `Name it MyOtherApp, and paste ${MCP_URL} as the URL.`,
      "Choose Add, then Connect, and sign in with your dashboard login. Untick anything you don't want to allow, then Allow.",
    ],
  },
  {
    app: "ChatGPT",
    steps: [
      "In ChatGPT, open Settings → Apps & Connectors → Advanced settings and turn on Developer mode.",
      `Create a connector with ${MCP_URL} as the MCP server URL and OAuth as the authentication.`,
      "Sign in with your dashboard login, pick the club, and Allow.",
    ],
  },
  {
    app: "Cursor and others",
    steps: [`Add a remote MCP server with the URL ${MCP_URL}.`, "The app opens your browser to sign in; carry on only if you started it from that app."],
  },
];
