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

export const ACTION_KINDS = ["publish_event", "send_announcement"] as const;
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

/** `{}` when the event or draft no longer exists: read as null. */
const targetSchema = z
  .union([eventTargetSchema, announcementTargetSchema, z.object({}).passthrough()])
  .nullable()
  .catch(null)
  .transform((t) => (t && "type" in t && (t.type === "event" || t.type === "announcement") ? (t as EventTarget | AnnouncementTarget) : null));

export const pendingActionSchema = z.object({
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
});
export type PendingAction = z.infer<typeof pendingActionSchema>;

/** "Claude wants to publish this event. Check it, then approve." */
export function askLine(a: Pick<PendingAction, "kind" | "requested">): string {
  const what = a.kind === "publish_event" ? "publish this event" : "send this announcement";
  return `${a.requested.app} wants to ${what}. Check it, then approve.`;
}

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
  if (a.status === "failed") return typeof r.message === "string" && r.message ? r.message : "It couldn't be done: the event or the announcement changed while this was waiting.";
  if (a.status === "confirmed") {
    if (a.kind === "publish_event") return "The event is published: on the club's page, the website and the app.";
    const people = typeof r.people === "number" ? r.people : null;
    const pushed = typeof r.pushed === "number" ? r.pushed : null;
    if (people !== null)
      return `Sent to ${people.toLocaleString("en-IN")} ${people === 1 ? "person" : "people"}${pushed !== null ? `, ${pushed.toLocaleString("en-IN")} by push on their phones` : ""}.`;
    return "The announcement was sent.";
  }
  if (a.status === "rejected") return a.kind === "publish_event" ? "Nothing was published. The event is still a draft." : "Nothing was sent. The announcement is still a draft.";
  return null;
}

// ─── The server's refusals ───────────────────────────────────────────────

export const MCP_DISABLED = "MCP_DISABLED";
export const ACTION_NOT_FOUND = "ACTION_NOT_FOUND";
export const ACTION_DECIDED = "ACTION_DECIDED";
export const ACTION_EXPIRED = "ACTION_EXPIRED";
/** The target changed while the request waited: the action is `failed` now. */
export const TARGET_CHANGED = ["EVENT_NOT_FOUND", "EVENT_NOT_DRAFT", "DRAFT_NOT_FOUND", "DRAFT_NOT_PENDING"] as const;

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

/** A refusal after which the page should read the action again: it was decided, it expired, or its target changed. */
export function needsReload(error: unknown): boolean {
  return error instanceof ApiError && (error.errorCode === ACTION_DECIDED || error.errorCode === ACTION_EXPIRED || (TARGET_CHANGED as readonly string[]).includes(error.errorCode ?? ""));
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
export type ConnectedApps = z.infer<typeof connectedAppsSchema>;

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

/** Who connected it: "Eddie Editor (editor)", or "The club account". */
export function connectedByLabel(c: ConnectedApp["connected_by"]): string {
  if (c.type === "owner") return "The club account";
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
