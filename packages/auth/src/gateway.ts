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
 * one chokepoint where CSRF defence can later be added -- the backend has
 * none today.
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
}

const DEFAULT_STRIPPED = [
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
];

type RouteContext = { params: Promise<{ path?: string[] }> };

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

export function createGatewayHandlers(options: GatewayOptions) {
  const stripped = new Set(
    [...DEFAULT_STRIPPED, ...(options.stripRequestHeaders ?? [])].map((h) =>
      h.toLowerCase()
    )
  );

  async function handle(request: Request, context: RouteContext): Promise<Response> {
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

    const started = Date.now();
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
      } as RequestInit);
    } catch (error) {
      if (!streamed) throw error;
      return Response.json(
        { message: "The file couldn't be sent: the connection dropped or the session ended. Sign in again if asked, and try again.", error_code: "UPLOAD_INTERRUPTED" },
        { status: 502 },
      );
    }

    if (options.onUpstreamResponse) {
      try {
        options.onUpstreamResponse({
          method: request.method,
          path: upstreamPath,
          status: upstream.status,
          durationMs: Date.now() - started,
        });
      } catch {
        // A reporting fault is not the caller's problem.
      }
    }

    // Pass the response through, including Set-Cookie so login/refresh/logout
    // keep working. Headers.getSetCookie() preserves multiple cookies, which a
    // plain get("set-cookie") would collapse into one malformed value.
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") return;
      if (["content-encoding", "content-length", "transfer-encoding"].includes(key.toLowerCase())) return;
      responseHeaders.set(key, value);
    });
    for (const cookie of upstream.headers.getSetCookie?.() ?? []) {
      responseHeaders.append("set-cookie", cookie);
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
