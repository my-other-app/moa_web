"use client";

import * as React from "react";
import Link from "next/link";
import { BanIcon, Loader2Icon } from "lucide-react";
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

import { useDisableGateway, useGateways } from "../queries";
import { GATEWAY_STATUSES, STATUS_LABEL, canDisable, statusLabel, statusTone, type GatewayRow } from "../schemas";

/**
 * Clubs that take ticket payments in their own Razorpay account, and the
 * switch that sends a club's new payments back to MyOtherApp's.
 *
 * Disabling moves money, so it is for roles that handle money; support and
 * viewers see the list without it. The server checks the same.
 */
function DisableButton({ row }: { row: GatewayRow }) {
  const disable = useDisableGateway();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button size="xs" variant="outline" className={pressable} disabled={disable.isPending} onClick={() => setOpen(true)} aria-label={`Disable Razorpay for ${row.club.name}`}>
        {disable.isPending ? <Loader2Icon className="animate-spin" /> : <BanIcon />}
        Disable
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {row.club.name}&apos;s Razorpay?</AlertDialogTitle>
            <AlertDialogDescription>
              The club&apos;s new payments go to MyOtherApp&apos;s account. Payments already made stay in the club&apos;s own Razorpay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disable.isPending}>Keep it on</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={disable.isPending}
              onClick={(event) => {
                event.preventDefault();
                disable.mutate(row.club.id, { onSuccess: () => setOpen(false) });
              }}
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Actions({ row }: { row: GatewayRow }) {
  const allowed = useCan("manage_money");
  if (!allowed || !canDisable(row)) return <span className="text-muted-foreground text-xs">--</span>;
  return <DisableButton row={row} />;
}

function Ago({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {relativeTime(iso)}
    </time>
  );
}

const columns: DataTableColumn<GatewayRow>[] = [
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
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge tone={statusTone(row.status)} label={statusLabel(row.status)} />,
  },
  {
    key: "key",
    header: "Key",
    className: "hidden lg:table-cell",
    headerClassName: "hidden lg:table-cell",
    cell: (row) => <code className="bg-muted block truncate rounded px-1.5 py-0.5 text-xs">{row.key_id ?? "--"}</code>,
  },
  {
    key: "verified",
    header: "Verified",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => <span className="text-muted-foreground text-xs tabular-nums">{row.verified_at ? formatDateTime(row.verified_at) : "--"}</span>,
  },
  {
    key: "webhook",
    header: "Last webhook",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) =>
      row.last_webhook_at ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          <Ago iso={row.last_webhook_at} />
        </span>
      ) : (
        // Taking payments, but we would not hear of them: worth a glance.
        <span className={cn("text-xs", row.status === "active" ? "text-caution font-medium" : "text-muted-foreground")}>None yet</span>
      ),
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
    key: "actions",
    header: <span className="block text-right">Action</span>,
    className: "text-right",
    headerClassName: "text-right",
    cell: (row) => (
      <div className="flex justify-end">
        <Actions row={row} />
      </div>
    ),
  },
];

export function GatewaysList() {
  const params = useListParams();
  const status = params.param("status");

  const { data, isPending, isError } = useGateways({
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
      rowKey={(row) => row.club.id}
      params={params}
      searchPlaceholder="Club name or slug…"
      emptyTitle={status ? "No gateways match" : "No club has its own Razorpay yet"}
      emptyDescription={status ? "Clear the status filter to see the rest." : "Clubs connect one from Payments in their dashboard. Until then they take payments through MyOtherApp's account."}
      toolbar={
        <ListFilters
          params={params}
          filters={[
            {
              key: "status",
              label: "Status",
              options: GATEWAY_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
            },
          ]}
        />
      }
    />
  );
}
