"use client";

import * as React from "react";
import { EyeIcon, Loader2Icon } from "lucide-react";
import { api } from "@moa/app-kit";
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
  toast,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

/**
 * Open a session as another user.
 *
 * The most dangerous control in the dashboard, so the UI matches the
 * backend's fencing rather than hiding it: the admin states a reason, the
 * dialog says plainly that the action is logged against their name, and the
 * hand-off token is good for two minutes.
 *
 * It was deliberately not built until the audit log existed.
 */
const CLUBS_APP = "https://clubs-next.myotherapp.in";

export function ImpersonateButton({
  userId,
  name,
  userType,
}: {
  userId: number;
  name: string;
  userType: string | null | undefined;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  /*
   * Only club accounts. The hand-off lands on the clubs dashboard, which is
   * the only web app a session can be opened into -- an app user's product is
   * the mobile app, and that dashboard would reject them at its role check.
   * Offering a button that leads to a rejection is worse than not offering
   * one; this needs a mobile hand-off before it can cover app users.
   *
   * Admins are excluded separately: the API refuses them, and a 403 is a
   * worse way to find that out.
   */
  if (userType !== "club") return null;

  async function start() {
    setBusy(true);
    try {
      const result = await api.post<{ token: string }>(
        `/api/v1/auth/admin/impersonate/${userId}`,
        { reason: reason.trim() || null }
      );

      // The token is exchanged for cookies on the other app's own origin, so
      // the hand-off is a navigation rather than a fetch -- a cookie set by
      // this origin would not be sent to that one.
      const url = `${CLUBS_APP}/impersonate?token=${encodeURIComponent(result.token)}`;
      window.open(url, "_blank", "noopener,noreferrer");

      setOpen(false);
      setReason("");
      toast.success(`Opened a session as ${name}. This is in the activity log.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={cn(pressable)}
        onClick={() => setOpen(true)}
      >
        <EyeIcon /> View as
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open a session as {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be signed in as this account in a new tab, with their
              access to their own data. <strong>This is recorded in the
              activity log against your name</strong>, including the reason you
              give below.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="impersonate-reason">Reason (optional)</Label>
            <Input
              id="impersonate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. investigating a reported problem"
              disabled={busy}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants())}
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void start();
              }}
            >
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {busy ? "Starting…" : "Open session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
