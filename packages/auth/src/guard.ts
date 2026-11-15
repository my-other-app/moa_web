import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./constants";
import { expiresSoon, renewSession, withCookies, type RenewOptions } from "./renew";

/**
 * The dashboards' edge guard (each app's proxy.ts calls this; the matcher,
 * which Next needs written in that file, stays there).
 *
 * A cookie presence check, not a validity check: it cannot verify a
 * signature without the secret, and should not try. Its job is to stop an
 * unauthenticated visitor seeing a flash of dashboard chrome before the data
 * layer 401s. Real enforcement happens upstream on every API call, plus the
 * role check in the dashboard layout.
 *
 * When only the refresh cookie is left (the access token ran out, or is
 * about to), the session is renewed here first (./renew.ts), so a tab left
 * open past its access token navigates on instead of going to sign-in. A
 * renewal the API refuses goes to sign-in, the spent refresh cookie
 * cleared so the next page does not ask again.
 */
export function guardSession(request: NextRequest, options: RenewOptions = {}): NextResponse | Promise<NextResponse> {
  const access = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  const now = (options.now ?? Date.now)();

  // Answered at once unless there is a session to renew (only then is anything awaited).
  if (access && !(refresh && expiresSoon(access, now))) return NextResponse.next();
  if (!refresh) return toSignIn(request);
  return renewed(request, refresh, Boolean(access), options);
}

async function renewed(request: NextRequest, refresh: string, hasAccess: boolean, options: RenewOptions): Promise<NextResponse> {
  const renewal = await renewSession(request, refresh, options);
  if (renewal.ok) {
    // This render reads the new session; the browser keeps it.
    const headers = new Headers(request.headers);
    headers.set("cookie", withCookies(request.headers.get("cookie"), renewal.cookies));
    const response = NextResponse.next({ request: { headers } });
    for (const line of renewal.setCookies) response.headers.append("set-cookie", line);
    return response;
  }
  // Not renewed, but the access token has not quite run out: let it serve.
  if (hasAccess) return NextResponse.next();
  const response = toSignIn(request);
  if (renewal.ended) response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return response;
}

/** Sign-in, told where they were going so it can return them there. */
function toSignIn(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}
