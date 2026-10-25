"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@moa/api";

export const TWO_FACTOR_REQUIRED = "ADMIN_2FA_REQUIRED";
export const SETUP_PATH = "/setup-2fa";

/** Whether an error is the API refusing an admin who must set up two-factor first. */
export function isTwoFactorRequired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.errorCode === TWO_FACTOR_REQUIRED;
}

/**
 * The dashboard's layout sends such an admin to /setup-2fa on the next
 * navigation; a page already open learns it from the first call the API
 * refuses. Any query or mutation refused with ADMIN_2FA_REQUIRED sends the
 * admin there at once. Rendered once, in the app's providers.
 */
const assign = (path: string) => window.location.assign(path);

export function TwoFactorWatch({ go = assign }: { go?: (path: string) => void }) {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    let sent = false;
    const send = (error: unknown) => {
      if (sent || !isTwoFactorRequired(error)) return;
      if (typeof window !== "undefined" && window.location.pathname === SETUP_PATH) return;
      sent = true;
      go(SETUP_PATH);
    };
    const queries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") send(event.action.error);
    });
    const mutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") send(event.action.error);
    });
    return () => {
      queries();
      mutations();
    };
  }, [queryClient, go]);
  return null;
}
