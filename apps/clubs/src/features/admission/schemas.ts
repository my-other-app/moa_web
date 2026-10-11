import { z } from "zod";

export const admissionSettingsSchema = z.object({
  prefix: z.string().nullable(),
  digits: z.number(),
  include_code: z.boolean(),
  code: z.string(),
  next_number: z.string(),
  numbered: z.number(),
  unnumbered: z.number(),
});
export type AdmissionSettings = z.infer<typeof admissionSettingsSchema>;

export const numberedResultSchema = z.object({ numbered: z.number(), first: z.string().nullable(), last: z.string().nullable() });

/** What the next ticket would read, drawn as the organiser types. */
export const previewNumber = (prefix: string, digits: number, includeCode: boolean, code: string, seq = 1) => {
  const body = `${(prefix || "MOA").toUpperCase()}-${String(seq).padStart(Math.max(1, digits), "0")}`;
  return includeCode ? `${body}-${code}` : body;
};
