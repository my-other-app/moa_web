"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, SendIcon } from "lucide-react";
import { formatDateTime, formatNumber, relativeTime } from "@moa/app-kit";
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
  FigurePanel,
  Notice,
  Skeleton,
  StatusBadge,
  cn,
} from "@moa/ui";

import { useEventDetail } from "@/features/events/queries";

import { reviewHref } from "../api";
import { useResetReviewEmail, useReviewEmails } from "../queries";
import { STAGE_META, type ReviewEmail, type ReviewResend } from "../schemas";
import { EmailPreview, PreviewToggle } from "./parts";
import { ResendReviewDialog } from "./resend-dialog";

/**
 * The registration review emails as this event sends them
 * (event-review-emails-contract.md, section 4): each stage's words — the
 * club's, or this event's own — with Preview, Edit, "Use club's default"
 * and, where it makes sense, a send-again to the people who already got it.
 * Hidden on an API without them per event; folded away, with one line, on an
 * event that doesn't review registrations.
 */

const goes = (when: string) => `Goes out ${when}${/[.!?]$/.test(when) ? "" : "."}`;

/** "Sent to 431 of 437 · 2 h ago · 3 failed"; "Sending to 437 · started 2 min ago" while it goes. */
export function resendLine(r: ReviewResend, now: Date): string {
  if (r.status === "sending") return `Sending to ${formatNumber(r.recipients)} · started ${relativeTime(r.createdAt, now)}`;
  return [
    `Sent to ${formatNumber(r.sent)} of ${formatNumber(r.recipients)}`,
    relativeTime(r.createdAt, now),
    r.failed ? `${formatNumber(r.failed)} failed` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const reviewLabel = (r: ReviewEmail) => STAGE_META[r.stage]?.label ?? r.label ?? r.template.name;

function ReviewStageCard({
  eventId,
  item,
  now,
  onReset,
  onResend,
}: {
  eventId: number;
  item: ReviewEmail;
  now: Date;
  onReset: () => void;
  onResend: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const t = item.template;
  const meta = STAGE_META[item.stage];
  const label = reviewLabel(item);
  const own = item.source === "event";
  const last = item.lastResend ?? null;
  return (
    <FigurePanel className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink truncate text-[15px] font-semibold">{label}</p>
          <p className="text-ink-3 truncate text-[12px]">{t.subject}</p>
        </div>
        <StatusBadge tone={own ? "info" : "default"} label={own ? "This event's own" : "Club's default"} className="shrink-0" />
      </div>
      {meta.when ? <p className="text-ink-2 mt-2 text-[12.5px]">{goes(meta.when)}</p> : null}
      {last ? (
        <p
          className={cn("mt-0.5 text-[12px]", last.failed ? "text-caution" : "text-ink-3")}
          title={formatDateTime(last.createdAt)}
        >
          Sent again: {resendLine(last, now)}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-3">
        <PreviewToggle name={label} open={open} onToggle={() => setOpen(!open)} />
        <Link href={reviewHref(eventId, item.stage)} className="btn btn-secondary btn-sm">
          <PencilIcon /> Edit
        </Link>
        {own ? (
          <Button size="sm" variant="ghost" onClick={onReset}>
            Use club&apos;s default
          </Button>
        ) : null}
        {item.resendable && item.eligible > 0 ? (
          <Button size="sm" variant="secondary" onClick={onResend}>
            <SendIcon /> Send to {formatNumber(item.eligible)} {item.eligible === 1 ? "person" : "people"}…
          </Button>
        ) : null}
      </div>
      <EmailPreview scope={{ kind: "event", eventId }} subject={t.subject} design={t.design} name={label} open={open} />
    </FigurePanel>
  );
}

export function ReviewSection({ eventId }: { eventId: number }) {
  const [now] = React.useState(() => new Date());
  const list = useReviewEmails(eventId);
  const event = useEventDetail(eventId);
  const reset = useResetReviewEmail(eventId);
  const [resetting, setResetting] = React.useState<ReviewEmail | null>(null);
  // The last stage asked about stays put while its dialog closes.
  const [resending, setResending] = React.useState<ReviewEmail | null>(null);
  const [resendOpen, setResendOpen] = React.useState(false);
  const [shown, setShown] = React.useState(false);

  // An API without review emails per event: nothing to show.
  if (list.data === null) return null;
  // The event's setting decides; unknown (still loading, or failed) counts as reviewing.
  const reviews = event.data ? event.data.requires_approval : true;
  const open = reviews || shown;

  return (
    <section aria-labelledby="review-emails">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="review-emails" className="eyebrow m-0">
          Registration review
        </h3>
        {!reviews ? (
          <Button size="xs" variant="ghost" aria-expanded={shown} onClick={() => setShown(!shown)}>
            {shown ? <ChevronUpIcon /> : <ChevronDownIcon />} {shown ? "Hide them" : "Show them"}
          </Button>
        ) : null}
      </div>
      {!reviews ? (
        <p className="text-ink-3 mb-2 text-[12.5px]">
          These only go out for events that review registrations. This event doesn&apos;t.
        </p>
      ) : (
        <p className="text-ink-3 mb-2 text-[12.5px]">
          Sent by themselves as each registration is reviewed. Change one here and only this event changes; other events keep
          the club&apos;s.
        </p>
      )}
      {!open ? null : list.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-[150px] rounded-2xl" />
          ))}
        </div>
      ) : list.isError ? (
        <Notice tone="caution" tag="Review emails">
          Could not load them: {list.error.message} Try reloading the page.
        </Notice>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((item) => (
            <ReviewStageCard
              key={item.stage}
              eventId={eventId}
              item={item}
              now={now}
              onReset={() => setResetting(item)}
              onResend={() => {
                setResending(item);
                setResendOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <AlertDialog open={resetting !== null} onOpenChange={(o) => !o && setResetting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use the club&apos;s default?</AlertDialogTitle>
            <AlertDialogDescription>
              This event&apos;s own words for “{resetting ? reviewLabel(resetting) : ""}” are dropped, and it sends the
              club&apos;s version from now on. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep this event&apos;s</AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              disabled={reset.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (resetting) reset.mutate(resetting.stage, { onSuccess: () => setResetting(null) });
              }}
            >
              Use the club&apos;s
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResendReviewDialog
        eventId={eventId}
        stage={resending?.stage ?? ""}
        label={resending ? reviewLabel(resending) : ""}
        eligible={resending?.eligible ?? 0}
        open={resendOpen}
        onOpenChange={setResendOpen}
      />
    </section>
  );
}
