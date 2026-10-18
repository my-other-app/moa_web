"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLinkIcon, Loader2Icon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { ListFilters, ResourceList, formatDateTime, relativeTime, useListParams } from "@moa/app-kit";
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
  StatusBadge,
  buttonVariants,
  cn,
  type DataTableColumn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useCan } from "@/hooks/use-can";

import { useClubDomains, useRecheckClubDomain, useRemoveClubDomain } from "../queries";
import { DOMAIN_STATUSES, STATUS_LABEL, canAct, sslLabel, statusLabel, statusTone, type ClubDomainRow } from "../schemas";

/**
 * Clubs' websites on domains of their own, and the two things an admin may
 * do about one: look at its DNS now (Re-check), or take it off (Remove,
 * for moderators and up, which the server checks too). Removing one sends
 * the club's visitors back to {slug}.myotherapp.in.
 */
function RecheckButton({ row }: { row: ClubDomainRow }) {
  const recheck = useRecheckClubDomain();
  return (
    <Button size="xs" variant="outline" className={pressable} disabled={recheck.isPending} onClick={() => recheck.mutate(row)} aria-label={`Re-check ${row.host}`}>
      {recheck.isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
      Re-check
    </Button>
  );
}

function RemoveButton({ row }: { row: ClubDomainRow }) {
  const remove = useRemoveClubDomain();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button size="xs" variant="outline" className={pressable} disabled={remove.isPending} onClick={() => setOpen(true)} aria-label={`Remove ${row.host}`}>
        {remove.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
        Remove
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {row.host}?</AlertDialogTitle>
            <AlertDialogDescription>
              {row.club.name}&apos;s website stops answering at {row.host} and goes back to its MyOtherApp address{row.club.slug ? ` (${row.club.slug}.myotherapp.in)` : ""}. The club can connect a domain again from its dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                remove.mutate(row, { onSettled: () => setOpen(false) });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Actions({ row }: { row: ClubDomainRow }) {
  const moderate = useCan("moderate");
  if (!canAct(row)) return <span className="text-muted-foreground text-xs">--</span>;
  return (
    <div className="flex justify-end gap-1.5">
      <RecheckButton row={row} />
      {moderate ? <RemoveButton row={row} /> : null}
    </div>
  );
}

const columns: DataTableColumn<ClubDomainRow>[] = [
  {
    key: "club",
    header: "Club",
    cell: (row) => (
      <div className="min-w-0">
        <Link href={`/clubs/${row.club.id}`} className="block truncate font-medium underline-offset-4 hover:underline">
          {row.club.name}
        </Link>
        {row.club.slug ? <p className="text-muted-foreground truncate text-xs">{row.club.slug}</p> : null}
      </div>
    ),
  },
  {
    key: "host",
    header: "Domain",
    cell: (row) => (
      <div className="flex min-w-0 items-center gap-1">
        <code className="bg-muted truncate rounded px-1.5 py-0.5 text-xs">{row.host}</code>
        {row.status === "active" ? (
          <a href={`https://${row.host}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground shrink-0" aria-label={`Open ${row.host}`}>
            <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : null}
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge tone={statusTone(row.status)} label={statusLabel(row.status)} />,
  },
  {
    key: "ssl",
    header: "SSL",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => {
      const ssl = sslLabel(row.ssl_status);
      return ssl ? <StatusBadge tone={ssl.tone} label={ssl.label} /> : <span className="text-muted-foreground text-xs">--</span>;
    },
  },
  {
    key: "error",
    header: "Error",
    className: "hidden xl:table-cell max-w-[260px]",
    headerClassName: "hidden xl:table-cell",
    cell: (row) =>
      row.last_error ? (
        <p className="text-refuse truncate text-xs" title={row.last_error}>
          {row.last_error}
        </p>
      ) : (
        <span className="text-muted-foreground text-xs">--</span>
      ),
  },
  {
    key: "verified",
    header: "Verified",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) =>
      row.verified_at ? (
        <time dateTime={row.verified_at} title={formatDateTime(row.verified_at)} className="text-muted-foreground text-xs tabular-nums">
          {relativeTime(row.verified_at)}
        </time>
      ) : (
        <span className="text-muted-foreground text-xs">Not yet</span>
      ),
  },
  {
    key: "actions",
    header: <span className="block text-right">Action</span>,
    className: "text-right",
    headerClassName: "text-right",
    cell: (row) => <Actions row={row} />,
  },
];

export function ClubDomainsList() {
  const params = useListParams();
  const status = params.param("status");

  const { data, isPending, isError } = useClubDomains({
    status,
    search: params.search || undefined,
    offset: params.offset,
    limit: params.pageSize,
  });

  return (
    <ResourceList
      page={data}
      isPending={isPending}
      isError={isError}
      columns={columns}
      rowKey={(row) => row.id}
      params={params}
      searchPlaceholder="Club, slug or domain…"
      emptyTitle={status ? "No domains match" : "No club has its own domain yet"}
      emptyDescription={status ? "Clear the status filter to see the rest." : "Clubs on Growth and up connect one from Website in their dashboard. Until then their sites are at {slug}.myotherapp.in."}
      toolbar={
        <ListFilters
          params={params}
          filters={[
            {
              key: "status",
              label: "Status",
              options: DOMAIN_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
            },
          ]}
        />
      }
    />
  );
}
