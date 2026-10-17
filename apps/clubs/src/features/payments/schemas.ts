import { z } from "zod";

/**
 * The club's own Razorpay account: GET/PUT/DELETE /clubs/payments/gateway
 * and POST /clubs/payments/gateway/verify, all answering this one shape.
 *
 * A club with no account of its own takes ticket payments through
 * MyOtherApp's Razorpay, as every club did before this. Connecting one
 * sends new payments straight to the club; the server decides, per event,
 * where a payment goes (`payments_to` on the event detail).
 */

/**
 * `connected` is true while active or failed, false once disconnected or
 * disabled; a disabled one still carries its `key_id`.
 *
 * active        the keys work; new payments go to the club's account
 * failed        Razorpay refused the keys on the last check
 * disconnected  the club took its keys off
 * disabled      MyOtherApp turned the connection off
 */
export const GATEWAY_STATUSES = ["active", "failed", "disconnected", "disabled"] as const;
export type GatewayStatus = (typeof GATEWAY_STATUSES)[number];

export const gatewaySchema = z.object({
  /** False: the server is not set up for clubs' own accounts yet. */
  available: z.boolean().catch(false),
  connected: z.boolean().catch(false),
  /** A status this build does not know reads as none, rather than failing the page. */
  status: z.enum(GATEWAY_STATUSES).nullish().catch(null),
  mode: z.string().nullish().catch(null),
  key_id: z.string().nullish().catch(null),
  webhook_url: z.string().nullish().catch(null),
  webhook_secret: z.string().nullish().catch(null),
  webhook_events: z.array(z.string()).catch([]),
  verified_at: z.string().nullish().catch(null),
  last_webhook_at: z.string().nullish().catch(null),
  last_error: z.string().nullish().catch(null),
  /** False: the viewer is not the club's own account, and may only look. */
  can_manage: z.boolean().catch(false),
});
export type Gateway = z.infer<typeof gatewaySchema>;

export const gatewayKeysSchema = z.object({
  key_id: z.string().trim().min(1, "Paste the Key ID from Razorpay."),
  key_secret: z.string().trim().min(1, "Paste the Key secret from Razorpay."),
});
export type GatewayKeys = z.infer<typeof gatewayKeysSchema>;

/** Where an event's ticket payments go (`payments_to` on GET /events/info/{id}). */
export const PAYMENTS_TO = ["club", "platform"] as const;
export type PaymentsTo = (typeof PAYMENTS_TO)[number];

/**
 * Whether the page shows the account as connected: the keys are on file,
 * working or not. A failed check or MyOtherApp turning it off still leaves
 * the account there, with its key and what to do about it.
 */
export function hasAccount(g: Gateway): boolean {
  if (g.connected) return true;
  return Boolean(g.key_id) && (g.status === "failed" || g.status === "disabled");
}

/**
 * Where a new event's payments would go, from the gateway alone: the club's
 * account only while it is connected and working. Anything else falls back
 * to MyOtherApp's, as it did before clubs could connect their own.
 */
export function paymentsToOf(g: Gateway): PaymentsTo {
  return g.available && g.connected && g.status === "active" ? "club" : "platform";
}

export const STATUS_LABEL: Record<GatewayStatus, string> = {
  active: "Active",
  failed: "Failed",
  disconnected: "Disconnected",
  disabled: "Disabled by MyOtherApp",
};

export const STATUS_TONE: Record<GatewayStatus, "default" | "info" | "success" | "warning" | "destructive"> = {
  active: "success",
  failed: "destructive",
  disconnected: "default",
  disabled: "warning",
};

// ─── Refusals ───────────────────────────────────────────────────────────

export const INVALID_KEYS = "INVALID_KEYS";
export const TEST_KEYS_NOT_ALLOWED = "TEST_KEYS_NOT_ALLOWED";
export const GATEWAY_UNAVAILABLE = "GATEWAY_UNAVAILABLE";
export const OWNER_ONLY = "OWNER_ONLY";
/** 409 to PUT, verify and DELETE while MyOtherApp has the account turned off. */
export const GATEWAY_DISABLED = "GATEWAY_DISABLED";
/** 403 to GET for editors and door staff: only the owner and admins see payment settings. */
export const ROLE_FORBIDDEN = "ROLE_FORBIDDEN";
/** 502 to PUT: Razorpay could not be reached to check the keys. */
export const RAZORPAY_UNREACHABLE = "RAZORPAY_UNREACHABLE";
/** 404 to verify: there is no account on file to check. */
export const NO_GATEWAY = "NO_GATEWAY";

export const TEST_KEYS_MESSAGE =
  "These are test mode keys. Switch the Razorpay Dashboard to Live mode and generate keys there — a live Key ID starts with rzp_live_.";
export const UNAVAILABLE_MESSAGE = "Connecting your own Razorpay isn't available right now. Your ticket payments still go through MyOtherApp. Try again later.";
export const OWNER_ONLY_MESSAGE = "Only the club's own account can change where payments go.";
export const DISABLED_MESSAGE = "MyOtherApp has turned off your own Razorpay. Talk to us.";
export const UNREACHABLE_MESSAGE = "We couldn't reach Razorpay to check the keys. Try again in a minute.";
export const NO_GATEWAY_MESSAGE = "There's no Razorpay account on file to check. Connect one first.";
export const ROLE_FORBIDDEN_MESSAGE = "Only the club owner and admins can see payment settings";

// ─── Words ──────────────────────────────────────────────────────────────

/** Where to find the live keys, step by step, as Razorpay's Dashboard names things. */
export const KEY_STEPS = [
  "Sign in to the Razorpay Dashboard and switch to Live mode (the toggle at the top).",
  "Open Account & Settings → API Keys.",
  "Click Generate Key. Copy the Key ID and the Key secret — Razorpay shows the secret only once.",
] as const;

/**
 * Step 2, first: payments must be captured automatically. Left on manual,
 * Razorpay only authorises them, so attendees are charged but never
 * confirmed.
 */
export const CAPTURE_STEP = "In Razorpay → Account & Settings → Payment capture, turn on automatic capture.";
export const CAPTURE_WHY = "Payments must be captured automatically, or attendees are charged but never confirmed.";

/** Then: telling Razorpay where to send its payment notices. */
export const WEBHOOK_STEPS = ["In the Razorpay Dashboard (Live mode), open Account & Settings → Webhooks.", "Click Add new webhook."] as const;
