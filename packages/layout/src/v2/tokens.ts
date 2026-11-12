import { canonicalToken, parseTicketTemplate, type ParsedTemplate, renderTemplateNodes, TICKET_TOKENS } from "../ticket-tokens";
import type { DocKind } from "./schema";

/**
 * What a v2 text layer can say (contract V5): v1's language and catalogue,
 * plus every token the 35 designer designs print, with the meanings
 * app/api/doc_presets/values.py gives them. A design token is read as
 * itself, never as a v1 alias of the same spelling: on a badge {{role}} is
 * ATTENDEE/SPEAKER/STAFF, not the ticket's type. The backend's
 * `app/core/layout_v2/vocabulary.py`, row for row.
 */

export type DesignTokenKinds = "ticket" | "certificate" | "badge";

export interface DesignToken {
  key: string;
  group: string;
  label: string;
  sample: string;
  kinds: DesignTokenKinds[];
  /** Also a v1 token name (a key or an alias). */
  v1: boolean;
}

// key, group, label, sample, kinds ("t" ticket, "c" certificate, "b" badge)
const ROWS: readonly (readonly [string, string, string, string, string])[] = [
  ["app_name", "Event", "Organiser (the club's name)", "EVENTLY", "t"],
  ["tagline", "Event", "Tagline (hidden unless set)", "An evening of live music", "t"],
  ["date", "Event", "Date", "14 Feb 2027", "t"],
  ["doors_time", "Event", "Doors open (hidden unless set)", "18:30", "t"],
  ["start_time", "Event", "Start time", "19:30", "tb"],
  ["gate", "Seating", "Gate (hidden without seating)", "B2", "t"],
  ["row", "Seating", "Row (hidden without seating)", "F", "t"],
  ["seat", "Seating", "Seat (hidden without seating)", "12", "t"],
  ["ticket_type", "Ticket", "Ticket type", "VIP", "t"],
  ["ticket_id", "Ticket", "Ticket code", "TK-48213", "t"],
  ["attendee_name", "Guest", "Guest name", "Asha Nair", "t"],
  ["venue", "Event", "Venue (or Online)", "Tagore Theatre, Trivandrum", "t"],
  ["event_name", "Event", "Event name", "Sunset Sessions", "tb"],
  ["recipient_name", "Guest", "Recipient's name", "Ananya R. Menon", "c"],
  ["institute_name", "Club", "Issuer (the club's name)", "Sample Institute of Technology", "c"],
  ["certificate_id", "Certificate", "Certificate number", "CERT-2026-000123", "c"],
  ["verify_url", "Certificate", "Verify address (what the QR opens)", "https://example.com/verify/CERT-2026-000123", "c"],
  ["course_title", "Event", "Programme (the event's name)", "Full Stack Web Development", "c"],
  ["event_title", "Event", "Event name", "Robotics Weekend Workshop", "c"],
  ["event_date", "Event", "Event date", "8 November 2026", "cb"],
  ["issue_date", "Certificate", "Issued on", "12 November 2026", "c"],
  ["issue_year", "Certificate", "Year of issue", "2026", "c"],
  ["start_date", "Event", "Start date", "1 June 2026", "c"],
  ["end_date", "Event", "End date", "30 October 2026", "c"],
  ["completion_date", "Event", "Completed on (the event's end)", "30 October 2026", "c"],
  ["issue_city", "Event", "City of issue (the event's city)", "Trivandrum", "c"],
  ["grade", "Certificate", "Grade (the placing, if any)", "A+", "c"],
  ["rank_or_grade", "Certificate", "Rank or grade (the placing, if any)", "First Rank", "c"],
  ["signatory_name", "Signatories", "Signatory (hidden unless set)", "Dr. Sample Name", "c"],
  ["signatory_designation", "Signatories", "Signatory's title (hidden unless set)", "Director", "c"],
  ["second_signatory_name", "Signatories", "Second signatory (hidden unless set)", "Sample Name", "c"],
  ["second_signatory_designation", "Signatories", "Second signatory's title (hidden unless set)", "Course Lead", "c"],
  ["duration_hours", "Certificate", "Duration in hours (hidden unless set)", "120", "c"],
  ["expiry_date", "Certificate", "Valid until (hidden unless set)", "12 November 2029", "c"],
  ["first_name", "Guest", "First name", "Meera", "b"],
  ["last_name", "Guest", "Last name", "Pillai", "b"],
  ["full_name", "Guest", "Full name", "Meera Pillai", "b"],
  ["initials", "Guest", "Initials", "MP", "b"],
  ["job_title", "Guest", "Job title (hidden unless bound)", "Product Designer", "b"],
  ["organization", "Guest", "Their organisation", "Acme Labs", "b"],
  ["role", "Badge", "Role: ATTENDEE, SPEAKER or STAFF", "ATTENDEE", "b"],
  ["access_level", "Badge", "Access (the ticket's name)", "All-access", "b"],
  ["badge_id", "Badge", "Badge number (admission number, else ticket code)", "A-0417", "b"],
  ["event_year", "Event", "Event year", "2026", "b"],
  ["event_venue", "Event", "Venue (or Online)", "Trivandrum", "b"],
  ["event_tagline", "Event", "Tagline (hidden unless set)", "48h build", "b"],
  ["org_name", "Club", "Club name", "Makers Club", "b"],
  ["org_founded_year", "Club", "Club founded (hidden unless set)", "2019", "b"],
  ["city", "Event", "City", "Kochi", "b"],
  ["chapter", "Club", "Chapter (hidden unless set)", "Design Circle", "b"],
  ["membership_tier", "Badge", "Tier (the ticket's name, upper case)", "GOLD MEMBER", "b"],
  ["member_id", "Badge", "Member number (the badge number)", "CL-2291", "b"],
  ["member_since_year", "Guest", "Registered in (year)", "2023", "b"],
  ["joined_date", "Guest", "Registered (month)", "Mar 2023", "b"],
  ["valid_thru", "Badge", "Valid on (the event date)", "12 / 2027", "b"],
  ["valid_year", "Badge", "Valid year", "2027", "b"],
  ["zone", "Badge", "Zone (hidden unless set)", "B2", "b"],
  ["hall", "Badge", "Hall (hidden unless set)", "HALL B", "b"],
  ["day_label", "Badge", "Day (hidden unless set)", "DAY 1", "b"],
  ["doors_open_time", "Event", "Doors open (hidden unless set)", "09:00", "b"],
  ["session_hall", "Badge", "Session hall (hidden unless set)", "Hall B", "b"],
  ["session_time", "Badge", "Session time (hidden unless set)", "11:30", "b"],
  ["checkin_time", "Badge", "Checked in at", "09:12", "b"],
  ["kiosk_id", "Badge", "Door or kiosk printing it", "03", "b"],
  ["booth_no", "Badge", "Booth (hidden unless set)", "C-14", "b"],
  ["table_no", "Badge", "Table (hidden unless set)", "27", "b"],
  ["track", "Badge", "Track (hidden unless set)", "FinTech", "b"],
  ["team_name", "Guest", "Team", "Null Pointers", "b"],
  ["bib_number", "Badge", "Bib number", "2047", "b"],
  ["category", "Badge", "Category (hidden unless set)", "10K", "b"],
  ["wave", "Badge", "Wave (hidden unless set)", "B", "b"],
];

