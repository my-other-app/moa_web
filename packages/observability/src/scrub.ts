/**
 * What leaves the dashboards for Sentry, with the personal and secret parts
 * taken out.
 *
 * The SDK is told to collect little (see `PRIVATE_DATA_COLLECTION` in
 * options.ts), but these run on everything that is sent regardless, because
 * the risky values arrive where no SDK option reaches: an attendee's email in
 * a console line, a door key in a gate link, a kiosk token in the page URL, a
 * phone number in an exception message.
 */

export const FILTERED = "[Filtered]";

/** Plain and URL-encoded (`%40`) addresses. */
const EMAIL = /[A-Z0-9._%+-]+(?:@|%40)[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

/**
 * A run of digits, perhaps with a leading `+` and spaces, dots, dashes or
 * brackets between them. Only runs of 10 to 15 digits are phone numbers
 * (see `maskPhones`): Indian mobiles and E.164 numbers, but not a date
 * (2026-10-24 has eight digits) or a short id. Never preceded or followed by
 * a word character or a dash, so the last group of a UUID is not one.
 */
const PHONE_CANDIDATE = /(?<![\w-])[+(]?\d[\d ().-]{6,24}\d(?![\w-])/g;

/**
 * Query and fragment keys whose values are credentials. `key` is the door
 * key on a gate link (/gate/{id}?key=), `token` the kiosk, invite and
 * impersonation tokens (/kiosk?token=, /join?token=, /impersonate?token=).
 */
const SECRET_KEYS = new Set([
  "token",
  "key",
  "k",
  "code",
  "secret",
  "password",
  "pass",
  "otp",
  "sig",
  "signature",
  "auth",
  "access_token",
  "refresh_token",
  "id_token",
  "invite",
  "session",
]);

/** Query keys whose values are personal rather than secret. */
const PERSONAL_KEYS = new Set(["email", "email_id", "phone", "mobile"]);

/**
 * Routes whose next path segment is a credential, whatever it looks like:
 * the guest's check-in link (/s/{token}) and the email confirmation
 * (/confirm/{token}).
 */
const TOKEN_ROUTES = new Set(["s", "confirm"]);

function maskPhones(text: string): string {
  return text.replace(PHONE_CANDIDATE, (match) => {
    const digits = match.replace(/\D/g, "").length;
    return digits >= 10 && digits <= 15 ? "[phone]" : match;
  });
}

/** Emails and phone numbers, wherever they appear in a string. */
export function maskPII(text: string): string {
  return maskPhones(text.replace(EMAIL, "[email]"));
}

/** `key=value` pairs inside free text: a console line, an error message. */
const INLINE_PAIR = /\b([A-Za-z_]+)=([^&#\s"'<>]+)/g;

/** Free text: credentials in `key=value` form, then emails and phones. */
export function scrubText(text: string): string {
  const pairs = text.replace(INLINE_PAIR, (whole, key: string) => {
    const k = key.toLowerCase();
    return SECRET_KEYS.has(k) || PERSONAL_KEYS.has(k) ? `${key}=${FILTERED}` : whole;
  });
  return maskPII(pairs);
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function scrubParams(params: string): string {
  return params
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq < 0) return pair;
      const key = decodeSafely(pair.slice(0, eq)).toLowerCase();
      return SECRET_KEYS.has(key) || PERSONAL_KEYS.has(key) ? `${pair.slice(0, eq)}=${FILTERED}` : pair;
    })
    .join("&");
}

/**
 * An opaque credential in a path, outside the known token routes: long,
 * URL-safe, mixing letters and digits. UUIDs match too, which costs nothing:
 * an id is never what the reader of an error needs.
 */
function looksLikeToken(segment: string): boolean {
  return segment.length >= 20 && /^[A-Za-z0-9_-]+$/.test(segment) && /\d/.test(segment) && /[A-Za-z]/.test(segment);
}

/**
 * A URL, absolute or relative, with the credentials and personal details
 * out: secret and personal query or fragment values become [Filtered], token
 * path segments become :token, and any email or phone left is masked.
 */
export function scrubUrl(url: string): string {
  let rest = url;
  let hash: string | null = null;
  const hashAt = rest.indexOf("#");
  if (hashAt >= 0) {
    hash = rest.slice(hashAt + 1);
    rest = rest.slice(0, hashAt);
  }
  let query: string | null = null;
  const queryAt = rest.indexOf("?");
  if (queryAt >= 0) {
    query = rest.slice(queryAt + 1);
    rest = rest.slice(0, queryAt);
  }
  // The scheme and host stay as they are; only the path is looked at.
  const origin = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.exec(rest)?.[0] ?? "";
  const segments = rest.slice(origin.length).split("/");
  const path = segments
    .map((segment, i) => {
      if (!segment) return segment;
      const previous = segments[i - 1];
      return (previous !== undefined && TOKEN_ROUTES.has(previous) && i === 2) || looksLikeToken(segment) ? ":token" : segment;
    })
    .join("/");
  let out = origin + path;
  if (query !== null) out += `?${scrubParams(query)}`;
  if (hash !== null) out += `#${hash.includes("=") ? scrubParams(hash) : hash}`;
  return maskPII(out);
}

/** Keys whose values are never sent, at any depth. */
const DROPPED_KEYS = /body|cookie|authorization|password|token/i;
/** Keys whose string values are URLs or paths. */
const URL_KEYS = /url|href|path|route|target|^to$|^from$/i;
const MAX_DEPTH = 5;

/** Every string in a value scrubbed; URL-shaped keys as URLs; risky keys dropped. */
function scrubDeep(value: unknown, key: string, depth: number): unknown {
  if (typeof value === "string") return URL_KEYS.test(key) ? scrubUrl(value) : scrubText(value);
  if (depth >= MAX_DEPTH || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, key, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = DROPPED_KEYS.test(k) ? FILTERED : scrubDeep(v, k, depth + 1);
  }
  return out;
}

interface BreadcrumbLike {
  message?: string;
  data?: { [key: string]: unknown };
}

/** For `beforeBreadcrumb`: fetch, navigation, console and click crumbs alike. */
export function scrubBreadcrumb<T extends BreadcrumbLike>(breadcrumb: T): T {
  const out = { ...breadcrumb };
  if (typeof out.message === "string") out.message = scrubText(out.message);
  if (out.data) out.data = scrubDeep(out.data, "", 0) as T["data"];
  return out;
}

/** Request headers worth keeping: none of them identifies or authenticates anyone. */
const SAFE_HEADERS = new Set(["accept", "content-type", "content-length", "user-agent"]);

interface EventLike {
  message?: string;
  transaction?: string;
  request?: {
    url?: string;
    query_string?: unknown;
    headers?: { [key: string]: string };
    cookies?: unknown;
    data?: unknown;
    env?: unknown;
  };
  user?: { id?: string | number; [key: string]: unknown };
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: BreadcrumbLike[];
  extra?: { [key: string]: unknown };
}

/**
 * For `beforeSend` and `beforeSendTransaction`. The request keeps a scrubbed
 * URL and a few harmless headers; cookies, bodies and every other header go,
 * Authorization included. The user keeps an id at most.
 */
export function scrubEvent<T extends EventLike>(event: T): T {
  const out = { ...event };
  if (out.request) {
    const request = { ...out.request };
    delete request.cookies;
    delete request.data;
    delete request.env;
    if (typeof request.url === "string") request.url = scrubUrl(request.url);
    if (typeof request.query_string === "string") request.query_string = scrubParams(request.query_string);
    else if (request.query_string !== undefined) delete request.query_string;
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase())),
      );
    }
    out.request = request;
  }
  if (out.user) out.user = out.user.id !== undefined ? { id: out.user.id } : undefined;
  if (typeof out.message === "string") out.message = scrubText(out.message);
  if (typeof out.transaction === "string") out.transaction = scrubUrl(out.transaction);
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => (typeof v.value === "string" ? { ...v, value: scrubText(v.value) } : v)),
    };
  }
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb);
  if (out.extra) out.extra = scrubDeep(out.extra, "", 0) as T["extra"];
  return out;
}

interface SpanLike {
  description?: string;
  data: { [key: string]: unknown };
}

/** For `beforeSendSpan`: the description ("GET /kiosk?token=…") and string attributes. */
export function scrubSpan<T extends SpanLike>(span: T): T {
  const data: { [key: string]: unknown } = {};
  for (const [key, value] of Object.entries(span.data)) {
    data[key] = typeof value === "string" ? (URL_KEYS.test(key) ? scrubUrl(value) : scrubText(value)) : value;
  }
  const out = { ...span, data };
  if (typeof span.description === "string") out.description = scrubUrl(span.description);
  return out;
}
