"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, DoorOpenIcon, Undo2Icon, UsersIcon } from "lucide-react";
import { PageHeader, formatDateTime } from "@moa/app-kit";
import { Button, EmptyState, Pagination, Skeleton, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useEventDetail } from "@/features/events";

import { useCheckInLog, useUndoCheckIn } from "../queries";
import { VIA_LABEL } from "../schemas";

const CELL = "px-4 py-3 text-left align-top";
const chip = (on: boolean) => cn("rounded-full border px-2.5 py-1 text-[12px] transition-colors", on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted");
const ROLE: Record<string, string> = { attendee: "Attendee", speaker: "Speaker", staff: "Staff" };

/** The whole door, row by row: every admission with where, how and by whom. */
export function CheckInsPage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const [q, setQ] = React.useState("");
  const [settled, setSettled] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setSettled(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const [doorId, setDoorId] = React.useState<string | undefined>(undefined);
  const [via, setVia] = React.useState<string | undefined>(undefined);
  const [by, setBy] = React.useState<number | undefined>(undefined);
  const [order, setOrder] = React.useState<"newest" | "oldest">("newest");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const log = useCheckInLog({ eventId, q: settled || undefined, doorId, via, by, order, page, pageSize });
  const undo = useUndoCheckIn(eventId);
  const f = log.data?.facets;
  const total = log.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const reset = () => setPage(1);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={`/events/${eventId}`}>
          <ArrowLeftIcon /> {event.data?.name ?? "Back to event"}
        </Link>
      </Button>
      <PageHeader
        title="Check-ins"
        description={f ? `${f.total} admitted${f.first_at ? `, from ${formatDateTime(f.first_at)}` : ""}${f.last_at && f.total > 1 ? ` to ${formatDateTime(f.last_at)}` : ""}.` : "Every admission: where, how and by whom."}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild className={pressable}>
              <Link href={`/events/${eventId}/team`}>
                <UsersIcon /> Team &amp; doors
              </Link>
            </Button>
            <Button asChild className={pressable}>
              <Link href={`/gate/${eventId}`} target="_blank" rel="noopener">
                <DoorOpenIcon /> Open the gate
              </Link>
            </Button>
          </div>
        }
      />

      {f ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Doors">
            <button type="button" className={chip(doorId === undefined)} onClick={() => (setDoorId(undefined), reset())}>
              Every door
            </button>
            {f.doors.map((d) => (
              <button key={d.id ?? "none"} type="button" className={chip(doorId === (d.id ?? "none"))} onClick={() => (setDoorId(d.id ?? "none"), reset())} disabled={d.id === null}>
                {d.name} <span className="font-mono text-[10px] opacity-70">{d.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="How">
            <button type="button" className={chip(via === undefined)} onClick={() => (setVia(undefined), reset())}>
              Every way in
            </button>
            {f.methods.map((m) => (
              <button key={m.via} type="button" className={chip(via === m.via)} onClick={() => (setVia(m.via), reset())}>
                {VIA_LABEL[m.via] ?? m.via} <span className="font-mono text-[10px] opacity-70">{m.count}</span>
              </button>
            ))}
          </div>
          {f.staff.length ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="By whom">
              <button type="button" className={chip(by === undefined)} onClick={() => (setBy(undefined), reset())}>
                Anyone
              </button>
              {f.staff.map((s) => (
                <button key={s.id} type="button" className={chip(by === s.id)} onClick={() => (setBy(s.id), reset())}>
                  {s.name ?? "—"} <span className="font-mono text-[10px] opacity-70">{s.count}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => (setQ(e.target.value), reset())} placeholder="Search name, email or ticket" aria-label="Search the check-in log" className="h-9 w-64 rounded-md border bg-transparent px-3 text-sm" />
        <span className="flex-1" />
        <button type="button" className={chip(false)} onClick={() => (setOrder((o) => (o === "newest" ? "oldest" : "newest")), reset())}>
          {order === "newest" ? "Newest first" : "Oldest first"}
        </button>
      </div>

      {log.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : log.isError ? (
        <EmptyState tone="muted" title="Could not load the log" description={log.error.message} />
      ) : !log.data.items.length ? (
        <EmptyState tone="muted" title={f?.total ? "Nobody matches" : "Nobody checked in yet"} description={f?.total ? "Try a wider filter." : "Open the gate and scan the first ticket."} />
      ) : (
        <div className="overflow-hidden rounded-lg border-[0.5px] border-[var(--swatch-grey)]">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <tr>
                <th className={cn(CELL, "font-medium")}>Guest</th>
                <th className={cn(CELL, "font-medium")}>Door</th>
                <th className={cn(CELL, "font-medium")}>How</th>
                <th className={cn(CELL, "font-medium")}>When</th>
                <th className={cn(CELL, "font-medium")}>By</th>
                <th className={cn(CELL, "text-right font-medium")}></th>
              </tr>
            </thead>
            <tbody>
              {log.data.items.map((r) => (
                <tr key={r.id} className="border-t-[0.5px] border-[var(--swatch-grey)]">
                  <td className={CELL}>
                    <div className="font-medium">{r.name}</div>
                    <div className="font-mono text-[10.5px] text-muted-foreground">
                      {r.ticket_id} · {ROLE[r.role] ?? r.role}
                    </div>
                  </td>
                  <td className={CELL}>{r.door.name}</td>
                  <td className={CELL}>{VIA_LABEL[r.via] ?? r.via}</td>
                  <td className={cn(CELL, "whitespace-nowrap")}>
                    {formatDateTime(r.checked_in_at)}
                    {r.via === "offline_sync" ? <div className="text-[10.5px] text-muted-foreground">synced {formatDateTime(r.recorded_at)}</div> : null}
                  </td>
                  <td className={CELL}>{r.by.name ?? (r.by.kind === "KIOSK" ? "Self check-in" : "—")}</td>
                  <td className={cn(CELL, "text-right")}>
                    <Button variant="ghost" size="xs" disabled={undo.isPending} onClick={() => undo.mutate(r.registration_id)} aria-label={`Undo check-in for ${r.name}`}>
                      <Undo2Icon /> Undo
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > pageSize ? (
            <div className="border-t-[0.5px] border-[var(--swatch-grey)] px-4 py-2">
              <Pagination page={page} pageCount={pages} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={(n) => (setPageSize(n), setPage(1))} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
