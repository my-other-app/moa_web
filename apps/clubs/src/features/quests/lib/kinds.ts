import type { QuestStation, QuestTask, TaskTemplate, TemplateField } from "../schemas";

/**
 * Each task kind in the organiser's words: what it is called, how the
 * platform proves it (nobody ticks their own), and a one-line summary of
 * its rule as set. The server's templates (label, default title, fields
 * with limits) win wherever they say something; these fill the gaps and
 * hold the plain-language explanations (contract §3.1).
 */
export interface KindMeta {
  label: string;
  /** How it is proven, said to the organiser picking it. */
  proof: string;
  group: "event" | "live" | "share" | "venue" | "you";
}

export const KIND_META: Record<string, KindMeta> = {
  checked_in: { label: "Checked in", group: "event", proof: "Ticked when they are checked in at any entrance, any way in. Set a time to reward early arrivals." },
  network: {
    label: "Met people in Network",
    group: "event",
    proof:
      "Ticked when they have met enough people by scanning personal QR codes in the app's Network section: distinct people who are checked-in guests of this event, met during it. Saves by name, link or search don't count, and only a few people a minute count, so friends can't farm it.",
  },
  quiz_played: { label: "Played the quiz", group: "live", proof: "Ticked when they answered the live room's quiz while signed in, once the host ends it." },
  quiz_score: { label: "Quiz score", group: "live", proof: "Ticked when their quiz score reaches the number you set, once the host ends the quiz." },
  quiz_top: { label: "Quiz top places", group: "live", proof: "Ticked when they finish in the top places of the quiz (ties share a place)." },
  polls: { label: "Answered polls", group: "live", proof: "Ticked when they answered enough live polls while signed in." },
  qa_question: { label: "Asked a question", group: "live", proof: "Ticked when they asked enough questions in the live Q&A (a rejected one doesn't count)." },
  feedback: { label: "Gave feedback", group: "live", proof: "Ticked when they send the event's feedback survey." },
  poster_made: { label: "Made a poster", group: "share", proof: "Ticked when they make their “I'm attending” poster." },
  poster_link: { label: "Poster link results", group: "share", proof: "Ticked when their own poster link brings enough clicks or registrations." },
  follow_club: { label: "Followed the club", group: "share", proof: "Ticked when they follow your club (an earlier follow counts)." },
  profile_complete: { label: "Completed their profile", group: "share", proof: "Ticked when their public profile is complete: a headline, a photo, a link and a project." },
  station: { label: "Visited a station", group: "venue", proof: "Ticked when staff scan their ticket at the station (a booth, a workshop room). One visit counts; staff see their name only." },
  code: { label: "Secret code", group: "venue", proof: "Ticked when they type the code you show on stage, on slides or around the venue. Case and spaces don't matter; wrong guesses are limited." },
  manual: { label: "Marked done by you", group: "you", proof: "For what the platform can't see (a hackathon submission, a talk given): you tick it per guest, logged with who and when." },
};

export const GROUP_LABEL: Record<KindMeta["group"], string> = {
  event: "At the event",
  live: "Live room",
  share: "Sharing and profile",
  venue: "Around the venue",
  you: "By you",
};

export const kindLabel = (kind: string, templates?: TaskTemplate[] | null) =>
  templates?.find((t) => t.kind === kind)?.label || KIND_META[kind]?.label || kind.replace(/_/g, " ");

export const DIRECTION_LABEL: Record<string, string> = {
  either: "Either way",
  saved: "They saved them (scanned their QR)",
  saved_by: "They were saved (their QR was scanned)",
};

export const METRIC_LABEL: Record<string, string> = { clicks: "Clicks", registrations: "Registrations" };

/** A field's kind of input, from the template's type (lenient) or its key. */
export type FieldInput = "number" | "datetime" | "select" | "station" | "code" | "text";

