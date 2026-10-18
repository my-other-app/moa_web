import { cache } from "react";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { createApiClient, ApiError } from "@moa/api";

import { ACCESS_TOKEN_COOKIE, type SessionUser, type UserType } from "./constants";

/**
 * Server-side API client.
 *
 * Talks to the upstream API directly (no gateway hop) and forwards the
 * caller's cookies, so server components and route handlers authenticate as
 * the signed-in user.
 */
export function createServerApiClient() {
  const apiUrl = process.env.MOA_API_URL;
  if (!apiUrl) {
    throw new Error(
      "MOA_API_URL is not set. Server-side data fetching cannot reach the API."
    );
  }

  return createApiClient({
    baseUrl: apiUrl.replace(/\/$/, ""),
    getHeaders: async (): Promise<Record<string, string>> => {
      const store = await cookies();
      const cookieHeader = store
        .getAll()
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
      return cookieHeader ? { cookie: cookieHeader } : {};
    },
  });
}

/** What the session check found: the user, or why there is none. */
export interface SessionCheck {
  user: SessionUser | null;
  /**
   * The API's error code when it refused the session (401/403), e.g.
   * CLUB_NOT_VERIFIED for a club still awaiting approval; null when there
   * was simply no session, or the refusal named no code.
   */
  refusal: string | null;
}

/** The code a refused session check carries, or null when it was not a refusal. */
export function sessionRefusal(error: unknown): string | null | undefined {
  if (error instanceof ApiError && (error.isUnauthorized || error.isForbidden)) return error.errorCode ?? null;
  return undefined;
}

/**
 * The signed-in user, or why there is none.
 *
 * Wrapped in React's `cache` so a layout, a page and three server components
 * in the same render share one upstream call rather than issuing four
 * identical /auth/me requests.
 */
export const checkSession = cache(async (): Promise<SessionCheck> => {
  const store = await cookies();
  if (!store.get(ACCESS_TOKEN_COOKIE)) return { user: null, refusal: null };

  const api = createServerApiClient();
  for (let attempt = 0; ; attempt++) {
    try {
      return { user: await api.get<SessionUser>("/api/v1/auth/me", { cache: "no-store" }), refusal: null };
    } catch (error) {
      // Next's own control flow (a dynamic-render signal, a redirect) is not a fault.
      unstable_rethrow(error);
      // A 401 here is ordinary: an expired or revoked token (the backend bumps
      // token_version on password change). A 403 says why: a club not yet
      // approved is CLUB_NOT_VERIFIED, which the clubs app answers with a
      // screen of its own rather than the sign-in form.
      const refusal = sessionRefusal(error);
      if (refusal !== undefined) {
        return { user: null, refusal };
      }
      // The API restarting (a deploy is about a minute of 502s) or a dropped
      // connection: asked again, shortly, before the whole page fails. Seen in
      // production: one 502 at render time turned /finance into an error page
      // that loaded fine two seconds later.
      if (isTransient(error) && attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        continue;
      }
      // Anything else is a real fault and is surfaced rather than silently
      // rendering a logged-out UI.
      throw error;
    }
  }
});

/** The signed-in user, or null. */
export const getSession = cache(async (): Promise<SessionUser | null> => (await checkSession()).user);

const MAX_RETRIES = 2;

/** A gateway's "try again" or no answer at all: worth a second ask. */
export function isTransient(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 502 || error.status === 503 || error.status === 504;
  return error instanceof TypeError; // fetch failed: refused, reset, DNS
}

/**
 * Returns the session, or null when the user's role is not permitted.
 * Callers decide how to respond (redirect, 404, or an explanatory screen) --
 * this deliberately does not redirect on its own, because "signed out" and
 * "signed in as the wrong role" warrant different destinations.
 */
export async function getSessionWithRole(
  allowed: readonly UserType[]
): Promise<{ user: SessionUser | null; allowed: boolean; refusal: string | null }> {
  const { user, refusal } = await checkSession();
  if (!user) return { user: null, allowed: false, refusal };
  return { user, allowed: allowed.includes(user.user_type), refusal: null };
}

/**
 * The signed-in user, or null -- including when the API cannot say.
 *
 * `getSession` rethrows anything that is not a 401/403, which is correct for a
 * gate: an admin shell must not render when the role behind it could not be
 * verified. It is wrong for the sign-in page, where the session check is only a
 * courtesy (skip the form if you are already in). Letting it throw there makes
 * the one page that recovers from a bad session unreachable precisely when the
 * API is unwell -- which is when someone needs it. That is not hypothetical: a
 * stale cookie plus a 500 from /auth/me left the sign-in form unreachable.
 *
 * Degrading to "show the form" is the safe direction. The worst case is an
 * already-signed-in admin being shown a form they did not need; the failure it
 * replaces is being locked out of the product entirely.
 */
export async function getSessionQuietly(): Promise<SessionUser | null> {
  try {
    return await getSession();
  } catch (error) {
    /*
     * Next signals control flow by throwing: `redirect`, `notFound`, and the
     * DynamicServerError that marks a route as dynamic when it reads cookies.
     * A bare catch swallows those and the route is silently mis-rendered --
     * the build log caught exactly that here. `unstable_rethrow` puts them
     * back and lets real faults through, which are the only ones we want.
     */
    unstable_rethrow(error);
    // Swallowed on purpose, but not silently: this is the only trace that the
    // upstream session check failed rather than simply finding no session.
    console.warn("Session check failed; showing the sign-in form.", error);
    return null;
  }
}
