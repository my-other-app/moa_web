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
   * Everything except the sign-in page, the password reset reached from it
   * (/forgot-password: whoever forgot theirs has no session), the application a new club fills
   * in before it has an account (/signup), the invite link a new team member
   * opens before they have a password (/join), the admin impersonation hand-off
   * (which arrives with no session -- exchanging its token is what creates
   * one), the gateway (which must stay reachable so the login POST itself can
   * get through), the script policy's report address (a report must never
   * renew or redirect a session), the door pages (the gate console, the kiosk, the print station and a guest's
   * phone check-in authenticate with the key or token in their link, never a
   * session: a volunteer or guest has no account here), Next internals and
   * static files.
   */
  matcher: ["/((?!login|forgot-password|signup|join|impersonate|api/gateway|api/csp-report|gate/|kiosk|print-station|s/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
