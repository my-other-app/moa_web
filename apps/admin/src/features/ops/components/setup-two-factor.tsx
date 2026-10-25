"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";
import { useLogout } from "@moa/app-kit";
import { Button, Notice } from "@moa/ui";

import { TwoFactorPanel, useTotpStatus } from "@/features/security";

import { OPS_ME_KEY } from "../queries";

/**
 * The one thing an admin without two-factor can do once their grace is over:
 * turn it on. The panel is the Security page's own; once it is on (and the
 * recovery codes are saved -- they are shown once), Continue opens the portal.
 */
export function SetupTwoFactor({ name }: { name: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { data: status } = useTotpStatus();
  const enabled = status?.enabled ?? false;

  async function proceed() {
    await queryClient.invalidateQueries({ queryKey: OPS_ME_KEY });
    router.replace("/");
    router.refresh();
  }

  async function signOut() {
    await logout.mutateAsync();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="bg-brand-soft text-brand grid size-11 shrink-0 place-items-center rounded-xl">
          <ShieldCheckIcon className="size-5" />
        </div>
        <div className="space-y-1">
          <h1 className="m-0 text-[24px] leading-tight tracking-[-0.015em]">Turn on two-factor sign-in</h1>
          <p className="text-ink-3 m-0 text-sm text-pretty">
            {name}, every admin account needs a second step at sign-in now. Admin accounts can refund money, act as
            other people and download every user&apos;s data, so a password alone is not enough.
          </p>
        </div>
      </div>
      <TwoFactorPanel />
      {enabled ? (
        <Notice
          tone="admit"
          tag="Done"
          action={
            <Button size="sm" onClick={() => void proceed()}>
              Continue to the portal <ArrowRightIcon />
            </Button>
          }
        >
          Two-factor is on. Keep your recovery codes somewhere safe before you go on.
        </Notice>
      ) : null}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" disabled={logout.isPending} onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
