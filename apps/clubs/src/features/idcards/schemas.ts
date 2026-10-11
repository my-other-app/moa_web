import { z } from "zod";

export const REPRINT_POLICIES = ["anyone", "organiser", "never"] as const;
export type ReprintPolicy = (typeof REPRINT_POLICIES)[number];

export const cardSettingsSchema = z.object({
  reprint_policy: z.enum(REPRINT_POLICIES),
  auto_print_badges: z.boolean(),
  preprinted_carries: z.array(z.string()).default([]),
});
export type CardSettings = z.infer<typeof cardSettingsSchema>;

export const cardSummarySchema = z.object({
  registered: z.number(),
  printed: z.number(),
  by_role: z.array(z.object({ role: z.string(), registered: z.number(), printed: z.number() })),
  design_version: z.number(),
  jobs: z.number(),
  settings: cardSettingsSchema,
  preprinted_layers: z.array(z.object({ key: z.string(), label: z.string(), note: z.string() })),
  reprint_policies: z.array(z.object({ key: z.string(), label: z.string(), note: z.string() })),
});
export type CardSummary = z.infer<typeof cardSummarySchema>;

export const printJobSchema = z.object({
  id: z.string(),
  source: z.string(),
  door: z.string().nullish(),
  cards: z.number(),
  guest: z.string().nullish(),
  design_version: z.number(),
  overrode: z.boolean(),
  error: z.string().nullish(),
  created_at: z.string(),
});
export type PrintJob = z.infer<typeof printJobSchema>;

export const SOURCE_LABEL: Record<string, string> = { checkin: "At check-in", manual: "By hand", batch: "Batch", walkup: "Walk-up", kiosk: "Kiosk", test: "Test" };
