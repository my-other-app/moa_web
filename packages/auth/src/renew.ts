import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./constants";

/**
 * Renewing a session at the edge guard (each app's proxy.ts), for a page
 * opened or navigated to after the access cookie ran out.
 *
 * The access cookie's max-age is its token's lifetime, so once the token
 * expires the browser stops sending it, while the refresh cookie lives on
 * for days. Without this, the next navigation of a tab left open over lunch
 * went to sign-in. With it, the guard asks the API's /auth/refresh with the
 * refresh cookie, passes the new cookies to the browser (Set-Cookie on the
 * answer) and to this render (the request's Cookie header), and the page
 * opens as if nothing happened.
 *
 * One renewal per refresh token at a time: a page's links prefetch several
 * addresses at once, each arriving with the same spent session. The API
 * answers the same new tokens to the same refresh token until those are
 * used, and limits renewals per session, so the answer is shared for a
 * moment rather than asked for again.
 */

/** What the guard does with a renewal. */
export type Renewal =
  | { ok: true; setCookies: string[]; cookies: Record<string, string> }
  /** `ended`: the API refused it (401/403), so the refresh cookie is spent. */
  | { ok: false; ended: boolean };

export interface RenewOptions {
  /** The API's origin; MOA_API_URL when not given (read per call, as the gateway does). */
  apiUrl?: string;
  /** How long the API has to answer, in ms. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** The clock, for tests. */
  now?: () => number;
}

const RENEW_PATH = "/api/v1/auth/refresh";
const TIMEOUT_MS = 10_000;
/** How long one renewal's answer serves the requests that arrive with the same spent session. */
const SHARED_FOR_MS = 30_000;
const MAX_SHARED = 500;

/** The visitor's own headers the API reads on a renewal: their address, the scheme, the device. */
const FORWARDED = ["user-agent", "accept-language", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "x-real-ip", "cf-connecting-ip"];

const inflight = new Map<string, Promise<Renewal>>();
const shared = new Map<string, { at: number; renewal: Renewal }>();

/** Forgets every shared answer (tests). */
export function resetRenewals(): void {
  inflight.clear();
  shared.clear();
}

/** A cookie's name and value from a Set-Cookie line. */
function cookieOf(line: string): [string, string] | null {
  const pair = line.split(";", 1)[0] ?? "";
  const at = pair.indexOf("=");
  if (at <= 0) return null;
  return [pair.slice(0, at).trim(), pair.slice(at + 1).trim()];
}

/**
 * Whether an access token is spent or about to be (within `marginSec`), by
 * its own `exp`. Its signature is not checked and need not be: this only
 * decides to renew early. Anything unreadable is left for the API to judge.
 */
export function expiresSoon(token: string, nowMs: number, marginSec = 30): boolean {
  const payload = token.split(".")[1];
  if (!payload) return false;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof json.exp === "number" && json.exp * 1000 - nowMs <= marginSec * 1000;
  } catch {
    return false;
  }
}

/** Renews the session the refresh token names, once however many ask at the same time. */
export function renewSession(request: Request, refreshToken: string, options: RenewOptions = {}): Promise<Renewal> {
  const now = options.now ?? Date.now;
  const kept = shared.get(refreshToken);
  if (kept && now() - kept.at < SHARED_FOR_MS) return Promise.resolve(kept.renewal);
  const running = inflight.get(refreshToken);
  if (running) return running;

  const renewal = ask(request, refreshToken, options).then((result) => {
    if (result.ok) {
      if (shared.size >= MAX_SHARED) shared.clear();
      shared.set(refreshToken, { at: now(), renewal: result });
    }
    return result;
  });
  inflight.set(refreshToken, renewal);
  void renewal.finally(() => inflight.delete(refreshToken));
  return renewal;
}

async function ask(request: Request, refreshToken: string, options: RenewOptions): Promise<Renewal> {
  const apiUrl = (options.apiUrl ?? process.env.MOA_API_URL)?.replace(/\/$/, "");
  if (!apiUrl) return { ok: false, ended: false };
  const headers = new Headers({ accept: "application/json", cookie: `${REFRESH_TOKEN_COOKIE}=${refreshToken}` });
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const response = await (options.fetchImpl ?? fetch)(`${apiUrl}${RENEW_PATH}`, {
      method: "POST",
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, ended: response.status === 401 || response.status === 403 };
    }
    const setCookies = response.headers.getSetCookie?.() ?? [];
    const cookies: Record<string, string> = {};
    for (const line of setCookies) {
      const pair = cookieOf(line);
      if (pair && (pair[0] === ACCESS_TOKEN_COOKIE || pair[0] === REFRESH_TOKEN_COOKIE)) cookies[pair[0]] = pair[1];
    }
    // No new access cookie is no renewal.
    if (!cookies[ACCESS_TOKEN_COOKIE]) return { ok: false, ended: false };
    return { ok: true, setCookies, cookies };
  } catch {
    // No answer in time, or none at all: not a refusal.
    return { ok: false, ended: false };
  }
}

/**
 * The request's Cookie header with the renewed session in place of the
 * spent one, every other cookie as it came.
 */
export function withCookies(header: string | null, cookies: Record<string, string>): string {
  const names = new Set(Object.keys(cookies));
  const kept = (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !names.has(part.split("=", 1)[0]!.trim()));
  return [...kept, ...Object.entries(cookies).map(([name, value]) => `${name}=${value}`)].join("; ");
}