export function inputOf(f: Pick<TemplateField, "key" | "type" | "options">): FieldInput {
  const t = f.type.toLowerCase();
  if (f.key === "code") return "code";
  if (f.key === "door_id" || t === "door" || t === "station") return "station";
  if (f.options.length || t === "select" || t === "choice" || t === "enum") return "select";
  if (t === "int" || t === "integer" || t === "number" || t === "float") return "number";
  if (t === "datetime" || t === "date-time" || t === "date" || t === "time") return "datetime";
  return "text";
}

/** The fields each kind's rule has, should the server's template not list them. */
export const FALLBACK_FIELDS: Record<string, TemplateField[]> = {
  checked_in: [{ key: "before", type: "datetime", label: "Checked in before (optional)", min: null, max: null, options: [], required: false }],
  network: [
    { key: "count", type: "int", label: "People to meet", min: 1, max: 50, options: [], required: true },
    { key: "direction", type: "select", label: "Who counts", min: null, max: null, options: ["either", "saved", "saved_by"].map((value) => ({ value, label: DIRECTION_LABEL[value]! })), required: true },
    { key: "per_minute", type: "int", label: "At most, per minute", min: 1, max: 10, options: [], required: true },
  ],
  quiz_score: [{ key: "min_score", type: "int", label: "Score at least", min: 1, max: 1_000_000, options: [], required: true }],
  quiz_top: [{ key: "top", type: "int", label: "Top places", min: 1, max: 100, options: [], required: true }],
  polls: [{ key: "count", type: "int", label: "Polls answered", min: 1, max: 50, options: [], required: true }],
  qa_question: [{ key: "count", type: "int", label: "Questions asked", min: 1, max: 20, options: [], required: true }],
  poster_link: [
    { key: "metric", type: "select", label: "What counts", min: null, max: null, options: ["clicks", "registrations"].map((value) => ({ value, label: METRIC_LABEL[value]! })), required: true },
    { key: "count", type: "int", label: "How many", min: 1, max: 1000, options: [], required: true },
  ],
  station: [{ key: "door_id", type: "door", label: "Station", min: null, max: null, options: [], required: true }],
  code: [{ key: "code", type: "string", label: "The code", min: 3, max: 40, options: [], required: true }],
};

/** The default rule of each kind, should the server's template not give one (§3.1). */
export const FALLBACK_CONFIG: Record<string, Record<string, unknown>> = {
  checked_in: { before: null },
  network: { count: 3, direction: "either", per_minute: 2 },
  quiz_score: { min_score: 100 },
  quiz_top: { top: 10 },
  polls: { count: 1 },
  qa_question: { count: 1 },
  poster_link: { metric: "clicks", count: 5 },
  station: {},
  code: {},
};

/** The fields of a kind's rule: the template's when it lists any, else ours. */
export function fieldsOf(kind: string, templates?: TaskTemplate[] | null): TemplateField[] {
  const t = templates?.find((x) => x.kind === kind);
  if (t && t.fields.length) {
    // The template's labels and limits, with ours where it leaves a label out.
    const ours = FALLBACK_FIELDS[kind] ?? [];
    return t.fields.map((f) => ({ ...f, label: f.label || ours.find((o) => o.key === f.key)?.label || f.key.replace(/_/g, " ") }));
  }
  return FALLBACK_FIELDS[kind] ?? [];
}

const n = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : fallback);

