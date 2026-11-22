"use client";

import * as React from "react";
import { CircleXIcon, PrinterIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { Button, CardLabel, EmptyState, FigurePanel, Skeleton, StatusBadge, cn } from "@moa/ui";

import { cardPdfUrl, openPdf } from "@/features/idcards";
import { useRegistrations } from "@/features/registrations/queries";

import { createPrintRequest } from "../api";
import { onlineCount, useCancelPrintRequest, usePrinters, usePrintQueue, useRetryPrintRequest } from "../queries";
import { SOURCE_WORDS, STATUS_WORDS, type PrintRequest, type PrintStatus } from "../schemas";
import { PrintChoice } from "./print-choice";

const TONE: Record<PrintStatus, "default" | "success" | "warning" | "destructive" | "info"> = {
  queued: "info",
  printing: "warning",
  printed: "success",
  failed: "destructive",
  cancelled: "default",
};

function RequestRow({ r, onRetry, onCancel, busy }: { r: PrintRequest; onRetry: () => void; onCancel: () => void; busy: boolean }) {
  const name = r.name || "A guest";
  const canRetry = r.status === "failed" || r.status === "cancelled";
  const canCancel = r.status === "queued" || r.status === "printing";
  return (
    <li className="border-line-soft flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3">
      <div className="min-w-[180px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink truncate text-[13.5px] font-medium">{name}</span>
          <StatusBadge tone={TONE[r.status]} label={r.status === "queued" && r.position ? `${STATUS_WORDS.queued} · no. ${r.position}` : STATUS_WORDS[r.status]} />
        </div>
        <p className="text-ink-3 mt-0.5 truncate text-[12px]">
          {[SOURCE_WORDS[r.source] ?? r.source, r.ticket_code, r.attempts > 1 ? `${r.attempts} tries` : null, r.printer?.name, r.created_at ? formatDateTime(r.created_at) : null].filter(Boolean).join(" · ")}
        </p>
        {r.error ? <p className="text-refuse mt-0.5 text-[12px]">{r.error}</p> : null}
      </div>
      {canRetry ? (
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onRetry} aria-label={`Retry ${name}'s card`}>
          <RotateCcwIcon /> Retry
        </Button>
      ) : null}
      {canCancel ? (
        <Button type="button" size="sm" variant="secondary" danger disabled={busy} onClick={onCancel} aria-label={`Cancel ${name}'s card`}>
          <CircleXIcon /> Cancel
        </Button>
      ) : null}
    </li>
  );
}

/** Send one guest's card: search the list, pick the guest, choose where it prints. */
function SendOne({ eventId, stationOnline }: { eventId: number; stationOnline: boolean }) {
  const [q, setQ] = React.useState("");
  const [settled, setSettled] = React.useState("");
  const [pick, setPick] = React.useState<{ id: string; name: string } | null>(null);
  React.useEffect(() => {
    const t = setTimeout(() => setSettled(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const search = settled.length >= 3;
  const list = useRegistrations({ eventId, search: search ? settled : undefined, offset: 0, limit: 5 });
  const rows = search ? (list.data?.items ?? []) : [];
  const nameOf = (r: (typeof rows)[number]) => r.full_name || r.name || "Unknown";
  return (
    <div className="border-line-soft border-t px-4 py-3">
      <label htmlFor={`send-one-${eventId}`} className="eyebrow mb-1.5 block">
        Send one guest&apos;s card
      </label>
      <div className="search">
        <SearchIcon aria-hidden="true" />
        <input id={`send-one-${eventId}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or ticket" autoComplete="off" />
      </div>
      {search && rows.length ? (
        <ul className="divide-line-soft mt-2 divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <span className="text-ink min-w-0 flex-1 truncate text-[13px]">{nameOf(r)}</span>
              <Button type="button" size="sm" variant="secondary" aria-label={`Print card for ${nameOf(r)}`} onClick={() => setPick({ id: r.id, name: nameOf(r) })}>
                <PrinterIcon /> Print
              </Button>
            </li>
          ))}
        </ul>
      ) : search && !list.isFetching ? (
        <p className="text-ink-3 mt-2 text-[12px]">Nobody on the list matches.</p>
      ) : null}
      {pick ? (
        <PrintChoice
          name={pick.name}
          open
          onClose={() => setPick(null)}
          send={(override) => createPrintRequest(eventId, { registration_id: pick.id, override })}
          onLocal={() => openPdf(cardPdfUrl(eventId, pick.id, { source: "manual", record: true }))}
        />
      ) : null}
      {!stationOnline ? <p className="text-ink-3 mt-2 text-[12px]">No print station is online, so a card is sent to the queue only when one connects.</p> : null}
    </div>
  );
}

/** Event → ID cards: the print stations, and the queue of cards waiting for them, each with Retry and Cancel. */
export function PrintQueuePanel({ eventId }: { eventId: number }) {
  const printers = usePrinters(eventId);
  const queue = usePrintQueue(eventId);
  const retry = useRetryPrintRequest(eventId);
  const cancel = useCancelPrintRequest(eventId);
  const online = onlineCount(printers.data);
  const items = queue.data?.items ?? [];
  const open = items.filter((r) => r.status === "queued" || r.status === "printing").length;
  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="px-4 pt-4">
        <CardLabel right={<span className="text-ink-3 font-mono text-[11px]">{open ? `${open} waiting` : "nothing waiting"}</span>}>Print stations &amp; queue</CardLabel>
        <p className="text-ink-3 mt-1 text-[12px] leading-[1.5]">A print station is a laptop with a printer that prints the cards sent to it, with nobody clicking. Add one under Team &amp; doors.</p>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2 px-4 pb-3" aria-label="Print stations">
        {printers.isPending ? (
          <Skeleton className="h-7 w-40 rounded-full" />
        ) : printers.data?.length ? (
          printers.data.map((p) => (
            <li key={p.id} className="bg-sunken text-ink-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px]">
              <span aria-hidden="true" className={cn("size-2 rounded-full", p.online ? "bg-admit" : "bg-ink-3")} />
              {p.name}
              <span className="text-ink-3">{p.online ? "online" : "offline"}</span>
            </li>
          ))
        ) : (
          <li className="text-ink-3 text-[12.5px]">{printers.isError ? "Could not read the print stations." : "No print station paired yet."}</li>
        )}
      </ul>
      {queue.isPending ? (
        <div className="p-4">
          <Skeleton className="h-14" />
        </div>
      ) : queue.isError ? (
        <EmptyState size="sm" title="Could not load the queue" description="It tries again every few seconds." />
      ) : items.length ? (
        <ul>
          {items.map((r) => (
            <RequestRow key={r.id} r={r} busy={retry.isPending || cancel.isPending} onRetry={() => retry.mutate(r.id)} onCancel={() => cancel.mutate(r.id)} />
          ))}
        </ul>
      ) : (
        <EmptyState size="sm" icon={<PrinterIcon />} title="Nothing in the queue" description="Cards sent from the kiosk, the door or the guest list show up here." />
      )}
      <SendOne eventId={eventId} stationOnline={online > 0} />
    </FigurePanel>
  );
}
