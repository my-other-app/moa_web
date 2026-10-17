import { z } from "zod";

/**
 * Clubs that take ticket payments in their own Razorpay account
 * (GET /admin/payment-gateways). A club without one takes them through
 * MyOtherApp's account, and is not listed.
 *
 * active        the keys work; the club's new payments go to its own account
 * failed        Razorpay refused the keys on the last check
 * disconnected  the club took its keys off
 * disabled      an admin turned it off
 */
export const GATEWAY_STATUSES = ["active", "failed", "disconnected", "disabled"] as const;
export type GatewayStatus = (typeof GATEWAY_STATUSES)[number];

export const gatewayRowSchema = z.object({
  club: z.object({ id: z.coerce.number(), name: z.string(), slug: z.string().nullish() }),
  /* Kept as the server says it: a status this build does not know still shows. */
  status: z.string(),
  key_id: z.string().nullish(),
  verified_at: z.string().nullish(),
  last_webhook_at: z.string().nullish(),
  last_error: z.string().nullish(),
  created_at: z.string().nullish(),
});
export type GatewayRow = z.infer<typeof gatewayRowSchema>;

export const gatewayPageSchema = z.object({
  items: z.array(gatewayRowSchema),
  total: z.number().catch(0),
});

export const STATUS_LABEL: Record<GatewayStatus, string> = {
  active: "Active",
  failed: "Failed",
  disconnected: "Disconnected",
  disabled: "Disabled",
};

export const STATUS_TONE: Record<GatewayStatus, "default" | "info" | "success" | "warning" | "destructive"> = {
  active: "success",
  failed: "destructive",
  disconnected: "default",
  disabled: "warning",
};

export function statusLabel(status: string): string {
  return (STATUS_LABEL as Record<string, string>)[status] ?? status.replace(/_/g, " ");
}

export function statusTone(status: string) {
  return (STATUS_TONE as Record<string, (typeof STATUS_TONE)[GatewayStatus]>)[status] ?? "default";
}

/** Only a gateway that could still take a payment has anything to disable. */
export function canDisable(row: Pick<GatewayRow, "status">): boolean {
  return row.status === "active" || row.status === "failed";
}

/** Only one an admin turned off can be turned back on here; a club that disconnected connects again itself. */
export function canEnable(row: Pick<GatewayRow, "status">): boolean {
  return row.status === "disabled";
}
