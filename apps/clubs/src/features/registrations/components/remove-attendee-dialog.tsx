"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moa/ui";

import { useRemoveRegistration } from "../queries";

/**
 * Deletes the record, their ticket and any check-in. It is the right answer to
 * "take me off the list", and it cannot be undone -- so the event's slug is
 * typed, not just a button pressed.
 */
export function RemoveAttendeeDialog({
  eventId,
  eventSlug,
  attendee,
  open,
  onOpenChange,
}: {
  eventId: number;
  eventSlug: string;
  attendee: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useRemoveRegistration(eventId);
  const [slug, setSlug] = React.useState("");
  const matches = slug.trim() === eventSlug;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setSlug("");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {attendee?.name ?? "this guest"} from the list</DialogTitle>
          <DialogDescription>
            This deletes their registration, their ticket and their check-in. It is the right answer to &ldquo;take me off the list&rdquo;, and it cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {/* The slug is named in the label, not left in a placeholder that vanishes
            the moment anything is typed -- nobody can match a value they cannot see. */}
        <div>
          <label htmlFor="remove-confirm" className="text-ink-2 mb-1.5 block text-[12.5px]">
            Type <code className="bg-sunken text-ink rounded-md px-1.5 py-0.5 font-mono text-[12px]">{eventSlug}</code> to confirm
          </label>
          <input id="remove-confirm" autoFocus value={slug} onChange={(e) => setSlug(e.target.value)} className="input h-9 w-full font-mono" autoComplete="off" spellCheck={false} />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Keep them
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!matches || remove.isPending || !attendee}
            onClick={() =>
              attendee &&
              remove.mutate(
                { registrationId: attendee.id, confirmSlug: slug.trim() },
                {
                  onSuccess: () => {
                    setSlug("");
                    onOpenChange(false);
                  },
                },
              )
            }
          >
            {remove.isPending ? <Loader2Icon className="animate-spin" /> : null}
            Remove from the list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
