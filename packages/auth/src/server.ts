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

/**
 * The signed-in user, or null.
 *
 * Wrapped in React's `cache` so a layout, a page and three server components
 * in the same render share one upstream call rather than issuing four
 * identical /auth/me requests.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  if (!store.get(ACCESS_TOKEN_COOKIE)) return null;

  try {
    const api = createServerApiClient();
    return await api.get<SessionUser>("/api/v1/auth/me", { cache: "no-store" });
  } catch (error) {
    // A 401 here is ordinary: an expired or revoked token (the backend bumps
    // token_version on password change). Anything else is a real fault and is
    // surfaced rather than silently rendering a logged-out UI.
    if (error instanceof ApiError && (error.isUnauthorized || error.isForbidden)) {
      return null;
    }
    throw error;
  }
});

/**
 * Returns the session, or null when the user's role is not permitted.
 * Callers decide how to respond (redirect, 404, or an explanatory screen) --
 * this deliberately does not redirect on its own, because "signed out" and
 * "signed in as the wrong role" warrant different destinations.
 */
export async function getSessionWithRole(
  allowed: readonly UserType[]
): Promise<{ user: SessionUser | null; allowed: boolean }> {
  const user = await getSession();
  if (!user) return { user: null, allowed: false };
  return { user, allowed: allowed.includes(user.user_type) };
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
