"use client";

import * as React from "react";
import Link from "next/link";
import { formatCurrency, formatDate, formatDateTime } from "@moa/app-kit";
import {
  Button,
  DataTable,
  Label,
  Pager,
  SearchField,
  Segmented,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusBadge,
  Textarea,
  type DataTableColumn,
} from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { useAddDisputeNote, useDisputes } from "../queries";
import { DISPUTE_TABS, STATUS_TONE, kindLabel, statusLabel, type Dispute, type DisputeTab } from "../schemas";

const PAGE = 50;
const TAB_WORDS: Record<DisputeTab, string> = { open: "Open", closed: "Closed", all: "All" };

function Deadline({ d }: { d: Dispute }) {
  if (!d.respond_by) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className={d.overdue ? "text-destructive text-xs font-medium" : "text-xs"}>
      {formatDate(d.respond_by)}
      {d.overdue ? " · overdue" : ""}
    </span>
  );
}

function NoteForm({ disputeId }: { disputeId: number }) {
  const add = useAddDisputeNote();
  const [text, setText] = React.useState("");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) add.mutate({ id: disputeId, text: text.trim() }, { onSuccess: () => setText("") });
      }}
    >
      <Label htmlFor="dispute-note">Add a note</Label>
      <Textarea id="dispute-note" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
      <Button type="submit" size="sm" disabled={add.isPending || !text.trim()} className="self-start">
        Add note
      </Button>
    </form>
  );
}

function DisputeDetail({ dispute, onClose }: { dispute: Dispute | null; onClose: () => void }) {
  const canNote = useCan("moderate");
  return (
    <Sheet open={dispute !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {dispute ? (
          <>
            <SheetHeader>
              <SheetTitle>Dispute {dispute.razorpay_dispute_id}</SheetTitle>
              <SheetDescription>
                {kindLabel(dispute.kind)} of {formatCurrency(dispute.amount)} · {statusLabel(dispute.status)}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-6">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-ink-3">Payment</dt>
                <dd className="m-0 font-mono text-xs">
                  {dispute.razorpay_payment_id ? (
                    <Link href={`/payments?q=${encodeURIComponent(dispute.razorpay_payment_id)}`} className="underline underline-offset-2">
                      {dispute.razorpay_payment_id}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-ink-3">Club</dt>
                <dd className="m-0">{dispute.club ? <Link href={`/clubs/${dispute.club.id}`}>{dispute.club.name}</Link> : "—"}</dd>
                <dt className="text-ink-3">Event</dt>
                <dd className="m-0">{dispute.event?.name ?? "—"}</dd>
                <dt className="text-ink-3">Reason</dt>
                <dd className="m-0">{[dispute.reason_code, dispute.reason].filter(Boolean).join(" — ") || "—"}</dd>
                <dt className="text-ink-3">Phase</dt>
                <dd className="m-0">{dispute.phase ?? "—"}</dd>
                <dt className="text-ink-3">Respond by</dt>
                <dd className="m-0">
                  <Deadline d={dispute} />
                </dd>
                <dt className="text-ink-3">Held back</dt>
                <dd className="m-0">{formatCurrency(dispute.amount_deducted)}</dd>
                <dt className="text-ink-3">Opened</dt>
                <dd className="m-0">{formatDateTime(dispute.opened_at)}</dd>
                {dispute.closed_at ? (
                  <>
                    <dt className="text-ink-3">Closed</dt>
                    <dd className="m-0">{formatDateTime(dispute.closed_at)}</dd>
                  </>
                ) : null}
              </dl>
              <p className="text-ink-3 m-0 text-xs">Evidence is sent from Razorpay&apos;s dashboard, before the deadline.</p>
              <section className="flex flex-col gap-2">
                <h3 className="m-0 text-sm font-semibold">Notes</h3>
                {dispute.notes.length === 0 ? <p className="text-ink-3 m-0 text-sm">No notes yet.</p> : null}
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {dispute.notes.map((n, i) => (
                    <li key={`${n.at}-${i}`} className="bg-sunken rounded-lg px-3 py-2 text-sm">
                      <p className="m-0 whitespace-pre-wrap">{n.text}</p>
                      <p className="text-ink-3 m-0 mt-1 text-xs">
                        {n.by_name ?? "An admin"} · {formatDateTime(n.at)}
                      </p>
                    </li>
                  ))}
                </ul>
                {canNote ? <NoteForm key={dispute.id} disputeId={dispute.id} /> : null}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function DisputesPage() {
  const [tab, setTab] = React.useState<DisputeTab>("open");
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<number | null>(null);
  const { data, isPending, isError, isFetching } = useDisputes({ status: tab, q: search || undefined, offset: (page - 1) * PAGE, limit: PAGE });
  const selected = data?.items.find((d) => d.id === openId) ?? null;

  const columns: DataTableColumn<Dispute>[] = [
    {
      key: "dispute",
      header: "Dispute",
      cell: (row) => (
        <button type="button" className="text-left font-mono text-xs underline-offset-2 hover:underline" onClick={() => setOpenId(row.id)}>
          {row.razorpay_dispute_id}
          <span className="text-muted-foreground block font-sans">{kindLabel(row.kind)}</span>
        </button>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge tone={STATUS_TONE[row.status] ?? "default"} label={statusLabel(row.status)} /> },
    { key: "amount", header: "Amount", className: "text-right", headerClassName: "text-right", cell: (row) => <span className="tabular-nums">{formatCurrency(row.amount)}</span> },
    { key: "deadline", header: "Respond by", cell: (row) => <Deadline d={row} /> },
    {
      key: "payment",
      header: "Payment",
      className: "hidden lg:table-cell",
      headerClassName: "hidden lg:table-cell",
      cell: (row) => <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{row.razorpay_payment_id ?? "—"}</code>,
    },
    {
      key: "club",
      header: "Club",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.club?.name ?? "—"}</p>
          {row.event?.name ? <p className="text-muted-foreground truncate text-xs">{row.event.name}</p> : null}
        </div>
      ),
    },
    {
      key: "notes",
      header: <span className="sr-only">Notes</span>,
      className: "text-right",
      cell: (row) => (
        <Button size="xs" variant="outline" onClick={() => setOpenId(row.id)}>
          {row.notes.length ? `Notes (${row.notes.length})` : "Open"}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Which disputes"
          value={tab}
          options={DISPUTE_TABS.map((t) => ({ value: t, label: t === "open" && data ? `Open (${data.open})` : TAB_WORDS[t] }))}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
        />
        <SearchField
          label="Search disputes"
          placeholder="Dispute or payment id…"
          value={q}
          onChange={setQ}
          onCommit={(v) => {
            setSearch(v.trim());
            setPage(1);
          }}
          className="w-[260px]"
        />
      </div>
      <DataTable
        columns={columns}
        data={data?.items}
        rowKey={(row) => row.id}
        isLoading={isPending}
        isError={isError}
        emptyMessage={tab === "open" ? "No open disputes." : "No disputes."}
      />
      {data && data.total > 0 ? (
        <Pager page={page} pageCount={Math.max(1, Math.ceil(data.total / PAGE))} total={data.total} pageSize={PAGE} noun={["dispute", "disputes"]} busy={isFetching} onPage={setPage} />
      ) : null}
      <DisputeDetail dispute={selected} onClose={() => setOpenId(null)} />
    </div>
  );
}
