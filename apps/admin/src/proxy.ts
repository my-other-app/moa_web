import type { NextRequest } from "next/server";
import { guardSession } from "@moa/auth/guard";

/**
 * Edge guard. (Next 16 renamed `middleware.ts` to `proxy.ts`.)
 *
 * A cookie presence check, shared by both dashboards (packages/auth/src/guard.ts):
 * no session goes to sign-in, keeping where it was going; a session whose
 * access token ran out is renewed from its refresh cookie first, so a tab
 * left open navigates on. Real enforcement happens upstream on every API
 * call, plus the role check in the dashboard layout.
 */
export function proxy(request: NextRequest) {
  return guardSession(request);
}

export const config = {
  /**
   * Everything except the sign-in page, an invited admin's set-password page
   * (they have no session yet), the gateway (which must stay reachable so the
   * login POST itself can get through), the script policy's report address
   * (a report must never renew or redirect a session), Next internals and
   * static files.
   */
  matcher: ["/((?!login|accept-invite|api/gateway|api/csp-report|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
