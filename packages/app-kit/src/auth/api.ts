import { nullIfRouteMissing } from "@moa/api";
import type { SessionUser } from "@moa/auth";

import { api } from "../index";
import type { LoginInput } from "./schemas";

export interface TokenResponse {
  token_type: string;
  access_token: string;
  refresh_token: string;
}

let loginScope: string | undefined;

/**
 * The OAuth scope an app signs in with. The clubs dashboard sets "club":
 * there, and only there, a club team member's own email and password open
 * the club's dashboard. The same address may be someone's app account, which
 * must keep signing them in as themselves everywhere else.
 */
export function setLoginScope(scope: string | undefined) {
  loginScope = scope;
}

/**
 * /auth/token is an OAuth2 password-flow endpoint, so the body must be
 * form-encoded. The tokens in the JSON response are ignored on purpose: the
 * same response also sets httpOnly cookies, and those are what authenticate
 * every later request. Storing the token in JS would hand any XSS an admin
 * session -- the exact weakness in the dashboard this replaces.
 *
 * An account with two-factor sign-in is refused with TOTP_REQUIRED until the
 * same form is sent again with `totp_code`: the authenticator's six digits,
 * or one of the account's recovery codes.
 */
export async function login(input: LoginInput & { totp_code?: string }): Promise<TokenResponse> {
  const body = new URLSearchParams({
    username: input.username,
    password: input.password,
  });
  if (input.totp_code) body.set("totp_code", input.totp_code);
  if (loginScope) body.set("scope", loginScope);
  return api.post<TokenResponse>("/api/v1/auth/token", body);
}

/** The dashboard a Google sign-in is for: the club dashboard, or the main portal. */
export type DashboardScope = "club" | "admin";

export interface GoogleLoginInput {
  /** Google's credential (an ID token), exactly as Google Identity Services handed it over. */
  idToken: string;
  scope: DashboardScope;
  /** The second factor, sent with the same credential again after TOTP_REQUIRED. */
  totpCode?: string;
}

/**
 * Sign in an existing dashboard account with Google: POST
 * /auth/google/dashboard through this app's gateway, so the response's auth
 * cookies are set exactly as /auth/token's are (and, as there, the tokens in
 * the body are not kept). It never creates an account: no club or admin
 * account with the Google address is GOOGLE_NO_ACCOUNT.
 *
 * `null` when this API has no such route yet (an older server): the login
 * page then hides the button (nullIfRouteMissing, as for other features).
 */
export async function googleLogin(input: GoogleLoginInput): Promise<TokenResponse | null> {
  const body: { id_token: string; scope: DashboardScope; totp_code?: string } = {
    id_token: input.idToken,
    scope: input.scope,
  };
  if (input.totpCode) body.totp_code = input.totpCode;
  return nullIfRouteMissing(() => api.post<TokenResponse>("/api/v1/auth/google/dashboard", body));
}

export async function logout(): Promise<void> {
  await api.post<void>("/api/v1/auth/logout");
}

export async function fetchSession(): Promise<SessionUser> {
  return api.get<SessionUser>("/api/v1/auth/me");
}