/** The rule as one line under the task's title: "5 people · either way · at most 2 a minute". */
export function ruleLine(task: Pick<QuestTask, "kind" | "config" | "target"> & { station?: QuestTask["station"] }, stations: QuestStation[] = []): string {
  const c = task.config;
  switch (task.kind) {
    case "checked_in":
      return c.before ? `Checked in before ${new Date(String(c.before)).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : "Checked in, any time";
    case "network": {
      const dir = String(c.direction ?? "either");
      const who = dir === "saved" ? "people they saved" : dir === "saved_by" ? "people who saved them" : "people met either way";
      return `${n(c.count, task.target)} ${who} by QR · at most ${n(c.per_minute, 2)} a minute`;
    }
    case "quiz_score":
      return `Quiz score of ${n(c.min_score).toLocaleString("en-IN")} or more`;
    case "quiz_top":
      return `Top ${n(c.top)} of the quiz`;
    case "polls":
      return n(c.count, 1) === 1 ? "One poll answered" : `${n(c.count)} polls answered`;
    case "qa_question":
      return n(c.count, 1) === 1 ? "One question asked" : `${n(c.count)} questions asked`;
    case "poster_link":
      return `${n(c.count)} ${c.metric === "registrations" ? "registrations" : "clicks"} through their poster link`;
    case "station": {
      const s = stations.find((x) => x.id === c.door_id);
      const name = s?.name ?? task.station?.name;
      return name ? `Scanned at ${name}` : "Scanned at a station";
    }
    case "code":
      return typeof c.code === "string" && c.code ? `Code ${c.code}` : "A secret code";
    default:
      return KIND_META[task.kind]?.label ?? "";
  }
}

// ─── Secret codes ────────────────────────────────────────────────────────

/** No 0/O or 1/I/L: a code is read off a slide across a hall. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_MIN = 3;
export const CODE_MAX = 40;

/** A fresh code, `length` characters from the unambiguous alphabet. */
export function generateCode(length = 6): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** The code as the server compares it: case and every space aside (" Cloud 24 " = "cloud24"). */
export const normalizeCode = (code: string) => code.replace(/\s+/g, "").toLowerCase();

/** What is wrong with a code as typed, against the quest's other codes; null when it is fine. */
export function codeProblem(code: string, others: string[]): string | null {
  const c = normalizeCode(code);
  if (c.length < CODE_MIN) return `At least ${CODE_MIN} characters (spaces aside).`;
  if (code.trim().length > CODE_MAX) return `At most ${CODE_MAX} characters.`;
  if (others.some((o) => normalizeCode(o) === c)) return "Another code task already uses this code.";
  return null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const windowLine = (t: Pick<QuestTask, "starts_at" | "ends_at">) => {
  const f = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  if (t.starts_at && t.ends_at) return `Open ${f(t.starts_at)} to ${f(t.ends_at)}`;
  if (t.starts_at) return `Open from ${f(t.starts_at)}`;
  if (t.ends_at) return `Open until ${f(t.ends_at)}`;
  return "Open all through the quest";
};

/**
 * The code sheet: one code per page, large enough to read from the back of
 * a hall, with the task's title, its points and when it is open. For the
 * organiser to print and hand to whoever puts it on stage.
 */
export function codeSheetHtml(eventName: string, tasks: QuestTask[], mode: "checkmarks" | "points"): string {
  const pages = tasks
    .filter((t) => t.kind === "code" && typeof t.config.code === "string")
    .map(
      (t) => `<section class="page">
  <p class="event">${escapeHtml(eventName)}</p>
  <h1>${escapeHtml(t.title || "Secret code")}</h1>
  <p class="code">${escapeHtml(String(t.config.code))}</p>
  <p class="meta">${escapeHtml([mode === "points" && t.points ? `${t.points} points` : null, windowLine(t)].filter(Boolean).join(" · "))}</p>
  <p class="how">Type it in the event's Quest card, on the website or in the app.</p>
</section>`
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(eventName)} · quest codes</title>
<style>
  @page { size: A4 landscape; margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #10201d; }
  .page { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 24px; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .event { font-size: 18px; letter-spacing: .08em; text-transform: uppercase; color: #4c5d59; margin: 0; }
  h1 { font-size: 40px; margin: 12px 0 28px; }
  .code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 140px; font-weight: 700; letter-spacing: .12em; margin: 0; word-break: break-all; }
  .meta { font-size: 20px; color: #4c5d59; margin: 28px 0 6px; }
  .how { font-size: 16px; color: #4c5d59; margin: 0; }
</style></head>
<body>
${pages}
<script>window.addEventListener("load", function () { window.print(); });</script>
</body></html>`;
}
