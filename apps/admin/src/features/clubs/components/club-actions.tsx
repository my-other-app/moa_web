"use client";

import * as React from "react";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
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
  buttonVariants,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useApproveClub, useRejectClub } from "../queries";
import type { AdminClub } from "../schemas";

export function ClubActions({ club }: { club: AdminClub }) {
  const approve = useApproveClub();
  const reject = useRejectClub();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const busy = approve.isPending || reject.isPending;

  return (
    <div className="flex justify-end gap-2">
      {!club.is_verified ? (
        <Button
          size="sm"
          variant="outline"
          className={pressable}
          disabled={busy}
          onClick={() => approve.mutate(club.id)}
        >
          {approve.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <CheckIcon />
          )}
          Approve
        </Button>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Button
          size="sm"
          variant="ghost"
          className={cn("text-destructive hover:text-destructive", pressable)}
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
        >
          {reject.isPending ? <Loader2Icon className="animate-spin" /> : <XIcon />}
          Reject
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject “{club.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* Stating the real consequence: the API has no "rejected"
                  state, so rejecting soft-deletes the club. */}
              This removes the club from the platform. It will disappear from
              club listings and search, and its organisers lose access. It goes
              to Trash, where it can be restored (still pending approval).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() => reject.mutate(club.id)}
            >
              Reject club
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
