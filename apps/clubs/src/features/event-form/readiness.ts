import type { EventFormValues, FieldType } from "./schemas";

/**
 * What the form implies about whether the event is ready to be seen.
 *
 * Twenty-five fields look the same in a form; only four stand between an
 * organiser and a published event, and a handful more make the difference
 * between a page people sign up from and one they scroll past. These keep
 * that distinction in one place, so the rail, the buttons and the preview
 * agree on it. Pure, so they are testable without rendering.
 */
export interface ReadinessItem {
  key: string;
  label: string;
  /** The section the field lives in, for the link. */
  section: string;
  done: boolean;
}

export interface Readiness {
  required: ReadinessItem[];
  recommended: ReadinessItem[];
  /** Every required item is done. */
  publishable: boolean;
  /** 0–100: required items weigh twice a recommended one. */
  score: number;
}

const filled = (v: string | null | undefined) => Boolean(v && v.trim());

export function readiness(v: EventFormValues): Readiness {
  const place = v.is_online ? filled(v.url) : filled(v.location_name);
  const required: ReadinessItem[] = [
    { key: "name", label: "A name", section: "event", done: filled(v.name) && v.name.trim().length >= 3 },
    { key: "category", label: "A category", section: "event", done: Boolean(v.category_id) },
    { key: "when", label: "A date and time", section: "when", done: filled(v.event_datetime) },
    { key: "where", label: v.is_online ? "A joining link" : "A venue", section: "where", done: place },
  ];
  const recommended: ReadinessItem[] = [
    { key: "poster", label: "A poster", section: "event", done: Boolean(v.posterFile) || Boolean((v as { posterUrl?: string | null }).posterUrl) },
    { key: "about", label: "A few lines about it", section: "event", done: filled(v.about) && (v.about ?? "").trim().length >= 40 },
    { key: "close", label: "When sign-up closes", section: "when", done: filled(v.reg_enddate) },
    { key: "capacity", label: "How many places", section: "entry", done: Boolean(v.max_participants) },
    { key: "contact", label: "Someone to contact", section: "people", done: filled(v.contact_phone) || filled(v.contact_email) },
    { key: "topics", label: "Topics, so followers find it", section: "reach", done: (v.interest_ids ?? []).length > 0 },
  ];
  const reqDone = required.filter((i) => i.done).length;
  const recDone = recommended.filter((i) => i.done).length;
  const score = Math.round((100 * (2 * reqDone + recDone)) / (2 * required.length + recommended.length));
  return { required, recommended, publishable: reqDone === required.length, score };
}

/** The answer types, in words a person would use. */
export const ANSWER_TYPES: ReadonlyArray<{ value: FieldType; label: string; hint: string }> = [
  { value: "text", label: "Short text", hint: "A line, like a college name" },
  { value: "number", label: "Number", hint: "Year of study, team size" },
  { value: "email", label: "Email", hint: "Checked for shape" },
  { value: "tel", label: "Phone", hint: "A phone number" },
  { value: "url", label: "Link", hint: "A portfolio or a repo" },
  { value: "date", label: "Date", hint: "A day picker" },
  { value: "time", label: "Time", hint: "A time picker" },
  { value: "datetime", label: "Date & time", hint: "Both together" },
  { value: "radio", label: "One choice", hint: "Pick one of your options" },
  { value: "checkbox", label: "Several choices", hint: "Tick any of your options" },
];

export const answerTypeLabel = (t: string) => ANSWER_TYPES.find((a) => a.value === t)?.label ?? t;

/** "Sat 17 Oct, 5:00 pm – 8:00 pm" from a datetime-local string and hours. */
export function spanLabel(startLocal: string, hours: number | string | undefined): string {
  if (!startLocal) return "";
  const start = new Date(startLocal);
  if (Number.isNaN(start.getTime())) return "";
  const h = Number(hours);
  const day = start.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const t = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (!h || h <= 0) return `${day}, ${t(start)}`;
  const end = new Date(start.getTime() + h * 3_600_000);
  const sameDay = end.toDateString() === start.toDateString();
  return `${day}, ${t(start)} – ${sameDay ? "" : `${end.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}, `}${t(end)}`;
}

/** A local "YYYY-MM-DDTHH:mm" from a date and a time; "" when either is missing. */
export function joinLocal(date: string, time: string): string {
  return date && time ? `${date}T${time}` : "";
}

export function splitLocal(local: string | undefined): { date: string; time: string } {
  const [date = "", time = ""] = (local ?? "").split("T");
  return { date, time: time.slice(0, 5) };
}

/** Hours between two local datetimes, to the half hour; the next day when the end reads earlier. */
export function hoursBetween(startLocal: string, endTime: string): number | null {
  const { date } = splitLocal(startLocal);
  if (!date || !endTime || !startLocal) return null;
  const start = new Date(startLocal).getTime();
  let end = new Date(`${date}T${endTime}`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (end <= start) end += 86_400_000;
  return Math.round(((end - start) / 3_600_000) * 2) / 2;
}
