import { ApiError, toApiError } from "./errors";

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
  /**
   * Renew the session when the API says its access token is spent, then
   * send the request again (see `SessionRenewal`). Browser clients only:
   * a server render cannot store the cookies a renewal sets.
   */
  renew?: SessionRenewal;
}

/**
 * How a client renews the session it rides on.
 *
 * The access cookie lasts exactly as long as its token (the backend sets
 * its max-age to the token's lifetime), so a page left open past it starts
 * answering 401 to everything. The refresh cookie lasts days. On a 401 that
 * a new access token would fix (see `isRenewable`), the client asks `path`
 * once -- one ask shared by every request that failed meanwhile -- and
 * sends each of those requests again, once. A request the API refused
 * before the session expired was never acted on (the session check comes
 * first), so sending it again does nothing twice.
 */
export interface SessionRenewal {
  /** Renews the session from its refresh cookie: POST, no body, answers new cookies. */
  path: string;
  /**
   * Told once when the renewal itself was refused (401 or 403): the session
   * is over and only signing in again brings it back. Not told when the API
   * could not be reached or was unwell: that is no reason to sign out.
   */
  onEnded?: (error: ApiError) => void;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Next.js cache hints, honoured only on the server. */
  cache?: RequestCache;
  revalidate?: number | false;
  tags?: string[];
  /**
   * Shown the raw response before its body is read, for the rare caller
   * that needs a header the JSON does not carry (X-Total-Capped on the
   * admin user list).
   */
  onResponse?: (response: Response) => void;
  /**
   * false: a 401 is answered as it is, never renewed (signing out, which
   * must not bring the session back to end it).
   */
  renew?: boolean;
}

/**
 * Calls whose 401 is about the credentials sent, not the session: signing
 * in (password, Google, Apple), renewing, signing out, a password reset
 * and the impersonation exchange. A renewal cannot fix those.
 */
const CREDENTIAL_CALLS = /^\/api\/v1\/auth\/(?:(?:token|refresh|logout|google|apple|impersonate\/exchange)(?:[/?]|$)|password\/)/;

/**
 * The 401s a fresh access token answers: an expired one (TOKEN_EXPIRED),
 * or none at all (no code; the access cookie had already gone). A 401 with
 * another code says why on purpose -- ACCESS_REMOVED, SESSION_REUSED,
 * IMPERSONATION_ENDED, TOTP_REQUIRED -- and renewing would only be refused
 * the same way, so it is answered as it is.
 */
export function isRenewable(error: ApiError, path: string): boolean {
  if (CREDENTIAL_CALLS.test(path)) return false;
  return error.status === 401 && (error.errorCode === null || error.errorCode === "TOKEN_EXPIRED");
}

/**
 * The gateway's answer when a streamed upload was cut off: a 401 to a
 * streamed body reaches Node's fetch as a network error, so a spent session
 * shows up as this rather than as a 401 (packages/auth/src/gateway.ts).
 */
const UPLOAD_INTERRUPTED = "UPLOAD_INTERRUPTED";

/** A body that can be sent a second time: anything but a one-shot stream. */
const replayable = (body: unknown) => !(typeof ReadableStream !== "undefined" && body instanceof ReadableStream);

type Renewal = "renewed" | "ended" | "failed";

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
  // Looked up per call, so whatever fetch the page has at the time is used.
  const doFetch: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));

  // One renewal at a time, shared by every request that failed while it ran.
  let renewing: Promise<Renewal> | null = null;
  // Renewals that worked: a request sent before the latest one is simply
  // sent again when its 401 arrives late, without renewing a second time.
  let renewals = 0;
  // The renewal was refused: no more are asked for (each would be refused
  // too) until a request goes through again -- the person signed in again
  // in another tab, say.
  let ended = false;

  function renewSession(renew: SessionRenewal): Promise<Renewal> {
    renewing ??= (async (): Promise<Renewal> => {
      try {
        const headers = new Headers(await options.getHeaders?.());
        headers.set("Accept", "application/json");
        const response = await doFetch(buildUrl(options.baseUrl, renew.path), {
          method: "POST",
          headers,
          credentials: "include",
          cache: "no-store",
        });
        if (response.ok) {
          renewals += 1;
          return "renewed";
        }
        if (response.status === 401 || response.status === 403) {
          ended = true;
          const error = await toApiError(response);
          try {
            renew.onEnded?.(error);
          } catch {
            // Whoever was told is not the caller's problem.
          }
          return "ended";
        }
        return "failed";
      } catch {
        // No answer (offline, the API restarting): the session may well be fine.
        return "failed";
      } finally {
        renewing = null;
      }
    })();
    return renewing;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    reqOptions: RequestOptions = {}
  ): Promise<T> {
    const renew = reqOptions.renew === false ? undefined : options.renew;
    const sentAfter = renewals;
    let response = await send(method, path, body, reqOptions);

    if (renew && !ended && (response.status === 401 || response.status === 502)) {
      // Read from a copy: the answer itself may still be what is thrown.
      const error = await toApiError(typeof response.clone === "function" ? response.clone() : response);
      if (isRenewable(error, path) && replayable(body)) {
        // Renewed since this was sent (a late 401): just send it again.
        const outcome = renewals !== sentAfter ? "renewed" : await renewSession(renew);
        if (outcome === "renewed") response = await send(method, path, body, reqOptions);
      } else if (response.status === 502 && error.errorCode === UPLOAD_INTERRUPTED) {
        // Perhaps the session ran out mid-upload. Renewed, the file is not
        // sent again here (it may have got through): the answer says to try
        // again, and that try now has a session.
        if (renewals === sentAfter) await renewSession(renew);
      }
    }
    reqOptions.onResponse?.(response);

    if (!response.ok) throw await toApiError(response);
    // Anything that went through means the session is good again.
    ended = false;

    // 204, or any empty body.
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  async function send(method: string, path: string, body: unknown, reqOptions: RequestOptions): Promise<Response> {
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

    return doFetch(buildUrl(options.baseUrl, path, reqOptions.query), init);
  }

  return {
    get: (path, o) => request("GET", path, undefined, o),
    post: (path, body, o) => request("POST", path, body, o),
    put: (path, body, o) => request("PUT", path, body, o),
    patch: (path, body, o) => request("PATCH", path, body, o),
    del: (path, body, o) => request("DELETE", path, body, o),
  };
}
