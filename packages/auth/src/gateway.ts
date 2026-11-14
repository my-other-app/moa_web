import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./constants";

/**
 * Builds the BFF route handlers mounted at /api/gateway/[...path].
 *
 * Why this exists rather than calling the API directly from the browser:
 * the backend's auth cookie is host-only and SameSite=Lax, so it is simply
 * not sent on a cross-site XHR. A dashboard deployed on a different
 * registrable domain (any Vercel preview URL, for instance) silently fails to
 * authenticate. Routing through the app's own origin makes the cookie
 * first-party everywhere, removes CORS from the picture entirely, and leaves
 * one chokepoint for CSRF defence, which the backend has none of.
 *
 * Because the dashboards call nothing but their own origin, the gateway
 * needs no CORS at all, and gives none: it answers OPTIONS itself and passes
 * no `Access-Control-*` header on from the API. The API does allow
 * credentialed CORS for the public website, which calls it directly; passed
 * through here, that answer was given on the dashboard's own origin, so
 * another site's script could have used a signed-in admin's session.
 * Only this dashboard's own pages use the gateway, so a request the browser
 * says another site started is refused whatever its method (see
 * `isCrossSite`); a request that changes something must also name this
 * origin (see `isSameOrigin`). The session tokens never reach page script:
 * the HttpOnly cookies are the session (see `stripTokens`).
 *
 * The API has a fixed time to start answering (see `upstreamTimeout`), and
 * a request the browser gave up on is cancelled upstream as well.
 */
export interface GatewayOptions {
  /**
   * Upstream API origin, e.g. https://api.myotherapp.in
   *
   * Optional, and resolved per request rather than at module load. Reading it
   * at import time makes `next build` fail wherever the variable is not set --
   * Next evaluates route modules while collecting page data, so CI broke even
   * though the value is only ever needed at runtime.
   */
  apiUrl?: string;
  /**
   * Request headers never forwarded upstream. `host` would break virtual
   * hosting and TLS SNI; `connection`/`content-length` are recomputed by
   * fetch and forwarding stale values corrupts the body.
   */
  stripRequestHeaders?: string[];
  /**
   * Told the outcome of every proxied call: method, API path (no query
   * string), status and time taken. The apps pass Sentry's reporter here so
   * an upstream 5xx is seen; the gateway itself stays free of any tracking
   * dependency. Whatever it throws is swallowed -- reporting must never
   * break the proxy.
   */
  onUpstreamResponse?: (result: { method: string; path: string; status: number; durationMs: number }) => void;
  /**
   * How long the API has to start answering, in milliseconds: `standard`
   * for most calls, `long` for the slow ones (see `upstreamTimeout`).
   * Defaults to UPSTREAM_TIMEOUT_MS; tests pass short ones.
   */
  timeouts?: Partial<UpstreamTimeouts>;
}

export interface UpstreamTimeouts {
  standard: number;
  long: number;
}

/** A minute for an ordinary call; three for a big decision, an import, an export, a bundle, a PDF or an AI draft. */
export const UPSTREAM_TIMEOUT_MS: Readonly<UpstreamTimeouts> = { standard: 60_000, long: 180_000 };

/** What a call the API took too long to answer is answered with (a 504). */
export const UPSTREAM_TIMEOUT = "UPSTREAM_TIMEOUT";

const DEFAULT_STRIPPED = [
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
];

type RouteContext = { params: Promise<{ path?: string[] }> };

/** Methods that only read: everything else must also name this origin. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** What a refused cross-origin request is answered with. */
export const CROSS_ORIGIN_REFUSED = "CROSS_ORIGIN_REFUSED";

/** A 403 that says where to go instead: the dashboard, then the same button there. */
const refused = () =>
  Response.json(
    { message: "This request did not come from this dashboard, so it was not sent. Open the dashboard, reload the page and try again from there.", error_code: CROSS_ORIGIN_REFUSED },
    { status: 403, headers: { "cache-control": "no-store" } },
  );

/** Body fields that are a session: the HttpOnly cookies carry it instead. */
const TOKEN_FIELDS = ["access_token", "refresh_token"] as const;

