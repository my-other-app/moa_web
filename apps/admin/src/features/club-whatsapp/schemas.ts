import { z } from "zod";

/**
 * A club's own WhatsApp Business number, as a platform admin sees it
 * (GET /admin/club-whatsapp/{club_id}): whether it is connected, its status,
 * Meta's quality rating and messaging limit. Never a message, never a key.
 */
const str = z.string().nullish().catch(null);

export const clubWhatsAppSchema = z.object({
  club_id: z.number(),
  connected: z.boolean().catch(false),
  /** active | failed | disconnected, or null with no number ever. */
  status: z.enum(["active", "failed", "disconnected"]).nullish().catch(null),
  display_phone_number: str,
  verified_name: str,
  quality_rating: str,
  messaging_limit_tier: str,
  quality_checked_at: str,
  verified_at: str,
  last_webhook_at: str,
  last_error: str,
  routing: z.boolean().nullish().catch(null),
  connected_at: str,
  conversations: z.number().catch(0),
  plan_allows: z.boolean().catch(false),
});
export type ClubWhatsApp = z.infer<typeof clubWhatsAppSchema>;

export const QUALITY_LABEL: Record<string, string> = { GREEN: "High", YELLOW: "Medium", RED: "Low", UNKNOWN: "Not rated yet" };

export function qualityTone(rating: string | null | undefined): "success" | "warning" | "destructive" | "default" {
  const r = (rating ?? "").toUpperCase();
  return r === "GREEN" ? "success" : r === "YELLOW" ? "warning" : r === "RED" ? "destructive" : "default";
}

/** TIER_1K as "1,000 a day": the business portfolio's limit, shared by all its numbers. */
export function tierWords(tier: string | null | undefined): string {
  if (!tier) return "Not set";
  const t = tier.toUpperCase();
  if (t === "TIER_UNLIMITED") return "No daily limit";
  const m = /^TIER_(\d+)(K)?$/.exec(t);
  return m ? `${(Number(m[1]) * (m[2] ? 1000 : 1)).toLocaleString("en-IN")} a day` : tier;
}

export const STATUS_TEXT: Record<string, { label: string; tone: "success" | "destructive" | "default" }> = {
  active: { label: "Connected", tone: "success" },
  failed: { label: "Not working", tone: "destructive" },
  disconnected: { label: "Disconnected", tone: "default" },
};
