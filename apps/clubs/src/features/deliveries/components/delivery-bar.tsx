"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDownIcon, DownloadIcon, ListIcon, Loader2Icon, SendIcon } from "lucide-react";
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
  DistributionBar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

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
export function DeliveryBar({ eventId, kind = "ticket", className }: { eventId: number; kind?: DocumentKind; className?: string }) {
  const summary = useDeliverySummary(eventId, kind);
  const send = useSendDocuments(eventId, kind);
  const noun = kind === "ticket" ? "ticket" : "certificate";
  const [confirmAll, setConfirmAll] = React.useState(false);

  if (summary.isPending) return <Skeleton className={cn("h-[108px] w-full rounded-lg", className)} />;
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

  return (
    <div className={cn("rounded-lg border-[0.5px] border-[var(--swatch-grey)] p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-xl font-medium text-[var(--swatch-ink)]">{kind === "ticket" ? "Tickets" : "Certificates"} by email</p>
          <p className="text-muted-foreground font-mono text-xs tabular-nums">
            {email.sent} of {total} {kind === "ticket" ? "sent" : "issued, sent"}
            {email.pending ? ` · ${email.pending} sending…` : ""}
            {email.failed ? ` · ${email.failed} failed` : ""}
            {email.skipped ? ` · ${email.skipped} without an address` : ""}
            {summary.data.revoked ? ` · ${summary.data.revoked} revoked` : ""}
          </p>
          {unconfigured.length ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {unconfigured.map((p) => `${p.name}: ${p.note}`).join(" ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className={pressable}
            disabled={busy || toSend === 0}
            onClick={() => send.mutate("unsent")}
            title={toSend === 0 ? `Everyone with an address has their ${noun}` : undefined}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            {toSend > 0 ? `Send ${toSend} ${toSend === 1 ? noun : `${noun}s`}` : `Send ${noun}s`}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={busy} aria-label="More sending options">
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={email.failed + email.skipped === 0} onSelect={() => send.mutate("failed")}>
                <span className="flex flex-col">
                  <span>Retry problems</span>
                  <span className="text-muted-foreground text-xs">Only the sends that failed or were skipped.</span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={total === 0} onSelect={() => setConfirmAll(true)}>
                <span className="flex flex-col">
                  <span>Send to everyone again</span>
                  <span className="text-muted-foreground text-xs">Delivered or not — after a redesign, say.</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" size="sm" variant="outline" className={pressable} asChild>
            {/* A real navigation: the browser handles the file. */}
            <a href={bundleUrl(eventId, kind)} download>
              <DownloadIcon /> All PDFs (ZIP)
            </a>
          </Button>
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link href={`/events/${eventId}/deliveries`}>
              <ListIcon /> Delivery log
            </Link>
          </Button>
        </div>
      </div>

      <DistributionBar
        className="mt-3"
        emptyLabel="Nobody has registered yet"
        segments={[
          { key: "sent", label: "Sent", value: email.sent, tone: "success" },
          { key: "pending", label: "Sending", value: email.pending, tone: "info" },
          { key: "failed", label: "Failed", value: email.failed, tone: "destructive" },
          { key: "skipped", label: "No address", value: email.skipped, tone: "warning" },
          { key: "unsent", label: "Not sent yet", value: email.unsent, tone: "neutral" },
        ]}
      />

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send every {noun} again?</AlertDialogTitle>
            <AlertDialogDescription>
              {total} {total === 1 ? "guest gets" : "guests get"} their {noun} by email again, including everyone who already has
              it. Use this after changing the design, or if the first send went out wrong.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as is</AlertDialogCancel>
            <AlertDialogAction onClick={() => send.mutate("all")}>Send to everyone</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