/** Where sign-in, refresh, Google, password reset and the impersonation exchange live. */
const AUTH_PREFIX = "/api/v1/auth/";

/**
 * The hosts this request was addressed to: the Host header (Caddy and
 * Vercel pass the visitor's through), the proxy's X-Forwarded-Host should a
 * proxy rewrite Host, and the host Next built the request URL from. None of
 * them can be chosen by another site's script: a cross-origin request with a
 * header of its own needs a preflight, which this gateway never grants.
 */
function ownHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  const add = (value: string | null | undefined) => {
    const host = value?.split(",")[0]?.trim().toLowerCase();
    if (host) hosts.add(host);
  };
  add(request.headers.get("host"));
  add(request.headers.get("x-forwarded-host"));
  try {
    add(new URL(request.url).host);
  } catch {
    // A relative URL in a test: the headers decide.
  }
  return hosts;
}

/**
 * The browser says another site started this request.
 *
 * Every current browser names who started a request in `Sec-Fetch-Site`:
 * `same-origin` for this dashboard's own pages (its fetches, its links, a
 * `window.open` of an export), `none` for the person themselves (the
 * address bar, a bookmark). Anything else -- `same-site` (the public
 * website, the other dashboard, a club's site) or `cross-site` -- did not
 * come from here: nothing the dashboards do sends it, and it is refused for
 * every method, reads included. Without the header (an older browser, a
 * server-side call) this says nothing, and the other checks decide.
 */
export function isCrossSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === null) return false;
  const value = site.trim().toLowerCase();
  return value !== "same-origin" && value !== "none";
}

/**
 * The request came from a page on this dashboard's own origin.
 *
 * Every browser in use sends `Origin` on a request that is not GET or HEAD,
 * and `Sec-Fetch-Site` on all of them. Either one naming another site --
 * the public website and the other dashboard included, which share the
 * registrable domain and so the SameSite=Lax cookies -- refuses it; so does
 * a request with neither (fail closed: nothing in the dashboards sends one).
 * An `Origin` of "null" (a sandboxed frame, a data: URL) is another site.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (origin === null && site === null) return false;
  if (site !== null && site.toLowerCase() !== "same-origin") return false;
  if (origin !== null) {
    let host: string;
    try {
      host = new URL(origin).host.toLowerCase();
    } catch {
      return false; // "null", or not a URL
    }
    if (!host || !ownHosts(request).has(host)) return false;
  }
  return true;
}

/**
 * The API's JSON answer with the session tokens taken out. Sign-in, refresh,
 * Google sign-in, password reset and the impersonation exchange all return
 * them in the body as well as in the HttpOnly cookies they set; handed to
 * page script, any script on the page could carry the session away. Applied
 * to every auth route, and to any answer that sets the session cookie.
 * Anything that is not a JSON object passes unchanged.
 */
export function stripTokens(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return body;
  const record = parsed as Record<string, unknown>;
  if (!TOKEN_FIELDS.some((field) => field in record)) return body;
  for (const field of TOKEN_FIELDS) delete record[field];
  return JSON.stringify(record);
}

const isJson = (type: string | null) => !!type && /^application\/(?:[\w.+-]+\+)?json\b/i.test(type);

const setsSession = (cookies: string[]) =>
  cookies.some((c) => c.trimStart().toLowerCase().startsWith(`${ACCESS_TOKEN_COOKIE}=`) || c.trimStart().toLowerCase().startsWith(`${REFRESH_TOKEN_COOKIE}=`));

/**
 * The API paths whose request bodies are streamed on as they arrive instead
 * of read in full first: a WhatsApp attachment from the club's inbox (up to
 * 100 MB), which the API in turn streams to Meta -- so neither this server
 * nor the API holds the file; and a mail from the club's mailbox with its
 * files (up to 10 MB together), which the API reads as it arrives. Its exact
 * length goes with it. A 401 to a
 * streamed body is a network error in Node's fetch (see below): it is
 * answered UPLOAD_INTERRUPTED, which the dashboard says as "sign in and try
 * again".
 */
