import { api } from "@moa/app-kit";

import { backupListSchema, backupSchema, type Backup, type BackupList } from "./schemas";

export async function fetchBackups(): Promise<BackupList> {
  return backupListSchema.parse(await api.get<unknown>("/api/v1/admin/backups"));
}

export async function createBackup(): Promise<Backup> {
  return backupSchema.parse(await api.post<unknown>("/api/v1/admin/backups"));
}

export async function deleteBackup(name: string): Promise<void> {
  await api.del(`/api/v1/admin/backups/${encodeURIComponent(name)}`);
}

/**
 * The download goes through the gateway like every other call, so the session
 * cookie authenticates it. Navigating rather than fetching keeps a multi-
 * megabyte file out of JS memory and lets the browser handle the save dialog.
 */
export function backupDownloadUrl(name: string): string {
  return `/api/gateway/api/v1/admin/backups/${encodeURIComponent(name)}`;
}
