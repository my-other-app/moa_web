import type { SessionUser } from "./constants";

/**
 * A mirror of the backend's capability map, for presentation only.
 *
 * The server is the authority: every guarded endpoint checks the capability
 * itself, so a client that ignores this gets a 403 rather than its way. The
 * copy exists so the UI can stop *offering* actions that will be refused --
 * a Delete button that always errors is worse than no button, and finding out
 * your role cannot do something by being told "forbidden" is a poor way to
 * learn it.
 *
 * Kept deliberately small and in one file: if the backend map changes, this is
 * the single place that drifts, and `admin-roles.test.ts` pins the pairs that
 * matter.
 */
export const CAPABILITIES = {
  view: "view",
  moderate: "moderate",
  manageMoney: "manage_money",
  destroy: "destroy",
  impersonate: "impersonate",
  manageAdmins: "manage_admins",
  manageContent: "manage_content",
  resetCredentials: "reset_credentials",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export type AdminRole = "viewer" | "support" | "owner";

const ROLE_CAPABILITIES: Record<AdminRole, readonly Capability[]> = {
  viewer: ["view"],
  support: ["view", "moderate"],
  owner: [
    "view",
    "moderate",
    "manage_money",
    "destroy",
    "impersonate",
    "manage_admins",
    "manage_content",
    "reset_credentials",
  ],
};

/**
 * Unset means owner, matching `role_of` on the backend.
 *
 * Accounts created before roles existed have no role, and treating those as
 * "no capabilities" would lock every existing admin out of their own panel on
 * deploy. An unrecognised value is the opposite case -- it can only come from
 * a backend that knows something this build does not -- so it gets the least
 * privilege rather than the most.
 */
export function roleOf(user: Pick<SessionUser, "admin_role"> | null): AdminRole | null {
  if (!user) return null;
  const role = user.admin_role;
  if (role === null || role === undefined) return "owner";
  return role in ROLE_CAPABILITIES ? (role as AdminRole) : "viewer";
}

export function can(
  user: Pick<SessionUser, "admin_role"> | null,
  capability: Capability
): boolean {
  const role = roleOf(user);
  if (!role) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}