const STREAMED = [/^\/api\/v1\/clubs\/whatsapp\/conversations\/\d+\/media$/, /^\/api\/v1\/clubs\/mailbox\/messages$/];

/**
 * The calls that can take minutes: a decision on hundreds of registration
 * requests at once (approve, decline, reopen), an import, an export or
 * statement (CSV or Excel), a bundle of tickets, a PDF -- a batch of cards,
 * or a single one the render service may try twice -- and an AI draft, which
 * the API gives up to 100 s across its providers.
 */
const LONG = [
  /\/(?:approve|decline|reopen)$/,
  /\/ai\//,
  /(?:^|[/_-])(?:bulk|import)(?:[/_.-]|$)/,
  /(?:^|[/_.-])exports?(?:[/_.-]|$)/,
  /(?:^|[/_.-])bundle(?:[/_.-]|$)/,
  /\.(?:csv|xlsx|zip|pdf)$/i,
];

/** An event stream: open for as long as the page is, so never timed out. */
const isEventStream = (request: Request, path: string) =>
  /\/stream$/.test(path) || /\btext\/event-stream\b/i.test(request.headers.get("accept") ?? "");

/**
 * How long the API has to start answering this call, in milliseconds, or
 * null for no limit: an event stream stays open as long as the page does.
 * (A streamed upload has none either: see `createGatewayHandlers`.) Once
 * the answer has started, its body passes through for as long as it takes:
 * a big download on venue Wi-Fi is not cut off half way.
 */
export function upstreamTimeout(request: Request, path: string, timeouts: UpstreamTimeouts = UPSTREAM_TIMEOUT_MS): number | null {
  if (isEventStream(request, path)) return null;
  let format: string | null = null;
  try {
    format = new URL(request.url).searchParams.get("format");
  } catch {
    // A relative URL in a test: the path decides.
  }
  if (LONG.some((rx) => rx.test(path)) || /^(?:csv|xlsx)$/i.test(format ?? "")) return timeouts.long;
  return timeouts.standard;
}

/** Said when the API took too long; a change may still go through, so it says to look first. */
const timedOut = () =>
  Response.json(
    {
      message: "The server took too long to answer, so the dashboard stopped waiting. If you were changing something it may still go through: reload in a minute and check before trying again.",
      error_code: UPSTREAM_TIMEOUT,
    },
    { status: 504, headers: { "cache-control": "no-store" } },
  );

