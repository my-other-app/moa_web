"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { HourglassIcon, LogOutIcon, RefreshCwIcon } from "lucide-react";
import { ApiError } from "@moa/api";
import { CLUB_UNDER_REVIEW, useLogout } from "@moa/app-kit";
import { CLUB_NOT_VERIFIED } from "@moa/auth";
import { Button } from "@moa/ui";

import { AuthFrame } from "./auth-frame";

/**
 * A club that applied and is not approved yet. The API answers its every
 * call (and a refresh) with 403 CLUB_NOT_VERIFIED; this is what it sees
 * instead of being signed out or shown "this page could not load". The
 * words are the sign-in form's for the same answer.
 */
export function AwaitingApproval() {
  const router = useRouter();
  const logout = useLogout();
  const signOut = async () => {
    try {
      await logout.mutateAsync();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };
  return (
    <AuthFrame
      headline="Bring your club to MyOtherApp."
      points={["Apply in a few minutes", "We review it, usually within a day", "Then 14 days of Pro free, no card needed"]}
      foot="Your 14 days of Pro start when you're approved, so none are spent waiting."
    >
      <span aria-hidden="true" className="bg-caution-soft text-caution grid size-11 place-items-center rounded-full">
        <HourglassIcon className="size-5" />
      </span>
      <h1 className="page-title mt-4">Your club is awaiting approval</h1>
      <p className="text-ink-2 mt-1.5 text-[13.5px] leading-[1.55]">{CLUB_UNDER_REVIEW}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => router.refresh()}>
          <RefreshCwIcon /> Check again
        </Button>
        <Button variant="secondary" onClick={() => void signOut()} disabled={logout.isPending}>
          <LogOutIcon /> {logout.isPending ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </AuthFrame>
  );
}

const notVerified = (error: unknown) => error instanceof ApiError && error.errorCode === CLUB_NOT_VERIFIED;

/**
 * Whether any call from this page came back CLUB_NOT_VERIFIED: a club
 * whose approval was taken back while it was signed in. The shell then
 * shows AwaitingApproval in place of the dashboard.
 */
export function useClubNotVerified(): boolean {
  const queryClient = useQueryClient();
  const [hit, setHit] = React.useState(false);
  React.useEffect(() => {
    const off = [
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "error" && notVerified(event.action.error)) setHit(true);
      }),
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "error" && notVerified(event.action.error)) setHit(true);
      }),
    ];
    return () => off.forEach((unsubscribe) => unsubscribe());
  }, [queryClient]);
  return hit;
}
