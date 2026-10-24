import { captureMessage, getClient, withScope } from "@sentry/nextjs";

import { scrubUrl } from "./scrub";

/** One proxied call, as the BFF gateway saw it. */
export interface UpstreamResult {
  method: string;
  /** The API path, without the query string, e.g. /api/v1/events/42/attendees. */
  path: string;
  status: number;
  durationMs: number;
}

/**
 * The path with ids and credentials out, so one failing endpoint is one
 * Sentry issue rather than one per event id: /api/v1/events/:id/attendees.
 */
export function normalizeApiPath(path: string): string {
  const bare = path.split("?")[0] ?? "";
  return scrubUrl(bare)
    .split("/")
    .map((segment) => (/^\d+$/.test(segment) ? ":id" : segment))
    .join("/");
}

/**
 * Report an upstream 5xx to Sentry; let everything else pass.
 *
 * A 4xx is the API answering the caller -- a wrong password, an expired
 * session, a form that did not validate -- and the page already shows it, so
 * it is not an error to chase. A 5xx is the API failing, and the gateway
 * passes it straight through, so without this it never reaches Sentry at
 * all. With Sentry off (no DSN, so no client) this does nothing.
 */
export function reportUpstreamResponse(result: UpstreamResult): void {
  if (result.status < 500) return;
  if (!getClient()) return;

  const path = normalizeApiPath(result.path);
  withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("gateway.status", String(result.status));
    scope.setTag("gateway.method", result.method);
    scope.setContext("gateway", { method: result.method, path, status: result.status, duration_ms: result.durationMs });
    scope.setFingerprint(["gateway-upstream", result.method, path, String(result.status)]);
    captureMessage(`Upstream ${result.status} on ${result.method} ${path}`);
  });
}
