import { z } from "zod";

export const backupSchema = z.object({
  name: z.string(),
  size_bytes: z.number(),
  created_at: z.string(),
});

export const backupListSchema = z.object({
  items: z.array(backupSchema).default([]),
  directory: z.string(),
  is_offsite: z.boolean().default(false),
});

export type Backup = z.infer<typeof backupSchema>;
export type BackupList = z.infer<typeof backupListSchema>;
