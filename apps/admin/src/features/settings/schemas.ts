import { z } from "zod";

const settingValue = z.union([z.boolean(), z.string(), z.number(), z.null()]).catch(null);

export const settingSchema = z.object({
  key: z.string(),
  label: z.string(),
  help: z.string().catch(""),
  kind: z.enum(["bool", "text", "choice"]).catch("text"),
  choices: z.array(z.string()).catch([]),
  group: z.string().catch("Platform"),
  env: z.boolean().catch(false),
  env_name: z.string().nullish(),
  value: settingValue,
  server_value: settingValue,
  overridden: z.boolean().catch(false),
  restart_required: z.boolean().catch(false),
  note: z.string().nullish(),
  updated_at: z.string().nullish(),
  updated_by: z.object({ id: z.number().nullish(), name: z.string().nullish() }).nullish(),
});
export type PlatformSetting = z.infer<typeof settingSchema>;

export const secretSchema = z.object({
  name: z.string(),
  group: z.string().catch("Other"),
  set: z.boolean().catch(false),
  healthy: z.boolean().catch(false),
  problem: z.string().nullish(),
  mode: z.string().nullish(),
});
export type SecretHealth = z.infer<typeof secretSchema>;

export const historySchema = z.object({
  at: z.string().nullish(),
  key: z.string().nullish(),
  action: z.string().catch(""),
  actor: z.string().nullish(),
  from: settingValue,
  to: settingValue,
});
export type SettingChange = z.infer<typeof historySchema>;

export const settingsPageSchema = z.object({
  settings: z.array(settingSchema),
  secrets: z.array(secretSchema).catch([]),
  history: z.array(historySchema).catch([]),
  refresh_seconds: z.number().catch(15),
  can_edit: z.boolean().catch(false),
});
export type SettingsPage = z.infer<typeof settingsPageSchema>;

/** A setting's value as a line reads it. */
export function shownValue(value: unknown): string {
  if (value === true) return "On";
  if (value === false) return "Off";
  if (value === null || value === undefined || value === "") return "(empty)";
  return String(value);
}

/** Settings and secrets grouped, in the order the server gave them. */
export function grouped<T extends { group: string }>(rows: T[]): Array<{ group: string; rows: T[] }> {
  const out: Array<{ group: string; rows: T[] }> = [];
  for (const row of rows) {
    const last = out.find((g) => g.group === row.group);
    if (last) last.rows.push(row);
    else out.push({ group: row.group, rows: [row] });
  }
  return out;
}
