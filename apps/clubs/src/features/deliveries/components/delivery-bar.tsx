"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  DownloadIcon,
  ListIcon,
  Loader2Icon,
  SendIcon,
} from "lucide-react";
import { formatNumber } from "@moa/app-kit";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FigurePanel,
  IconButton,
  Skeleton,
  cn,
} from "@moa/ui";

import { bundleUrl, type DocumentKind } from "../api";
import { useDeliverySummary, useSendDocuments } from "../queries";

/**
 * How many guests have their ticket, as one bar, with the sends beside it.
 *
 * Five counts in five places make the reader do the sums; one bar shows at a
 * glance whether most guests are reached, and the buttons are the three
 * things an organiser does about it: send to whoever has none, retry what
 * failed, or send to everyone again.
 */
const SEGMENTS = [
  { key: "sent", label: "Sent", fill: "bg-admit" },
  { key: "pending", label: "Sending", fill: "bg-info" },
  { key: "failed", label: "Failed", fill: "bg-refuse" },
  { key: "skipped", label: "No address", fill: "bg-caution" },
  { key: "unsent", label: "Not sent yet", fill: "bg-line" },
] as const;

export function DeliveryBar({
  eventId,
  kind = "ticket",
  className,
}: {
  eventId: number;
  kind?: DocumentKind;
  className?: string;
}) {
  const summary = useDeliverySummary(eventId, kind);
  const send = useSendDocuments(eventId, kind);
  const noun = kind === "ticket" ? "ticket" : "certificate";
  const [confirmAll, setConfirmAll] = React.useState(false);

  if (summary.isPending)
    return (
      <Skeleton className={cn("h-[108px] w-full rounded-2xl", className)} />
    );
  if (summary.isError || !summary.data) return null;

  const total = summary.data.registrations;
  const unconfigured = summary.data.providers.filter((p) => !p.configured);
  const email = summary.data.channels.find((c) => c.channel === "email") ?? {
    channel: "email",
    sent: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    unsent: total,
  };
  const toSend = email.unsent + email.failed + email.skipped;
  const busy = send.isPending;
  const values = {
    sent: email.sent,
    pending: email.pending,
    failed: email.failed,
    skipped: email.skipped,
    unsent: email.unsent,
  };
  const sum = SEGMENTS.reduce((n, s) => n + values[s.key], 0);

  return (
    <FigurePanel className={cn("p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-ink text-[15px] font-semibold">
            {kind === "ticket" ? "Tickets" : "Certificates"} by email
          </p>
          <p className="text-ink-3 font-mono text-[11.5px] tabular-nums">
            {formatNumber(email.sent)} of {formatNumber(total)}{" "}
            {kind === "ticket" ? "sent" : "issued, sent"}
            {email.pending ? ` · ${email.pending} sending…` : ""}
            {email.failed ? ` · ${email.failed} failed` : ""}
            {email.skipped ? ` · ${email.skipped} without an address` : ""}
            {summary.data.revoked ? ` · ${summary.data.revoked} revoked` : ""}
          </p>
          {unconfigured.length ? (
            <p className="text-refuse mt-1 text-[12px]">
              {unconfigured.map((p) => `${p.name}: ${p.note}`).join(" ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy || toSend === 0}
            onClick={() => send.mutate("unsent")}
            title={
              toSend === 0
                ? `Everyone with an address has their ${noun}`
                : undefined
            }
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            {toSend > 0
              ? `Send ${toSend} ${toSend === 1 ? noun : `${noun}s`}`
              : `Send ${noun}s`}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="More sending options" disabled={busy}>
                <ChevronDownIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={email.failed + email.skipped === 0}
                onSelect={() => send.mutate("failed")}
              >
                <span className="flex flex-col">
                  <span>Retry problems</span>
                  <span className="text-ink-3 text-xs">
                    Only the sends that failed or were skipped.
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={total === 0}
                onSelect={() => setConfirmAll(true)}
              >
                <span className="flex flex-col">
                  <span>Send to everyone again</span>
                  <span className="text-ink-3 text-xs">
                    Delivered or not — after a redesign, say.
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* A real navigation: the browser handles the file. */}
          <a
            href={bundleUrl(eventId, kind)}
            download
            className="btn btn-secondary btn-sm"
          >
            <DownloadIcon /> All PDFs (ZIP)
          </a>
          <Link
            href={`/events/${eventId}/deliveries?kind=${kind}`}
            className="btn btn-ghost btn-sm"
          >
            <ListIcon /> Deliveries
          </Link>
        </div>
      </div>

      {sum === 0 ? (
        <div className="mt-3">
          <div className="bg-sunken h-2 w-full rounded-full" />
          <p className="text-ink-3 mt-2 text-[12px]">
            Nobody has registered yet
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <div
            role="img"
            aria-label={SEGMENTS.map(
              (s) => `${s.label}: ${values[s.key]}`,
            ).join(", ")}
            className="bg-sunken flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
          >
            {SEGMENTS.filter((s) => values[s.key] > 0).map((s) => (
              <span
                key={s.key}
                style={{ width: `${(100 * values[s.key]) / sum}%` }}
                className={cn("h-full min-w-[3px] rounded-full", s.fill)}
              />
            ))}
          </div>
          <ul className="text-ink-3 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
            {SEGMENTS.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <i className={cn("inline-block size-2 rounded-full", s.fill)} />
                <span className="text-ink font-mono tabular-nums">
                  {formatNumber(values[s.key])}
                </span>
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send every {noun} again?</AlertDialogTitle>
            <AlertDialogDescription>
              {total} {total === 1 ? "guest gets" : "guests get"} their {noun}{" "}
              by email again, including everyone who already has it. Use this
              after changing the design, or if the first send went out wrong.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">
              Keep as is
            </AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              onClick={() => send.mutate("all")}
            >
              Send to everyone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}
