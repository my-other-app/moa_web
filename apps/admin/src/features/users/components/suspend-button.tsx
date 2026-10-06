"use client";

import * as React from "react";
import { Loader2Icon, ShieldBanIcon, ShieldCheckIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Label,
  buttonVariants,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useSetUserActive } from "../queries";

import { useCan } from "@/hooks/use-can";

/**
 * Suspend or reinstate an account.
 *
 * The only lever an admin had was delete, which is permanent in practice and
 * takes the person's data with it. Suspension is reversible and says so.
 */
export function SuspendButton({
  userId,
  name,
  isActive,
}: {
  userId: number;
  name: string;
  isActive: boolean;
}) {
  /*
   * Suspension is moderation -- support does this daily.
   *
   * Hidden rather than disabled: a greyed-out control still implies the
   * action exists for you and merely needs something, which is not the
   * case. The endpoint enforces this regardless.
   */
  const allowed = useCan("moderate");
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const setActive = useSetUserActive(userId);

  if (!allowed) return null;

  async function confirm() {
    await setActive.mutateAsync({ isActive: !isActive, reason });
    setOpen(false);
    setReason("");
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={cn(isActive && "text-destructive hover:text-destructive", pressable)}
        onClick={() => setOpen(true)}
      >
        {isActive ? <ShieldBanIcon /> : <ShieldCheckIcon />}
        {isActive ? "Suspend" : "Reinstate"}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isActive ? `Suspend ${name}?` : `Reinstate ${name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isActive ? (
                <>
                  They are signed out everywhere immediately and cannot sign
                  back in. Nothing is deleted and you can reinstate them at any
                  time. This is recorded in the activity log against your name.
                </>
              ) : (
                "They will be able to sign in again. This is recorded in the activity log."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {isActive ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="suspend-reason">Reason (optional)</Label>
              <Input
                id="suspend-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. repeated reports of spam"
                disabled={setActive.isPending}
              />
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={setActive.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                buttonVariants({ variant: isActive ? "destructive" : "default" })
              )}
              disabled={setActive.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirm();
              }}
            >
              {setActive.isPending ? <Loader2Icon className="animate-spin" /> : null}
              {isActive ? "Suspend account" : "Reinstate account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