const KIND: Record<string, DesignTokenKinds> = { t: "ticket", c: "certificate", b: "badge" };

/** Pictures a showIf may name: present when the context carries that picture. */
export const IMAGE_TOKENS: Readonly<Record<string, string>> = {
  logo_src: "org_logo",
  photo_url: "guest_photo",
  sponsor_src: "sponsor",
  signature_src: "signature_1",
  second_signature_src: "signature_2",
};

const V1_NAMES: ReadonlySet<string> = new Set(TICKET_TOKENS.flatMap((t) => [t.key, ...(t.aliases ?? [])]));

export const DESIGN_TOKENS: readonly DesignToken[] = ROWS.map(([key, group, label, sample, kinds]) => ({
  key,
  group,
  label,
  sample,
  kinds: [...kinds].map((c) => KIND[c]!),
  v1: V1_NAMES.has(key),
}));

const byKind = new Map<string, ReadonlySet<string>>();

/** The designs' token names for a kind (the `extra` set the template parser reads them with). */
export const designTokens = (kind: string): ReadonlySet<string> => {
  let s = byKind.get(kind);
  if (!s) {
    s = new Set(DESIGN_TOKENS.filter((t) => (t.kinds as string[]).includes(kind)).map((t) => t.key));
    byKind.set(kind, s);
  }
  return s;
};