export function createGatewayHandlers(options: GatewayOptions) {
  const stripped = new Set(
    [...DEFAULT_STRIPPED, ...(options.stripRequestHeaders ?? [])].map((h) =>
      h.toLowerCase()
    )
  );

  async function handle(request: Request, context: RouteContext): Promise<Response> {
    // Only this dashboard's own pages use the gateway: whatever the method, a
    // request the browser says another site started is not sent.
    if (isCrossSite(request)) return refused();
    // Same-origin pages never preflight, so this is only ever another site
    // asking: answered here, with no Access-Control-* at all, never by the API.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { allow: "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS" } });
    }
    // CSRF: a change must also name this dashboard's own origin.
    if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request)) return refused();

    const apiUrl = options.apiUrl ?? process.env.MOA_API_URL;
    if (!apiUrl) {
      // A deployment problem, not a caller problem: say so plainly rather than
      // letting it surface as an opaque fetch failure in the browser.
      return Response.json(
        { message: "The API gateway is not configured (MOA_API_URL is unset)." },
        { status: 500 }
      );
    }

    const { path } = await context.params;
    const upstreamPath = `/${(path ?? []).join("/")}`;
    const search = new URL(request.url).search;
    const target = `${apiUrl.replace(/\/$/, "")}${upstreamPath}${search}`;

    const headers = new Headers();
    request.headers.forEach((value, key) => {
      if (!stripped.has(key.toLowerCase())) headers.set(key, value);
    });

    // GET/HEAD must not carry a body. Any other body is read in full and sent
    // as bytes rather than streamed: Node's fetch answers a 401 to a request
    // whose body was a stream with a network error ("expected non-null body
    // source", the Fetch spec's retry-with-credentials step), so an API 401
    // on a POST -- an AI key the provider rejected -- reached the browser as a
    // bare 500. The bytes are unchanged (a multipart upload keeps its boundary
    // in the forwarded Content-Type), and the platform caps the size anyway.
    const hasBody = !["GET", "HEAD"].includes(request.method);
    const streamed = hasBody && request.body !== null && STREAMED.some((rx) => rx.test(upstreamPath));
    const bytes = hasBody && !streamed ? await request.arrayBuffer() : null;
    const length = request.headers.get("content-length");
    if (streamed && length) headers.set("content-length", length);

    // The upstream call ends when the browser gives up on this one (a
    // cancelled export, a page left), and when the API has not started
    // answering in time. A streamed upload has no limit: a 100 MB file on
    // venue Wi-Fi takes as long as it takes, and the API answers only once
    // it has all of it.
    const abort = new AbortController();
    const onClientGone = () => abort.abort(request.signal.reason);
    if (request.signal.aborted) onClientGone();
    else request.signal.addEventListener("abort", onClientGone, { once: true });
    const limit = streamed ? null : upstreamTimeout(request, upstreamPath, { ...UPSTREAM_TIMEOUT_MS, ...options.timeouts });
    let expired = false;
    const timer =
      limit === null
        ? undefined
        : setTimeout(() => {
            expired = true;
            abort.abort(new DOMException(`The API did not answer within ${limit} ms.`, "TimeoutError"));
          }, limit);

    const started = Date.now();
    const report = (status: number) => {
      if (!options.onUpstreamResponse) return;
      try {
        options.onUpstreamResponse({ method: request.method, path: upstreamPath, status, durationMs: Date.now() - started });
      } catch {
        // A reporting fault is not the caller's problem.
      }
    };

    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        body: streamed ? request.body : bytes && bytes.byteLength > 0 ? bytes : undefined,
        // Node's fetch needs to be told a streamed body goes one way.
        ...(streamed ? { duplex: "half" } : {}),
        redirect: "manual",
        cache: "no-store",
        signal: abort.signal,
      } as RequestInit);
    } catch (error) {
      if (expired) {
        // The API is stuck, not the caller: seen as an upstream 504.
        report(504);
        return timedOut();
      }
      // Nobody is waiting for an answer: say so quietly, never as a fault.
      if (request.signal.aborted) return new Response(null, { status: 499 });
      if (!streamed) throw error;
      return Response.json(
        { message: "The file couldn't be sent: the connection dropped or the session ended. Sign in again if asked, and try again.", error_code: "UPLOAD_INTERRUPTED" },
        { status: 502 },
      );
    } finally {
      // The answer has started (or failed): its body is not timed.
      clearTimeout(timer);
    }

    report(upstream.status);

    // Pass the response through, including Set-Cookie so login/refresh/logout
    // keep working. Headers.getSetCookie() preserves multiple cookies, which a
    // plain get("set-cookie") would collapse into one malformed value. No
    // Access-Control-* header: the API's CORS answer is for the public
    // website calling it directly, never for this origin.
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      const name = key.toLowerCase();
      if (name === "set-cookie") return;
      if (name.startsWith("access-control-")) return;
      if (["content-encoding", "content-length", "transfer-encoding"].includes(name)) return;
      responseHeaders.set(key, value);
    });
    const cookies = upstream.headers.getSetCookie?.() ?? [];
    for (const cookie of cookies) {
      responseHeaders.append("set-cookie", cookie);
    }

    // The session stays in the HttpOnly cookies: tokens in the body are dropped.
    if (isJson(upstream.headers.get("content-type")) && (upstreamPath.startsWith(AUTH_PREFIX) || setsSession(cookies))) {
      return new Response(stripTokens(await upstream.text()), {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  return {
    GET: handle,
    POST: handle,
    PUT: handle,
    PATCH: handle,
    DELETE: handle,
    HEAD: handle,
    OPTIONS: handle,
  };
}

export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };
