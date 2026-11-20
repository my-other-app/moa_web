import { ApiError } from "@moa/api";

/** A server time as a datetime-local input shows it, in the browser's zone (as the event's own times are). */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value as the server takes it; empty is "no limit" (null). */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

/** A window as one line: "10 Nov, 9:00 am → 6:00 pm", "from …", "until …", or `none`. */
export function windowText(starts: string | null | undefined, ends: string | null | undefined, none = "No limit"): string {
  if (starts && ends) return `${fmt(starts)} → ${fmt(ends)}`;
  if (starts) return `From ${fmt(starts)}`;
  if (ends) return `Until ${fmt(ends)}`;
  return none;
}

/** The server's words for a refused write, or a plain fallback. */
export const errorText = (err: unknown, fallback = "Something went wrong.") => (err instanceof Error && err.message ? err.message : fallback);

/**
 * The field-by-field problems a refused task save names (422
 * QUEST_TASK_CONFIG puts them under `errors.fields`), as one message per
 * field.
 */
export function fieldProblems(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.fieldErrors) return {};
  const raw = err.fieldErrors as unknown as Record<string, unknown>;
  const fields = raw.fields && typeof raw.fields === "object" ? (raw.fields as Record<string, unknown>) : raw;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    const msg = Array.isArray(v) ? v.filter((x) => typeof x === "string").join(" ") : typeof v === "string" ? v : "";
    if (msg) out[k] = msg;
  }
  return out;
}

export const errorCodeOf = (err: unknown) => (err instanceof ApiError ? err.errorCode : null);