/** The catalogue additions for a kind (the API's `tokens`). */
export const tokensV2 = (kind: DocKind): DesignToken[] => DESIGN_TOKENS.filter((t) => t.kinds.includes(kind as DesignTokenKinds));

/** Every token name a layout of this kind may use: v1's keys and aliases, and the kind's design tokens (field.<slug> is always allowed). */
export const knownTokens = (kind: string): ReadonlySet<string> => new Set([...V1_NAMES, ...designTokens(kind)]);

/** A sample value for every token of a kind: the designers' samples over v1's. */
export const samplesV2 = (kind: string): Record<string, string> => {
  const out: Record<string, string> = Object.fromEntries(TICKET_TOKENS.map((t) => [t.key, t.sample]));
  for (const t of DESIGN_TOKENS) if ((t.kinds as string[]).includes(kind)) out[t.key] = t.sample;
  return out;
};

const parsed = new Map<string, ParsedTemplate>();

/** A text template parsed for a kind (v1's parser, the kind's design tokens as its own). */
export const parseV2 = (src: string, kind: string = "ticket"): ParsedTemplate => {
  const key = `${kind}\u0000${src}`;
  let p = parsed.get(key);
  if (!p) {
    p = parseTicketTemplate(src, designTokens(kind));
    if (parsed.size > 4096) parsed.clear();
    parsed.set(key, p);
  }
  return p;
};

/** A text template filled. Values are plain text (escaping is the builder's). */
export const fillTemplate = (src: string, values: Readonly<Record<string, string>>, kind: string = "ticket"): string =>
  src.includes("{") ? renderTemplateNodes(parseV2(src, kind).nodes, values as Record<string, string>) : src;

const withImages = new Map<string, ReadonlySet<string>>();

/** The canonical key of a token name for a kind (a picture's name too), or null when it is not one. */
export const canonicalV2 = (name: string, kind: string = "ticket"): string | null => {
  let names = withImages.get(kind);
  if (!names) {
    names = new Set([...designTokens(kind), ...Object.keys(IMAGE_TOKENS)]);
    withImages.set(kind, names);
  }
  return canonicalToken(name, names);
};

/** Whether a token has a value (after trimming), by any of its names. */
export const presentV2 = (name: string, values: Readonly<Record<string, string>>, kind: string = "ticket"): boolean => {
  const key = canonicalV2(name, kind) ?? name;
  let v: string | undefined = values[key];
  if (v === undefined && key !== name) v = values[name];
  return !!String(v ?? "").trim();
};

/** A layer's showIf: "a" (a has a value), "a b" (all), "a|b" (any). */
export const showV2 = (showIf: string | null | undefined, values: Readonly<Record<string, string>>, kind: string = "ticket"): boolean => {
  if (!showIf) return true;
  if (showIf.includes("|")) return showIf.split("|").filter((t) => t.trim()).some((t) => presentV2(t, values, kind));
  return showIf.split(/\s+/).filter(Boolean).every((t) => presentV2(t, values, kind));
};

/** The token names a showIf reads. */
export const showIfNames = (showIf: string | null | undefined): string[] => (showIf ? showIf.replace(/\|/g, " ").split(/\s+/).filter(Boolean) : []);
