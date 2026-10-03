"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { Icon } from "@/components/icon";
import { useDeleteEvent } from "@/features/event-form";
import type { ClubEvent } from "../schemas";

/** 48px square, #f3f3f3 fill, 4px radius — the design's row action (3:834). */
const ACTION =
  "grid size-12 shrink-0 place-items-center rounded bg-[#f3f3f3] text-[var(--swatch-grey)] transition-colors hover:bg-[var(--swatch-ink)] hover:text-white focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]";

/**
 * The design shows the same three actions on the list row (3:834) and on the
 * event screen (168:1251), so the prop is the structural minimum both pages
 * can supply rather than a full ClubEvent.
 */
export type ActionableEvent = Pick<ClubEvent, "id" | "name"> & {
  registration_count?: number | null;
};

export function EventRowActions({
  event,
  onDeleted,
}: {
  event: ActionableEvent;
  /** Called after a successful delete, for pages that cannot stay where they are. */
  onDeleted?: () => void;
}) {
  const remove = useDeleteEvent();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const registered = event.registration_count ?? 0;

  async function onShare() {
    // The public event page is what an organiser actually wants to hand out,
    // not the dashboard URL they are standing on.
    const url = `https://events.myotherapp.in/${event.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Public event link copied");
    } catch {
      // Clipboard is blocked in some browsers without a user gesture chain;
      // opening the page is still useful.
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-3 sm:gap-6">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={`/events/${event.id}/edit`}
            aria-label={`Edit ${event.name}`}
            className={cn(ACTION, pressable)}
          >
            <Icon name="edit-05" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>Edit</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label={`Delete ${event.name}`}
            className={cn(ACTION, "hover:bg-destructive hover:text-white", pressable)}
          >
            <Icon name="trash-03" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onShare}
            aria-label={`Copy public link for ${event.name}`}
            className={cn(ACTION, pressable)}
          >
            <Icon name="share-04" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Copy public link</TooltipContent>
      </Tooltip>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{event.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {registered > 0 ? (
                <>
                  <strong>
                    {registered.toLocaleString("en-IN")}{" "}
                    {registered === 1 ? "person has" : "people have"} already registered.
                  </strong>{" "}
                  They will lose access to this event and their tickets. This cannot be
                  undone from here.
                </>
              ) : (
                "This removes the event from the app. It cannot be undone from here."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={async () => {
                await remove.mutateAsync(event.id);
                onDeleted?.();
              }}
            >
              Delete event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
