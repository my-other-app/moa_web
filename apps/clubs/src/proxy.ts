import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@moa/auth";

/**
 * Edge guard. (Next 16 renamed `middleware.ts` to `proxy.ts`.)
 *
 * This is a cookie *presence* check, not a validity check -- it cannot verify
 * a signature without the secret, and should not try. Its job is to stop an
 * unauthenticated visitor seeing a flash of dashboard chrome before the data
 * layer 401s. Real enforcement happens upstream on every API call, plus the
 * role check in the dashboard layout.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(ACCESS_TOKEN_COOKIE);

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were going so sign-in can return them there.
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except the sign-in page, the admin impersonation hand-off
   * (which arrives with no session -- exchanging its token is what creates
   * one), the gateway (which must stay reachable so the login POST itself can
   * get through), Next internals and static files.
   */
  matcher: ["/((?!login|impersonate|api/gateway|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
