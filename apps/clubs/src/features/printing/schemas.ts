import { z } from "zod";

/** The states a print request moves through (print-stations contract §1). */
export const PRINT_STATUSES = ["queued", "printing", "printed", "failed", "cancelled"] as const;
export type PrintStatus = (typeof PRINT_STATUSES)[number];

/** One request to print one guest's card (`PrintRequestOut`, contract §2.4). Strict on what the screens act on, tolerant of the rest. */
export const printRequestSchema = z.object({
  id: z.string(),
  registration_id: z.string().nullish(),
  name: z.string().nullish(),
  ticket_code: z.string().nullish(),
  source: z.string().default("dashboard"),
  status: z.enum(PRINT_STATUSES),
  attempts: z.number().default(0),
  printer: z.object({ id: z.string(), name: z.string() }).nullish(),
  error: z.string().nullish(),
  created_at: z.string().nullish(),
  printed_at: z.string().nullish(),
  /** 1-based place among the queued requests; null once it is no longer queued. */
  position: z.number().nullish(),
});
export type PrintRequest = z.infer<typeof printRequestSchema>;

/** A print station as the club sees it (`GET .../idcards/printers`). */
export const printerSchema = z.object({
  id: z.string(),
  name: z.string(),
  door_label: z.string().nullish(),
  online: z.boolean(),
  last_seen_at: z.string().nullish(),
  expires_at: z.string().nullish(),
});
export type Printer = z.infer<typeof printerSchema>;

/**
 * The queue list: the contract says "PrintRequestOut plus printers_online", read here as either a bare
 * list or an object around one, so the panel works whichever way the server wraps it.
 */
export const printQueueSchema = z
  .union([
    z.array(printRequestSchema),
    z.object({ items: z.array(printRequestSchema).optional(), requests: z.array(printRequestSchema).optional(), printers_online: z.number().nullish() }),
  ])
  .transform((v) => (Array.isArray(v) ? { items: v, printers_online: null as number | null } : { items: v.items ?? v.requests ?? [], printers_online: v.printers_online ?? null }));
export type PrintQueue = z.infer<typeof printQueueSchema>;

export const REPRINT_NOT_ALLOWED = "REPRINT_NOT_ALLOWED";
export const NO_PRINTER = "NO_PRINTER";

export const SOURCE_WORDS: Record<string, string> = { kiosk: "Kiosk", dashboard: "Dashboard", door: "Door" };
export const STATUS_WORDS: Record<PrintStatus, string> = {
  queued: "In the queue",
  printing: "Printing",
  printed: "Printed",
  failed: "Did not print",
  cancelled: "Cancelled",
};
/** A request that will not change on its own. */
export const isFinished = (s: PrintStatus) => s === "printed" || s === "failed" || s === "cancelled";
