/**
 * What a ticket can say, and the small template language that says it.
 *
 * Tokens are a fixed catalogue, not free-form: a typo is caught when the
 * design is saved, not discovered on five hundred printed tickets. The names
 * other ticketing tools use are accepted as aliases. The language is
 * deliberately tiny -- tokens, three filters, and if/else.
 */

export type TokenGroup = "Guest" | "Ticket" | "Event" | "Club" | "Certificate" | "Guest fields";

export interface TicketToken {
  key: string;
  group: TokenGroup;
  label: string;
  sample: string;
  aliases?: readonly string[];
  note?: string;
}

export const TICKET_TOKENS: readonly TicketToken[] = [
  { key: "attendee_name", group: "Guest", label: "Guest name", sample: "Ananya Iyer", aliases: ["name", "guest_name", "full_name", "delegate_name", "participant_name"] },
  { key: "first_name", group: "Guest", label: "First name", sample: "Ananya" },
  { key: "last_name", group: "Guest", label: "Last name", sample: "Iyer" },
  { key: "organization", group: "Guest", label: "Their organisation", sample: "Sahyadri Systems", aliases: ["company", "organisation", "institution", "college"] },
  { key: "email", group: "Guest", label: "Email", sample: "ananya@sahyadrisystems.in" },
  { key: "seat", group: "Guest", label: "Seat label", sample: "A-014", aliases: ["seat_label", "seat_number"] },
  { key: "admission_no", group: "Ticket", label: "Admission number", sample: "MOA-0041-KF26", aliases: ["ticket_code", "ticket_id", "ticket_number", "invite_code"], note: "Typed at the gate when a QR will not scan." },
  { key: "ticket_type", group: "Ticket", label: "Ticket type", sample: "VIP", aliases: ["ticket_name", "ticket_type_name", "pass_type", "role"] },
  { key: "event_name", group: "Event", label: "Event name", sample: "Builders Day", aliases: ["event_title", "event"] },
  { key: "event_date", group: "Event", label: "Date", sample: "16 Sept 2026", aliases: ["date", "event_start_date"] },
  { key: "event_day", group: "Event", label: "Weekday", sample: "Wednesday" },
  { key: "event_time", group: "Event", label: "Start time", sample: "09:00", aliases: ["event_start_time", "start_time", "time"] },
  { key: "event_end_time", group: "Event", label: "End time", sample: "18:00", aliases: ["end_time"] },
  { key: "event_end_date", group: "Event", label: "End date", sample: "16 Sept 2026", note: "Empty when the event ends the day it starts." },
  { key: "venue", group: "Event", label: "Venue", sample: "KTPO Convention Centre, Bengaluru", aliases: ["event_venue", "location", "event_location"] },
  { key: "event_code", group: "Event", label: "Event code", sample: "GBD26" },
  { key: "organiser", group: "Event", label: "Organiser", sample: "Google Developer Relations", aliases: ["organizer", "host"] },
  { key: "org_name", group: "Club", label: "Club name", sample: "Yukthi", aliases: ["club_name", "client_name", "org"] },
  { key: "team_name", group: "Guest", label: "Team", sample: "Team Nova", aliases: ["team"] },
  { key: "certificate_no", group: "Certificate", label: "Certificate number", sample: "CERT-0041-KF26", aliases: ["certificate_number", "certificate_id"], note: "Unique per guest; the verification code the QR carries points at it." },
  { key: "issued_date", group: "Certificate", label: "Issued on", sample: "18 Sept 2026", aliases: ["issue_date", "certificate_date"] },
  { key: "checked_in_date", group: "Certificate", label: "Attended on", sample: "16 Sept 2026", note: "The day they checked in; the event date when they never did." },
  { key: "placing", group: "Certificate", label: "Placing", sample: "First", aliases: ["position", "rank"] },
];

const BY_NAME = new Map<string, string>();
for (const t of TICKET_TOKENS) {
  BY_NAME.set(t.key, t.key);
  for (const a of t.aliases ?? []) BY_NAME.set(a, t.key);
}
export const TOKEN_BY_KEY = new Map(TICKET_TOKENS.map((t) => [t.key, t]));

/** A guest-list column as a token: "T-Shirt Size" → field.t_shirt_size. */
export const fieldSlug = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
export const fieldToken = (label: string) => `field.${fieldSlug(label)}`;

/** The canonical key a written name stands for, or null when it is not a token. */
export const canonicalToken = (name: string, extra?: ReadonlySet<string>): string | null => {
  const n = name.trim().toLowerCase();
  if (extra?.has(n)) return n;
  if (/^field\.[a-z0-9_]{1,40}$/.test(n)) return n;
  return BY_NAME.get(n) ?? null;
};

export const TEMPLATE_FILTERS = ["upper", "lower", "title"] as const;
type Filter = (typeof TEMPLATE_FILTERS)[number];

export type TemplateNode =
  | { t: "text"; v: string }
  | { t: "var"; key: string; filters: Filter[] }
  | { t: "if"; key: string; negate: boolean; then: TemplateNode[]; else: TemplateNode[] };

export interface ParsedTemplate {
  nodes: TemplateNode[];
  errors: string[];
  /** Canonical keys the template reads. */
  tokens: string[];
}

