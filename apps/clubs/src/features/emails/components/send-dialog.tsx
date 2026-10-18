"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@moa/ui";

import { newClientRef } from "../api";
import { useAudienceCount, useSendTemplate } from "../queries";
import { audienceSummary, type EmailTemplateFields } from "../schemas";

/**
 * The last look before a template goes to real inboxes: who it reaches,
 * what rides along. Nothing is sent until Send is pressed here.
 */
export function SendTemplateDialog({
  eventId,
  template,
  open,
  onOpenChange,
  onSent,
}: {
  eventId: number;
  template: (EmailTemplateFields & { id: string }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}) {
  const send = useSendTemplate(eventId);
  // One key per send of a template, kept until it is sent: a double click, or
  // Send again after a dropped answer, is the same send and mails nobody twice.
  const refs = React.useRef(new Map<string, string>());
  const refFor = (templateId: string) => {
    let ref = refs.current.get(templateId);
    if (!ref) {
      ref = newClientRef();
      refs.current.set(templateId, ref);
    }
    return ref;
  };
  const count = useAudienceCount(
    eventId,
    template?.audience ?? { who: "ALL", roles: [] },
    open && template !== null,
  );
  const n = count.data?.recipients;
  const files = [
    template?.attachments.ticketPdf ? "the ticket" : null,
    template?.attachments.certificatePdf ? "the certificate" : null,
  ].filter(Boolean);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send “{template?.name}” now?</AlertDialogTitle>
          <AlertDialogDescription>
            {template ? audienceSummary(template.audience) : ""}
            {n === undefined
              ? " — counting…"
              : ` — ${n} ${n === 1 ? "guest" : "guests"} with an email address`}
            {count.data?.withoutEmail
              ? `, ${count.data.withoutEmail} without one`
              : ""}
            .{files.length ? ` Each email carries ${files.join(" and ")}.` : ""}{" "}
            Guests are emailed one by one; the message shows how it went.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary">Not now</AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={send.isPending || !template || n === 0}
            onClick={(e) => {
              e.preventDefault();
              if (!template) return;
              const templateId = template.id;
              send.mutate(
                { templateId, clientRef: refFor(templateId) },
                {
                  onSuccess: () => {
                    // Sent: the next press is a new send.
                    refs.current.delete(templateId);
                    onOpenChange(false);
                    onSent?.();
                  },
                },
              );
            }}
          >
            {send.isPending ? <Loader2Icon className="animate-spin" /> : null}
            {n ? `Send to ${n}` : "Send"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
