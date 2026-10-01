import { toApiError } from "./errors";

export interface ApiClientOptions {
  /**
   * Where requests go.
   *
   * In the browser this is the app's own origin (""), so every call lands on
   * the BFF route handler and the auth cookie is first-party. On the server
   * it is the real API origin. Nothing in feature code needs to know which.
   */
  baseUrl: string;
  /** Extra headers per request -- used server-side to forward the cookie. */
  getHeaders?: () => Promise<HeadersInit> | HeadersInit;
  /** Defaults to fetch; injectable so tests need no network. */
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Next.js cache hints, honoured only on the server. */
  cache?: RequestCache;
  revalidate?: number | false;
  tags?: string[];
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions["query"]
): string {
  const url = `${baseUrl}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // Dropping null/undefined keeps query keys stable: a filter that is "off"
    // must not appear as `?org=undefined`, or React Query would treat it as a
    // different key from the same filter being absent and refetch needlessly.
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  del<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetchImpl ?? fetch;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    reqOptions: RequestOptions = {}
  ): Promise<T> {
    const headers = new Headers(await options.getHeaders?.());
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    const isUrlEncoded = body instanceof URLSearchParams;
    const isRawBody = isFormData || isUrlEncoded;

    // Let the browser set the multipart boundary itself; setting
    // Content-Type manually on FormData produces an unparseable body, which
    // is exactly the bug the old clubs dashboard shipped. URLSearchParams
    // likewise carries its own type -- /auth/token is an OAuth2 form endpoint
    // and rejects a JSON body.
    if (body !== undefined && !isRawBody) {
      headers.set("Content-Type", "application/json");
    }
    headers.set("Accept", "application/json");

    const init: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = {
      method,
      headers,
      signal: reqOptions.signal,
      // Always send cookies: same-origin in the browser (via the BFF), and
      // explicitly forwarded server-side through getHeaders().
      credentials: "include",
    };

    if (body !== undefined) {
      init.body = isRawBody ? (body as BodyInit) : JSON.stringify(body);
    }
    if (reqOptions.cache) init.cache = reqOptions.cache;
    if (reqOptions.revalidate !== undefined || reqOptions.tags) {
      init.next = { revalidate: reqOptions.revalidate, tags: reqOptions.tags };
    }

    const response = await doFetch(
      buildUrl(options.baseUrl, path, reqOptions.query),
      init
    );

    if (!response.ok) throw await toApiError(response);

    // 204, or any empty body.
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  return {
    get: (path, o) => request("GET", path, undefined, o),
    post: (path, body, o) => request("POST", path, body, o),
    put: (path, body, o) => request("PUT", path, body, o),
    patch: (path, body, o) => request("PATCH", path, body, o),
    del: (path, body, o) => request("DELETE", path, body, o),
  };
}
