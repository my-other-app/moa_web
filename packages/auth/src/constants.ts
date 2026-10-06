/** Set by the backend on login (app/api/auth/router.py::_set_auth_cookies). */
export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

/** Path the browser calls; the gateway route handler forwards it upstream. */
export const GATEWAY_PREFIX = "/api/gateway";

export type UserType = "admin" | "club" | "app_user" | "guest";

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  user_type: UserType;
  /** Absent on non-admins, and on admin accounts predating roles. */
  admin_role?: string | null;
}
