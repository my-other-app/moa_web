"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { ApiError } from "@moa/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Notice,
} from "@moa/ui";

import { isPlanLockError } from "@/features/plan/errors";

import { newClientRef } from "../api";
import { useResendReviewEmail, useReviewResendCount } from "../queries";
import { reviewResendWho } from "../schemas";

const people = (n: number) => `${formatNumber(n)} ${n === 1 ? "person" : "people"}`;

/**
 * A refused send-again in plain words (event-review-emails-contract.md,
 * section 2): the stage can't be resent, nobody is left to reach, the event
 * doesn't review registrations, or the club's emails are used up. Null for a
 * plan refusal, which the upgrade dialog answers.
 */
export function resendErrorText(error: unknown): string | null {
  if (isPlanLockError(error)) return null;
  if (error instanceof ApiError) {
    const code = error.errorCode ?? "";
    if (code === "NOT_RESENDABLE") return "This email can't be sent again. It goes out once, by itself, at its moment.";
    if (code === "NOBODY") return "Nobody would get it right now: no one is at this step any more.";
    if (code === "NOT_REVIEWED") return "This event doesn't review registrations, so its review emails don't go out.";
    if (/QUOTA|CREDIT|MESSAGE_LIMIT|EMAIL_LIMIT/.test(code) || error.status === 402 || error.status === 429)
      return "The club's emails for this month are used up. Buy more on the Billing page, or send again next month.";
  }
  return error instanceof Error && error.message ? error.message : "That did not go through. Try again.";
}

/**
 * The last look before a review email goes again to the people who already
 * got it: how many, and who they are. One key (clientRef) per press of
 * Send, kept on a retry of that press, so a lost answer mails nobody twice;
 * a send that went through starts a new one.
 */
export function ResendReviewDialog({
  eventId,
  stage,
  label,
  eligible,
  open,
  onOpenChange,
  onSent,
}: {
  eventId: number;
  stage: string;
  label: string;
  /** What the list said; the dialog counts again when it opens. */
  eligible: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}) {
  const resend = useResendReviewEmail(eventId);
  const count = useReviewResendCount(eventId, stage, open);
  // One key per send of a stage, kept until it goes, across a closed and reopened dialog too.
  const refs = React.useRef(new Map<string, string>());
  const [problem, setProblem] = React.useState<string | null>(null);
  const n = count.data?.eligible ?? eligible;
  const without = count.data?.withoutEmail ?? 0;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        // A refusal belongs to the press it answered: closed, it is forgotten.
        if (!o) setProblem(null);
        onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send “{label}” again?</AlertDialogTitle>
          <AlertDialogDescription>
            {count.isPending && open ? "Counting… " : null}
            It goes to {people(n)}: {reviewResendWho(stage)}.
            {without ? ` ${people(without)} without an email address ${without === 1 ? "is" : "are"} skipped.` : ""} Each gets
            this event&apos;s words as they are now, by email only.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {problem ? (
          <Notice tone="refuse" tag="Not sent">
            {problem}
          </Notice>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary">Not now</AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={resend.isPending || n === 0}
            onClick={(e) => {
              e.preventDefault();
              let clientRef = refs.current.get(stage);
              if (!clientRef) {
                clientRef = newClientRef();
                refs.current.set(stage, clientRef);
              }
              setProblem(null);
              resend.mutate(
                { stage, clientRef },
                {
                  onSuccess: () => {
                    // Sent: the next press is a new send.
                    refs.current.delete(stage);
                    setProblem(null);
                    onOpenChange(false);
                    onSent?.();
                  },
                  onError: (error) => setProblem(resendErrorText(error)),
                },
              );
            }}
          >
            {resend.isPending ? <Loader2Icon className="animate-spin" /> : null}
            {n ? `Send to ${formatNumber(n)}` : "Send"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
