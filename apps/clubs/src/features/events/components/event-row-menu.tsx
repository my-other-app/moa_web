"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BanIcon,
  CopyIcon,
  CopyPlusIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";

import { useAccess } from "@/features/access";
import { useDeleteEvent } from "@/features/event-form";
import { useLimitGate } from "@/features/plan";
import { PUBLIC_SITE, eventPublicUrl } from "@/lib/public-site";

import type { ClubEvent } from "../schemas";
import { DuplicateDialog } from "./duplicate-dialog";

/**
 * The public page an organiser hands out, never the dashboard URL they stand
 * on. An event without a slug yet gets the id path, which the site redirects
 * to the slug page.
 */
export const publicUrl = (event: Pick<ClubEvent, "id" | "slug">) =>
  event.slug ? eventPublicUrl(event.slug) : `${PUBLIC_SITE}/${event.id}`;

/**
 * Everything a row can do that is not its one primary action, behind one
 * button. Delete sits last, after a rule, and asks first — it used to be a
 * single click on the same row as the name.
 */
export function EventRowMenu({
  event,
  onDeleted,
  onCancel,
}: {
  event: Pick<ClubEvent, "id" | "name" | "slug" | "registration_count"> & Partial<Pick<ClubEvent, "requests_pending">>;
  /** Called after a successful delete, for a page that cannot stay where it is. */
  onDeleted?: () => void;
  /** Offers "Cancel event…" (the event's page passes it when the role and the backend allow it). */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const remove = useDeleteEvent();
  const { can } = useAccess();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [dupOpen, setDupOpen] = React.useState(false);
  // A copy is a new event: at the month's cap it opens the upgrade dialog instead.
  const monthly = useLimitGate("events_per_month");
  const registered = event.registration_count ?? 0;
  const waiting = event.requests_pending ?? 0;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl(event));
      toast.success("Public event link copied");
    } catch {
      window.open(publicUrl(event), "_blank", "noopener,noreferrer");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More for ${event.name}`}
            className="border-line bg-surface text-ink-2 hover:bg-sunken hover:text-ink grid size-9 shrink-0 place-items-center rounded-full border transition-colors"
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() => router.push(`/events/${event.id}/edit`)}
          >
            <PencilIcon className="size-4" /> Edit details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={monthly.guard(() => setDupOpen(true))}>
            <CopyPlusIcon className="size-4" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              window.open(publicUrl(event), "_blank", "noopener,noreferrer")
            }
          >
            <ExternalLinkIcon className="size-4" /> Open public page
          </DropdownMenuItem>
          <DropdownMenuItem onClick={copyLink}>
            <CopyIcon className="size-4" /> Copy public link
          </DropdownMenuItem>
          {onCancel ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onCancel}>
                <BanIcon className="size-4" /> Cancel event…
              </DropdownMenuItem>
            </>
          ) : null}
          {can.delete_events ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2Icon className="size-4" /> Delete event
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {dupOpen ? (
        <DuplicateDialog event={event} onClose={() => setDupOpen(false)} />
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{event.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {registered > 0 ? (
                <>
                  <strong>
                    {registered.toLocaleString("en-IN")}{" "}
                    {registered === 1 ? "person has" : "people have"} already
                    registered.
                  </strong>{" "}
                  They lose this event and their tickets. This cannot be undone
                  from here.{onCancel ? " To call it off and tell them, cancel the event instead." : ""}
                </>
              ) : (
                "This removes the event from the app. It cannot be undone from here."
              )}
              {waiting > 0 ? (
                <>
                  {" "}
                  <strong>
                    {waiting.toLocaleString("en-IN")}{" "}
                    {waiting === 1 ? "person is" : "people are"} waiting for you
                    to confirm them.
                  </strong>{" "}
                  Their requests close, and they&apos;ll get a polite email
                  saying you weren&apos;t able to confirm their place.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() =>
                // A refusal is toasted by the mutation; only a delete moves the page.
                void remove.mutateAsync(event.id).then(
                  () => onDeleted?.(),
                  () => undefined,
                )
              }
            >
              Delete event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
