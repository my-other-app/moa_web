import { z } from "zod";

export const templateSchema = z.object({
  id: z.string().nullish(),
  name: z.string().nullish(),
  language: z.string().nullish(),
  status: z.string().nullish(),
  category: z.string().nullish(),
  rejected_reason: z.string().nullish(),
  quality: z.string().nullish(),
  body: z.string().nullish(),
  expected: z.boolean().catch(false),
});
export type WhatsAppTemplate = z.infer<typeof templateSchema>;

const named = z.object({ name: z.string(), purpose: z.string().catch("") });

export const templatesPageSchema = z.object({
  configured: z.boolean().catch(false),
  waba_id: z.string().nullish(),
  templates: z.array(templateSchema).catch([]),
  missing: z.array(named).catch([]),
  expected: z.array(named).catch([]),
  checked_at: z.string().nullish(),
  cached: z.boolean().catch(false),
  error: z.string().nullish(),
});
export type TemplatesPage = z.infer<typeof templatesPageSchema>;

export function statusTone(status: string | null | undefined): "success" | "warning" | "destructive" | "default" {
  if (status === "approved") return "success";
  if (status === "pending" || status === "in_appeal" || status === "pending_deletion") return "warning";
  if (status === "rejected" || status === "disabled" || status === "paused") return "destructive";
  return "default";
}
