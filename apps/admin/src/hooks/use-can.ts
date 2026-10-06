"use client";

import { useSession } from "@moa/app-kit";
import { can, roleOf, type Capability } from "@moa/auth";

/**
 * Whether the signed-in admin's role permits something.
 *
 * For hiding controls only. The server checks the same capability on every
 * guarded endpoint, so this changes what is offered, never what is allowed.
 */
export function useCan(capability: Capability): boolean {
  const { data: user } = useSession();
  return can(user ?? null, capability);
}

/** The signed-in admin's role, for labelling rather than gating. */
export function useAdminRole() {
  const { data: user } = useSession();
  return roleOf(user ?? null);
}
