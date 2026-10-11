const DATE = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const NUMBER = new Intl.NumberFormat("en-IN");

const CURRENCY = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** en-IN throughout: the product, its payments and its users are Indian. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "--";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "--" : DATE.format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "--";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "--" : DATE_TIME.format(d);
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "--" : NUMBER.format(value);
}

/**
 * Money arrives as rupees (the backend stores Numeric(10,2) after the
 * money-precision migration), so no division is applied here.
 */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "--";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(n) ? "--" : CURRENCY.format(n);
}

export function initials(name: string | null | undefined, fallback = "?"): string {
  if (!name?.trim()) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
}

/** The zone events are run in, until events carry their own. */
export const EVENT_TIMEZONE = "Asia/Kolkata";

/** "18:05" in the event's zone: the clock a door reads. */
export function formatTime(value: string | Date | null | undefined, timeZone = EVENT_TIMEZONE): string {
  if (!value) return "--";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** "Sat 11 Oct, 18:00 – 22:00", or with both dates when the event crosses midnight. */
export function formatWindow(start: string | null | undefined, end: string | null | undefined, timeZone = EVENT_TIMEZONE): string {
  if (!start) return "--";
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return "--";
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" });
  const e = end ? new Date(end) : null;
  if (!e || Number.isNaN(e.getTime())) return `${day.format(s)}, ${formatTime(s, timeZone)}`;
  const sameDay = day.format(s) === day.format(e);
  return sameDay
    ? `${day.format(s)}, ${formatTime(s, timeZone)} – ${formatTime(e, timeZone)}`
    : `${day.format(s)} ${formatTime(s, timeZone)} – ${day.format(e)} ${formatTime(e, timeZone)}`;
}

/** Whole percent of `part` in `whole`, 0 when there is no whole. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** "1 guest", "3 guests". The plural is the noun plus s unless given. */
export function plural(n: number, noun: string, many?: string): string {
  return `${formatNumber(n)} ${n === 1 ? noun : (many ?? `${noun}s`)}`;
}

/** "just now", "4 min ago", "2 h ago", "yesterday", then the date. */
export function relativeTime(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "--";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 172_800) return "yesterday";
  return formatDate(d);
}

/** "45 min", "3 h", "2 d": how far off something is. */
export function timeUntil(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "--";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  const s = Math.max(0, Math.round((d.getTime() - now.getTime()) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86_400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86_400)} d`;
}

/** Whole minutes from one instant to another; negative when `to` is earlier. */
export function minutesBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
}
