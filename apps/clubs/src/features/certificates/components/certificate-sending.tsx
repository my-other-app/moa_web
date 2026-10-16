"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  DownloadIcon,
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
  CardLabel,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FigurePanel,
  IconButton,
  Skeleton,
  cn,
} from "@moa/ui";

import { bundleUrl, useDeliverySummary } from "@/features/deliveries";
import { useSendDocuments } from "@/features/deliveries/queries";

/**
 * Certificates by email: how many of the issued ones have gone out, as one
 * bar in the tones the rest of the product uses, and the three things an
 * organiser does about it — send to whoever has none, retry what failed, or
 * send everyone theirs again — with every PDF in one ZIP beside them.
 */
type Segment = { key: string; label: string; value: number; fill: string };

function Stack({ segments, total }: { segments: Segment[]; total: number }) {
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div className="mt-3">
      <div
        role="img"
        aria-label={
          total
            ? shown.map((s) => `${s.label} ${s.value}`).join(", ")
            : "Nothing issued yet"
        }
        className="bg-sunken flex h-[9px] w-full overflow-hidden rounded-full"
      >
        {total
          ? shown.map((s) => (
              <span
                key={s.key}
                className={cn("h-full", s.fill)}
                style={{ width: `${(100 * s.value) / total}%` }}
              />
            ))
          : null}
      </div>
      {total ? (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {shown.map((s) => (
            <li
              key={s.key}
              className="text-ink-2 flex items-center gap-1.5 text-[12px]"
            >
              <span
                className={cn("size-2 rounded-full", s.fill)}
                aria-hidden="true"
              />
              {s.label}
              <span className="text-ink-3 font-mono tabular-nums">
                {formatNumber(s.value)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function CertificateSending({
  eventId,
  primary,
}: {
  eventId: number;
  /** Whether sending is the one thing left to do, so its button is the page's primary. */
  primary: boolean;
}) {
  const summary = useDeliverySummary(eventId, "certificate");
  const send = useSendDocuments(eventId, "certificate");
  const [confirmAll, setConfirmAll] = React.useState(false);

  if (summary.isPending)
    return <Skeleton className="h-[200px] w-full rounded-2xl" />;
  if (summary.isError || !summary.data)
    return (
      <FigurePanel className="p-4">
        <CardLabel>By email</CardLabel>
        <p className="text-ink-3 mt-3 text-[12.5px]">
          Could not load how the certificates went out. Reload to try again.
        </p>
      </FigurePanel>
    );

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
    <FigurePanel className="flex flex-col p-4">
      <CardLabel
        right={
          <Link
            href={`/events/${eventId}/deliveries`}
            className="text-brand hover:text-ink text-[11.5px] font-medium"
          >
            Delivery log →
          </Link>
        }
      >
        By email
      </CardLabel>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-ink font-mono text-[30px] leading-none tracking-[-0.03em] tabular-nums">
          {formatNumber(email.sent)}
        </span>
        <span className="text-ink-3 text-[12.5px]">
          of {formatNumber(total)} sent
          {email.pending ? ` · ${formatNumber(email.pending)} sending…` : ""}
          {summary.data.revoked
            ? ` · ${formatNumber(summary.data.revoked)} revoked`
            : ""}
        </span>
      </div>
      <Stack
        total={total}
        segments={[
          { key: "sent", label: "Sent", value: email.sent, fill: "bg-admit" },
          {
            key: "pending",
            label: "Sending",
            value: email.pending,
            fill: "bg-info",
          },
          {
            key: "failed",
            label: "Failed",
            value: email.failed,
            fill: "bg-refuse",
          },
          {
            key: "skipped",
            label: "No address",
            value: email.skipped,
            fill: "bg-caution",
          },
          {
            key: "unsent",
            label: "Not sent yet",
            value: email.unsent,
            fill: "bg-ink-3/40",
          },
        ]}
      />
      {unconfigured.length ? (
        <p className="text-caution mt-3 text-[12px] leading-[1.5]">
          {unconfigured.map((p) => `${p.name}: ${p.note}`).join(" ")}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <button
          type="button"
          className={cn("btn btn-sm", primary ? "btn-primary" : "btn-secondary")}
          disabled={busy || toSend === 0}
          onClick={() => send.mutate("unsent")}
          title={
            toSend === 0
              ? "Everyone issued one with an address has it"
              : undefined
          }
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          {toSend > 0
            ? `Send ${formatNumber(toSend)} ${toSend === 1 ? "certificate" : "certificates"}`
            : "All sent"}
        </button>
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
          href={bundleUrl(eventId, "certificate")}
          download
          className="btn btn-ghost btn-sm"
        >
          <DownloadIcon /> All PDFs (ZIP)
        </a>
      </div>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send every certificate again?</AlertDialogTitle>
            <AlertDialogDescription>
              {total} {total === 1 ? "guest gets" : "guests get"} their
              certificate by email again, including everyone who already has
              it. Use this after changing the design, or if the first send
              went out wrong.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as is</AlertDialogCancel>
            <AlertDialogAction onClick={() => send.mutate("all")}>
              Send to everyone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}
