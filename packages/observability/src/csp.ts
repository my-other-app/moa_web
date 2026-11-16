import { maskPII, scrubUrl } from "./scrub";

/**
 * The dashboards' Content-Security-Policy reports.
 *
 * Each app sends its script policy as Content-Security-Policy-Report-Only
 * (next.config.ts), so the browser enforces nothing and reports what the
 * policy would have blocked. The reports go to Sentry's security endpoint,
 * as the public website's do, but by way of the app itself
 * (`CSP_REPORT_PATH`): a browser puts the page's full address in a report,
 * and a dashboard's address can carry a search term, a door key or an
 * invite token. This route keeps what says what was blocked, takes every
 * query string, fragment and credential out, then passes the report on.
 * With Sentry off (no DSN) the policy names no report address and this
 * route sends nothing.
 */

/** Where the pages' reports go (the route at app/api/csp-report in each app). */
export const CSP_REPORT_PATH = "/api/csp-report";

/** The largest report read; anything bigger is dropped unread. */
export const CSP_REPORT_MAX_BYTES = 16_384;

/**
 * Sentry's security endpoint for a DSN:
 * https://<key>@<host>/<project> → https://<host>/api/<project>/security/?sentry_key=<key>,
 * with the environment and release when known. Null without a usable DSN.
 */
export function sentrySecurityUrl(dsn: string | null | undefined, tags: { environment?: string; release?: string } = {}): string | null {
  if (!dsn?.trim()) return null;
  try {
    const u = new URL(dsn.trim());
    const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (u.protocol !== "https:" || !u.username || !/^\d+$/.test(project)) return null;
    const out = new URL(`https://${u.host}/api/${project}/security/`);
    out.searchParams.set("sentry_key", u.username);
    if (tags.environment?.trim()) out.searchParams.set("sentry_environment", tags.environment.trim());
    if (tags.release?.trim()) out.searchParams.set("sentry_release", tags.release.trim());
    return out.toString();
  } catch {
    return null;
  }
}

/**
 * Pages whose address is a credential (a door key, a kiosk's pairing, an
 * impersonation hand-off, an invite, a guest's check-in or confirmation
 * link): a report names only which kind of page it was.
 */
const CREDENTIAL_ROOTS = new Set(["gate", "kiosk", "impersonate", "join", "s", "confirm", "accept-invite"]);

/** Keywords a report uses instead of an address. */
const KEYWORDS = new Set(["inline", "eval", "wasm-eval", "trusted-types-policy", "trusted-types-sink", "self", "data", "blob"]);

/**
 * An address as a report may carry it: http(s) origin and path only (no
 * query, no fragment, no user or password), the path of a credential page
 * cut to its first segment, token-like segments out, emails and phone
 * numbers masked. A keyword (`inline`, `eval`...) or a bare scheme
 * (`data`, `blob`) stays as it is; anything else is left out.
 */
export function reportUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const v = value.trim();
  if (KEYWORDS.has(v)) return v;
  if (/^(?:data|blob|about|chrome-extension|moz-extension|safari-web-extension):/i.test(v)) return v.split(":")[0]!.toLowerCase();
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:" && u.protocol !== "wss:" && u.protocol !== "ws:") return undefined;
  const segments = u.pathname.split("/");
  const path = CREDENTIAL_ROOTS.has(segments[1] ?? "") && segments.length > 2 ? `/${segments[1]}/:token` : u.pathname;
  return scrubUrl(`${u.protocol}//${u.host}${path}`);
}

/** The fields of a report that say what was blocked; every other field is dropped. */
const URL_FIELDS = ["document-uri", "referrer", "blocked-uri", "source-file"] as const;
const TEXT_FIELDS = ["violated-directive", "effective-directive", "original-policy", "disposition"] as const;
const NUMBER_FIELDS = ["status-code", "line-number", "column-number"] as const;

export type CspReport = { "csp-report": Record<string, string | number> };

/**
 * One report as `report-uri` sends it (`{"csp-report": {...}}`), cut to the
 * fields above with every address passed through `reportUrl`. No script
 * sample is kept. Null when it is not a report.
 */
export function scrubCspReport(body: unknown): CspReport | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as Record<string, unknown>)["csp-report"];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const key of URL_FIELDS) {
    const url = reportUrl(r[key]);
    if (url) out[key] = url;
  }
  for (const key of TEXT_FIELDS) {
    const v = r[key];
    if (typeof v === "string" && v) out[key] = maskPII(v.slice(0, 4000));
  }
  for (const key of NUMBER_FIELDS) {
    const v = r[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  if (!out["document-uri"] || !(out["effective-directive"] || out["violated-directive"])) return null;
  return { "csp-report": out };
}

export interface CspReportOptions {
  /** Sentry's security endpoint (`sentrySecurityUrl`); null sends nothing. */
  endpoint: string | null;
  /** Tests stand in for fetch. */
  fetchImpl?: typeof fetch;
  /** How long Sentry has to take a report. */
  timeoutMs?: number;
}

const accepted = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

/**
 * The POST handler for `CSP_REPORT_PATH`: reads one report (at most
 * CSP_REPORT_MAX_BYTES), scrubs it and passes it to Sentry with the
 * browser's User-Agent and nothing else of the request (no cookies, no
 * address). Always answers 204: a report is never worth an error page.
 */
export function cspReportHandler({ endpoint, fetchImpl, timeoutMs = 3000 }: CspReportOptions) {
  return async function POST(request: Request): Promise<Response> {
    if (!endpoint) return accepted();
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > CSP_REPORT_MAX_BYTES) return accepted();
    let text: string;
    try {
      text = await request.text();
    } catch {
      return accepted();
    }
    if (!text || text.length > CSP_REPORT_MAX_BYTES) return accepted();
    let report: CspReport | null;
    try {
      report = scrubCspReport(JSON.parse(text));
    } catch {
      return accepted();
    }
    if (!report) return accepted();
    const send = fetchImpl ?? fetch;
    try {
      await send(endpoint, {
        method: "POST",
        headers: { "content-type": "application/csp-report", "user-agent": request.headers.get("user-agent") ?? "" },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
    } catch {
      // Sentry slow or down: the report is dropped.
    }
    return accepted();
  };
}
