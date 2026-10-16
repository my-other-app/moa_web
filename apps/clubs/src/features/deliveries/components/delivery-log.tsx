"use client";

import * as React from "react";
import Link from "next/link";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { PageHeader, formatDateTime } from "@moa/app-kit";
import {
  Button,
  Chip,
  cn,
  EmptyState,
  Pager,
  Segmented,
  Skeleton,
  StatusBadge,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useEventDetail } from "@/features/events";

import { fetchDeliveryLog, type DeliveryLogQuery } from "../api";
import { useDeliveryLog } from "../queries";
import { type DeliveryLogRow, verdictOf } from "../schemas";

const csvCell = (v: string | null | undefined) =>
  `"${(v ?? "").replace(/"/g, '""')}"`;
const CELL = "px-4 py-3 text-left align-top";
const KINDS: { value: DeliveryLogQuery["kind"]; label: string }[] = [
  { value: undefined, label: "Everything" },
  { value: "ticket", label: "Tickets" },
  { value: "certificate", label: "Certificates" },
  { value: "message", label: "Messages" },
];

/**
 * Every send to every guest, newest first. The tally is always the whole
 * event's, so narrowing to the failures never makes the number look smaller
 * than it is.
 */
export function DeliveryLog({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const [problem, setProblem] = React.useState(false);
  const [kind, setKind] = React.useState<DeliveryLogQuery["kind"]>(undefined);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [downloading, setDownloading] = React.useState(false);
  const q = {
    eventId,
    kind,
    problem,
    search: search.trim() || undefined,
    page,
    pageSize,
  };
  const log = useDeliveryLog(q);

  const tally = log.data?.tally;
  const items = log.data?.items ?? [];
  const total = log.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const download = async () => {
    setDownloading(true);
    try {
      const rows: DeliveryLogRow[] = [];
      // Walk the pages rather than asking for everything at once: a busy event
      // is thousands of sends, and this is a file somebody waits for.
      for (let p = 1; p <= 200; p++) {
        const res = await fetchDeliveryLog({ ...q, page: p, pageSize: 200 });
        rows.push(...res.items);
        if (rows.length >= res.total || !res.items.length) break;
      }
      const csv = [
        [
          "Guest",
          "Ticket",
          "Address",
          "Channel",
          "What",
          "Sent",
          "Outcome",
          "Reason",
        ].join(","),
        ...rows.map((r) =>
          [
            csvCell(r.name),
            csvCell(r.ticket_id),
            csvCell(r.address),
            csvCell(r.channel),
            csvCell(r.kind === "message" ? `message: ${r.what ?? ""}` : r.kind),
            csvCell(r.sent_at ? formatDateTime(r.sent_at) : ""),
            csvCell(verdictOf(r).label),
            csvCell(r.reason),
          ].join(","),
        ),
      ].join("\n");
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${event.data?.slug ?? `event-${eventId}`}-delivery-log${problem ? "-problems" : ""}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Delivery log"
        description="Every ticket and certificate sent to a guest, with what became of it."
        action={
          <Button
            variant="outline"
            size="sm"
            className={pressable}
            disabled={downloading || !total}
            onClick={download}
          >
            {downloading ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <DownloadIcon />
            )}{" "}
            Download CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
          <span>{tally?.sent ?? "…"} sent</span>
          {tally?.delivered ? (
            <span className="text-emerald-600">
              {tally.delivered} delivered
            </span>
          ) : null}
          {tally?.pending ? <span>{tally.pending} sending</span> : null}
          {tally?.bounced ? (
            <span className="text-destructive">{tally.bounced} bounced</span>
          ) : null}
          {tally?.complained ? (
            <span className="text-destructive">{tally.complained} spam</span>
          ) : null}
          {tally?.failed ? (
            <span className="text-destructive">{tally.failed} refused</span>
          ) : null}
          {tally?.skipped ? <span>{tally.skipped} skipped</span> : null}
        </div>
        <span className="flex-1" />
        <Segmented
          label="What was sent"
          value={kind ?? "all"}
          options={KINDS.map((k) => ({
            value: k.value ?? "all",
            label: k.label,
          }))}
          onChange={(v) => {
            setKind(
              v === "all" ? undefined : (v as Exclude<typeof kind, undefined>),
            );
            setPage(1);
          }}
        />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search name, email or ticket"
          aria-label="Search the delivery log"
          className="input w-64"
        />
        <Chip
          active={problem}
          onClick={() => {
            setProblem((p) => !p);
            setPage(1);
          }}
        >
          Only problems
        </Chip>
      </div>

      {log.isPending ? (
        <Skeleton className="h-[320px] w-full rounded-lg" />
      ) : !items.length ? (
        <div className="rounded-2xl bg-card ring-1 ring-border/70 shadow-sm p-10">
          <EmptyState
            tone="muted"
            title={
              problem
                ? "Nothing went wrong"
                : search
                  ? "Nobody matches"
                  : "Nothing sent yet"
            }
            description={
              problem
                ? "Every send so far was accepted."
                : search
                  ? "Try a shorter search."
                  : "Tickets appear here as they go out, with what became of each one."
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/70 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted/60 text-[13px] font-medium text-muted-foreground">
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Guest
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    What
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Sent
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Outcome
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const v = verdictOf(r);
                  return (
                    <tr key={r.id} className="border-t border-border/60">
                      <td className={CELL}>
                        <div className="text-foreground">{r.name}</div>
                        <div className="text-muted-foreground font-mono text-xs">
                          {r.address || "— no address —"}
                        </div>
                      </td>
                      <td className={CELL}>
                        <div
                          className={
                            r.kind === "message" ? undefined : "capitalize"
                          }
                        >
                          {r.kind === "message"
                            ? (r.what ?? "Message")
                            : r.kind}
                        </div>
                        <div className="text-muted-foreground font-mono text-xs">
                          {r.ticket_id} · {r.channel}
                          {r.attempts > 1 ? ` · ${r.attempts} attempts` : ""}
                        </div>
                      </td>
                      <td
                        className={cn(
                          CELL,
                          "text-muted-foreground font-mono text-xs whitespace-nowrap tabular-nums",
                        )}
                      >
                        {r.sent_at ? formatDateTime(r.sent_at) : "—"}
                      </td>
                      <td className={CELL}>
                        <StatusBadge tone={v.tone} label={v.label} />
                        {r.reason ? (
                          <div className="text-muted-foreground mt-1 max-w-[360px] text-xs leading-snug">
                            {r.reason}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!log.isPending && total > 0 ? (
        <Pager
          page={page}
          pageCount={pages}
          total={total}
          pageSize={pageSize}
          noun={["send", "sends"]}
          busy={log.isFetching}
          onPage={setPage}
          onPageSize={(n) => (setPageSize(n), setPage(1))}
        />
      ) : null}
    </div>
  );
}
