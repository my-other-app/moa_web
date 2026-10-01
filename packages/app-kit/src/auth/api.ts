import type { SessionUser } from "@moa/auth";

import { api } from "../index";
import type { LoginInput } from "./schemas";

export interface TokenResponse {
  token_type: string;
  access_token: string;
  refresh_token: string;
}

/**
 * /auth/token is an OAuth2 password-flow endpoint, so the body must be
 * form-encoded. The tokens in the JSON response are ignored on purpose: the
 * same response also sets httpOnly cookies, and those are what authenticate
 * every later request. Storing the token in JS would hand any XSS an admin
 * session -- the exact weakness in the dashboard this replaces.
 */
export async function login(input: LoginInput): Promise<TokenResponse> {
  const body = new URLSearchParams({
    username: input.username,
    password: input.password,
  });
  return api.post<TokenResponse>("/api/v1/auth/token", body);
}

export async function logout(): Promise<void> {
  await api.post<void>("/api/v1/auth/logout");
}

export async function fetchSession(): Promise<SessionUser> {
  return api.get<SessionUser>("/api/v1/auth/me");
}
