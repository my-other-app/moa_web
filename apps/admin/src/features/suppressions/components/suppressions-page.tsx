"use client";

import * as React from "react";
import { formatDate, formatNumber } from "@moa/app-kit";
import { Button, DataTable, NativeSelect, Pager, SearchField, StatusBadge, type DataTableColumn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import { ConfirmAction } from "@/features/ops";

import { useSuppressions, useUnblockAddress } from "../queries";
import { reasonWords, type Suppression } from "../schemas";

const PAGE = 50;

function Unblock({ row }: { row: Suppression }) {
  const unblock = useUnblockAddress();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
        Unblock
      </Button>
      <ConfirmAction
        open={open}
        onOpenChange={setOpen}
        title={`Mail ${row.email} again?`}
        description={`It ${row.reason === "complaint" ? "marked our mail as spam" : "bounced"}. Take it off only once the mailbox is known to work (or the person asked): another bounce or complaint costs the sending domain's standing. Recorded in the activity log.`}
        confirmLabel="Unblock"
        pending={unblock.isPending}
        onConfirm={() => unblock.mutate(row.email, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}

/**
 * The platform's "do not mail" list: addresses that hard-bounced or marked
 * our mail as spam, from SES and Resend. Event mail skips them; account
 * mail (a reset, a code) still goes.
 */
export function SuppressionsPage() {
  const canAct = useCan("moderate");
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [page, setPage] = React.useState(1);
  const { data, isPending, isError, isFetching } = useSuppressions({ q: search || undefined, reason: reason || undefined, offset: (page - 1) * PAGE, limit: PAGE });

  const columns: DataTableColumn<Suppression>[] = [
    { key: "email", header: "Address", cell: (r) => <span className="font-mono text-xs break-all">{r.email}</span> },
    { key: "reason", header: "Why", cell: (r) => <StatusBadge tone={r.reason === "complaint" ? "destructive" : "warning"} label={reasonWords(r.reason)} /> },
    {
      key: "detail",
      header: "The provider said",
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (r) => <span className="text-ink-2 line-clamp-2 text-xs">{r.detail ?? "—"}</span>,
    },
    { key: "since", header: "Since", cell: (r) => <span className="text-xs">{formatDate(r.created_at)}</span> },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "text-right", cell: (r) => (canAct ? <Unblock row={r} /> : null) },
  ];

  return (
    <div className="flex flex-col gap-4">
      {data ? (
        <p className="text-ink-3 m-0 text-sm" role="status">
          {formatNumber(data.counts.bounce)} bounced · {formatNumber(data.counts.complaint)} marked as spam · {formatNumber(data.counts.last_30_days)} added in the last 30 days
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          label="Search addresses"
          placeholder="Part of an address…"
          value={q}
          onChange={setQ}
          onCommit={(v) => {
            setSearch(v.trim());
            setPage(1);
          }}
          className="w-[260px]"
        />
        <NativeSelect
          aria-label="Reason"
          size="sm"
          className="w-auto"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Any reason</option>
          <option value="bounce">Bounced</option>
          <option value="complaint">Marked as spam</option>
        </NativeSelect>
      </div>
      <DataTable columns={columns} data={data?.items} rowKey={(r) => r.email} isLoading={isPending} isError={isError} emptyMessage={search || reason ? "No address matches." : "Nobody is on the list."} />
      {data && data.total > 0 ? (
        <Pager page={page} pageCount={Math.max(1, Math.ceil(data.total / PAGE))} total={data.total} pageSize={PAGE} noun={["address", "addresses"]} busy={isFetching} onPage={setPage} />
      ) : null}
    </div>
  );
}
