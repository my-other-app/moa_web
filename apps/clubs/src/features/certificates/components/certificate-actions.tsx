"use client";

import * as React from "react";
import { FileTextIcon, MoreHorizontalIcon } from "lucide-react";
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
} from "@moa/ui";

import { useSendOneDocument } from "@/features/deliveries";

import { certificatePdfUrl } from "../api";
import { useRevokeCertificate } from "../queries";
import type { CertificateRow } from "../schemas";

/**
 * A row's actions: the certificate itself one click away (it is the
 * preview), and behind the menu sending it again or taking it back. A
 * revoked one has no PDF — the download is refused — so its button is off.
 */
export function CertificateActions({
  eventId,
  row,
}: {
  eventId: number;
  row: CertificateRow;
}) {
  const sendOne = useSendOneDocument(eventId, "certificate");
  const revoke = useRevokeCertificate(eventId);
  const [confirm, setConfirm] = React.useState(false);
  const revoked = row.status === "revoked";
  const busy = sendOne.isPending || revoke.isPending;

  return (
    <span className="flex items-center justify-end gap-1">
      {revoked ? (
        <IconButton label={`${row.name}'s certificate is revoked`} disabled>
          <FileTextIcon />
        </IconButton>
      ) : (
        <a
          href={certificatePdfUrl(row.ticket_id)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${row.name}'s certificate`}
          title="Open the PDF"
          className="btn btn-secondary btn-icon btn-sm btn-round"
        >
          <FileTextIcon />
        </a>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            label={`Actions for ${row.name}`}
            variant="quiet"
            disabled={busy}
          >
            <MoreHorizontalIcon />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={revoked}
            onSelect={() => sendOne.mutate(row.registration_id)}
          >
            <span className="flex flex-col">
              <span>Send again</span>
              <span className="text-ink-3 text-xs">
                By email, even if it was delivered before.
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {revoked ? (
            <DropdownMenuItem
              onSelect={() =>
                revoke.mutate({
                  registrationId: row.registration_id,
                  revoke: false,
                })
              }
            >
              <span className="flex flex-col">
                <span>Reinstate</span>
                <span className="text-ink-3 text-xs">
                  Its QR verifies again.
                </span>
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirm(true)}
            >
              <span className="flex flex-col">
                <span>Revoke</span>
                <span className="text-xs opacity-80">
                  The QR on it stops verifying.
                </span>
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke {row.name}&apos;s certificate?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {row.number} stops verifying: anyone who scans its QR sees it was
              revoked, and the download is refused. The PDF they already hold
              does not change. You can reinstate it here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                revoke.mutate({
                  registrationId: row.registration_id,
                  revoke: true,
                })
              }
            >
              Revoke certificate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}