const distance = (a: string, b: string) => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length]![b.length]!;
};

const suggest = (name: string) => {
  let best: { name: string; d: number } | null = null;
  for (const candidate of BY_NAME.keys()) {
    const d = distance(name.toLowerCase(), candidate);
    if (d <= 3 && (!best || d < best.d)) best = { name: candidate, d };
  }
  return best ? ` Did you mean {{${best.name}}}?` : "";
};

const TAG = /\{\{([\s\S]*?)\}\}|\{%([\s\S]*?)%\}/g;

/** Parse a layer's text. Errors are for the designer; the template still parses as far as it can. */
export const parseTicketTemplate = (src: string, extra?: ReadonlySet<string>): ParsedTemplate => {
  const root: TemplateNode[] = [];
  const errors: string[] = [];
  const tokens = new Set<string>();
  const stack: { node: Extract<TemplateNode, { t: "if" }>; inElse: boolean }[] = [];
  const target = () => {
    const top = stack.at(-1);
    return top ? (top.inElse ? top.node.else : top.node.then) : root;
  };
  const resolve = (raw: string) => {
    const key = canonicalToken(raw, extra);
    if (!key) errors.push(`{{${raw.trim()}}} is not a token.${suggest(raw.trim())}`);
    else tokens.add(key);
    return key;
  };

  let last = 0;
  for (const m of src.matchAll(TAG)) {
    if (m.index! > last) target().push({ t: "text", v: src.slice(last, m.index) });
    last = m.index! + m[0].length;
    if (m[1] !== undefined) {
      const [name = "", ...rest] = m[1].split("|").map((s) => s.trim());
      if (!name) {
        errors.push("An empty {{ }} needs a token name inside it.");
        continue;
      }
      const filters: Filter[] = [];
      for (const f of rest) {
        if ((TEMPLATE_FILTERS as readonly string[]).includes(f.toLowerCase())) filters.push(f.toLowerCase() as Filter);
        else errors.push(`"${f}" is not a filter. Use ${TEMPLATE_FILTERS.join(", ")}.`);
      }
      const key = resolve(name);
      if (key) target().push({ t: "var", key, filters });
      continue;
    }
    const tag = (m[2] ?? "").trim();
    const cond = /^if\s+(not\s+)?(?:\{\{\s*)?([A-Za-z0-9_.]+)(?:\s*\}\})?$/i.exec(tag);
    if (cond) {
      const key = resolve(cond[2]!) ?? "";
      const node: Extract<TemplateNode, { t: "if" }> = { t: "if", key, negate: !!cond[1], then: [], else: [] };
      target().push(node);
      stack.push({ node, inElse: false });
    } else if (/^else$/i.test(tag)) {
      const top = stack.at(-1);
      if (!top) errors.push("{% else %} has no {% if %} before it.");
      else if (top.inElse) errors.push("An {% if %} can have only one {% else %}.");
      else top.inElse = true;
    } else if (/^endif$/i.test(tag)) {
      if (!stack.pop()) errors.push("{% endif %} has no {% if %} to close.");
    } else {
      errors.push(`{% ${tag} %} is not understood. Use {% if token %}, {% else %} and {% endif %}.`);
    }
  }
  if (last < src.length) target().push({ t: "text", v: src.slice(last) });
  if (stack.length)
    errors.push(`${stack.length === 1 ? "An" : stack.length} {% if %} ${stack.length === 1 ? "is" : "are"} never closed with {% endif %}.`);
  return { nodes: root, errors, tokens: [...tokens].sort() };
};

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());

const applyFilters = (v: string, filters: Filter[]) =>
  filters.reduce((acc, f) => (f === "upper" ? acc.toUpperCase() : f === "lower" ? acc.toLowerCase() : titleCase(acc)), v);

export const renderTemplateNodes = (nodes: TemplateNode[], values: Record<string, string>): string =>
  nodes
    .map((n) => {
      if (n.t === "text") return n.v;
      if (n.t === "var") return applyFilters(values[n.key] ?? "", n.filters);
      const truthy = !!values[n.key]?.trim();
      return renderTemplateNodes(truthy !== n.negate ? n.then : n.else, values);
    })
    .join("");

export const renderTicketTemplate = (src: string, values: Record<string, string>, extra?: ReadonlySet<string>) =>
  renderTemplateNodes(parseTicketTemplate(src, extra).nodes, values);

const PER_GUEST_TOKENS: ReadonlySet<string> = new Set([
  ...TICKET_TOKENS.filter((t) => t.group === "Guest" || t.group === "Certificate").map((t) => t.key),
  "admission_no",
]);

/** Whether text says something only one guest's card can say. */
export const carriesPerGuestToken = (src: string): boolean =>
  parseTicketTemplate(src).tokens.some((k) => PER_GUEST_TOKENS.has(k) || k.startsWith("field."));

/** Sample values for the canvas: the catalogue's samples, plus any extra tokens the host adds. */
export const sampleValues = (extra: readonly TicketToken[] = []): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const t of [...TICKET_TOKENS, ...extra]) out[t.key] = t.sample;
  return out;
};
