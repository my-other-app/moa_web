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
  /** Upstream API origin, e.g. https://api.myotherapp.in */
  apiUrl: string;
  /**
   * Request headers never forwarded upstream. `host` would break virtual
   * hosting and TLS SNI; `connection`/`content-length` are recomputed by
   * fetch and forwarding stale values corrupts the body.
   */
  stripRequestHeaders?: string[];
}

const DEFAULT_STRIPPED = [
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
];

type RouteContext = { params: Promise<{ path?: string[] }> };

export function createGatewayHandlers(options: GatewayOptions) {
  const stripped = new Set(
    [...DEFAULT_STRIPPED, ...(options.stripRequestHeaders ?? [])].map((h) =>
      h.toLowerCase()
    )
  );

  async function handle(request: Request, context: RouteContext): Promise<Response> {
    const { path } = await context.params;
    const upstreamPath = `/${(path ?? []).join("/")}`;
    const search = new URL(request.url).search;
    const target = `${options.apiUrl.replace(/\/$/, "")}${upstreamPath}${search}`;

    const headers = new Headers();
    request.headers.forEach((value, key) => {
      if (!stripped.has(key.toLowerCase())) headers.set(key, value);
    });

    // GET/HEAD must not carry a body, and duplex is required by undici when
    // streaming one.
    const hasBody = !["GET", "HEAD"].includes(request.method);

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      cache: "no-store",
    } as RequestInit);

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
