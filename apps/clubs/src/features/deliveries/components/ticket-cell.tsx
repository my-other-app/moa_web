"use client";

import * as React from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
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
  IconButton,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@moa/ui";

import { useRevokeTicket, useSendOneTicket } from "../queries";
import { type DeliveryBrief, verdictOf } from "../schemas";

export interface TicketRow {
  id: string;
  full_name?: string | null;
  ticket_id?: string | null;
  ticket_revoked_at?: string | null;
  ticket_deliveries?: DeliveryBrief[];
}

/** One line a desk can act on, for the email channel. */
const line = (d: DeliveryBrief | undefined) => {
  if (!d) return "Email: not sent yet";
  const v = verdictOf(d);
  const why = d.reason ?? d.error;
  const when = d.sent_at ? ` · ${formatDateTime(d.sent_at)}` : "";
  return `Email: ${v.label}${why ? ` — ${why}` : ""}${when}`;
};

/**
 * Whether this guest has their ticket, and the two things to do about it:
 * send it again, or take it back. The chip is the state; the menu is the
 * verb, kept quiet until it is needed.
 */
export function TicketCell({
  eventId,
  row,
}: {
  eventId: number;
  row: TicketRow;
}) {
  const sendOne = useSendOneTicket(eventId);
  const revoke = useRevokeTicket(eventId);
  const [confirmRevoke, setConfirmRevoke] = React.useState(false);
  const email = row.ticket_deliveries?.find((d) => d.channel === "email");
  const revoked = !!row.ticket_revoked_at;
  const busy = sendOne.isPending || revoke.isPending;
  const name = row.full_name || "this guest";

  return (
    <div className="flex items-center justify-end gap-2">
      {revoked ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <StatusBadge tone="destructive" label="Revoked" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Refused at check-in since {formatDateTime(row.ticket_revoked_at)}
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <StatusBadge
                tone={email ? verdictOf(email).tone : "default"}
                label={email ? verdictOf(email).label : "Not sent"}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{line(email)}</TooltipContent>
        </Tooltip>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            label={`Ticket actions for ${name}`}
            size="xs"
            variant="quiet"
            disabled={busy}
          >
            <MoreHorizontalIcon />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={revoked}
            onSelect={() => sendOne.mutate(row.id)}
          >
            <span className="flex flex-col">
              <span>Send ticket again</span>
              <span className="text-ink-3 text-xs">
                {revoked
                  ? "Reinstate it first."
                  : "By email, even if it was delivered before."}
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {revoked ? (
            <DropdownMenuItem
              onSelect={() =>
                revoke.mutate({ registrationId: row.id, revoke: false })
              }
            >
              <span className="flex flex-col">
                <span>Reinstate this ticket</span>
                <span className="text-ink-3 text-xs">
                  Check-in accepts it again.
                </span>
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmRevoke(true)}
            >
              <span className="flex flex-col">
                <span>Revoke their ticket</span>
                <span className="text-xs opacity-80">
                  For a lost or transferred ticket.
                </span>
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {name}&apos;s ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              Check-in refuses it by name from now on, and nothing is sent for
              it. You can reinstate it here at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                revoke.mutate({ registrationId: row.id, revoke: true })
              }
            >
              Revoke ticket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
