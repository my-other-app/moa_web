"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2Icon, UndoIcon, WalletIcon } from "lucide-react";
import {
  ListFilters,
  ResourceList,
  formatCurrency,
  formatDateTime,
  formatNumber,
  useListParams,
} from "@moa/app-kit";
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
  Skeleton,
  StatCard,
  StatusBadge,
  buttonVariants,
  cn,
  type DataTableColumn,
  type StatusTone,
} from "@moa/ui";
import { hoverLift, pressable, stagger } from "@moa/ui/motion";

import { ExportButton } from "@/components/export-button";
import { useCan } from "@/hooks/use-can";
import { SavedViews } from "@/components/saved-views";
import { fetchPayments } from "../api";
import { usePaymentTotals, usePayments, useRefundPayment } from "../queries";
import { PAYMENT_GATEWAYS, PAYMENT_STATUSES, gatewayLabel, type Payment } from "../schemas";

/**
 * Every payment the platform has taken.
 *
 * There was no list endpoint at all, so the refund route needed an id nobody
 * could look up: support could not show a transaction, investigate a failure,
 * or find the payment behind "I paid and got nothing".
 */
const STATUS_TONE: Record<string, StatusTone> = {
  captured: "success",
  authorized: "info",
  refunded: "warning",
  failed: "destructive",
  disputed: "destructive",
  pending: "warning",
  created: "default",
};

function RefundButton({ payment }: { payment: Payment }) {
  const refund = useRefundPayment();
  const [open, setOpen] = React.useState(false);
  // Refunds move real money, so they are owner-only. Support sees the payment
  // and its status, just not the button.
  const allowed = useCan("manage_money");

  if (!allowed) {
    return <span className="text-muted-foreground text-xs">--</span>;
  }

  // The service refuses anything but a captured payment, so the row says so
  // rather than offering a button that 400s.
  if (!payment.is_refundable) {
    return <span className="text-muted-foreground text-xs">--</span>;
  }

  return (
    <>
      <Button
        size="xs"
        variant="outline"
        className={pressable}
        disabled={refund.isPending}
        onClick={() => setOpen(true)}
      >
        {refund.isPending ? <Loader2Icon className="animate-spin" /> : <UndoIcon />}
        Refund
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Refund {formatCurrency(payment.amount)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This sends the full amount back through Razorpay — partial
              refunds are not supported. It cannot be undone, the payer is not
              notified by this action, and it is recorded in the activity log
              against your name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refund.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={refund.isPending}
              onClick={(event) => {
                event.preventDefault();
                void refund.mutateAsync(payment.id).then(() => setOpen(false));
              }}
            >
              Refund in full
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const columns: DataTableColumn<Payment>[] = [
  {
    key: "payer",
    header: "Payer",
    cell: (row) => (
      <div className="min-w-0">
        {row.user?.id ? (
          <Link
            href={`/users/${row.user.id}`}
            className="block truncate font-medium underline-offset-4 hover:underline"
          >
            {row.user.full_name || row.user.email}
          </Link>
        ) : (
          <p className="truncate font-medium">Guest</p>
        )}
        <p className="text-muted-foreground truncate text-xs">
          {row.user?.email ?? "--"}
        </p>
      </div>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    cell: (row) => (
      <span className="font-medium tabular-nums">{formatCurrency(row.amount)}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => (
      <StatusBadge tone={STATUS_TONE[row.status] ?? "default"} label={row.status} />
    ),
  },
  {
    // Whose Razorpay took it. A club's own account: refunds and disputes are the club's, in its Razorpay.
    key: "gateway",
    header: "Goes to",
    cell: (row) => {
      const label = gatewayLabel(row.gateway);
      if (!label) return <span className="text-muted-foreground text-xs">--</span>;
      return <StatusBadge tone={row.gateway === "club" ? "info" : "default"} label={label} />;
    },
  },
  {
    key: "reference",
    header: "Reference",
    className: "hidden lg:table-cell",
    headerClassName: "hidden lg:table-cell",
    cell: (row) => (
      <div className="min-w-0">
        <code className="bg-muted block truncate rounded px-1.5 py-0.5 text-xs">
          {row.razorpay_payment_id ?? "--"}
        </code>
        <p className="text-muted-foreground truncate text-xs">
          {row.receipt ?? ""}
        </p>
      </div>
    ),
  },
  {
    key: "when",
    header: "When",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatDateTime(row.created_at)}
      </span>
    ),
  },
  {
    key: "actions",
    header: <span className="block text-right">Refund</span>,
    className: "text-right",
    headerClassName: "text-right",
    cell: (row) => (
      <div className="flex justify-end">
        <RefundButton payment={row} />
      </div>
    ),
  },
];

const PAYMENT_CSV = [
  { header: "Payment ID", value: (p: Payment) => p.razorpay_payment_id ?? "" },
  { header: "Receipt", value: (p: Payment) => p.receipt ?? "" },
  { header: "Payer", value: (p: Payment) => p.user?.full_name ?? "Guest" },
  { header: "Email", value: (p: Payment) => p.user?.email ?? "" },
  { header: "Amount", value: (p: Payment) => p.amount },
  { header: "Status", value: (p: Payment) => p.status },
  { header: "Goes to", value: (p: Payment) => gatewayLabel(p.gateway) ?? "" },
  { header: "Method", value: (p: Payment) => p.payment_method ?? "" },
  { header: "When", value: (p: Payment) => p.created_at },
] as const;

function Totals() {
  const { data, isPending } = usePaymentTotals();

  const cards = [
    { label: "Captured", value: data ? formatCurrency(data.captured_total) : "--" },
    { label: "Refunded", value: data ? formatCurrency(data.refunded_total) : "--" },
    {
      label: "Net",
      value: data ? formatCurrency(data.net_total) : "--",
      // Gross alone overstates what the platform kept.
      caption: "Captured less refunds",
    },
    {
      label: "Failed",
      value: data ? formatNumber(data.failed_count) : "--",
      tone: data && data.failed_count > 0 ? ("warning" as const) : undefined,
    },
  ];

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, i) => (
        <div
          key={card.label}
          style={stagger(i)}
          className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none"
        >
          <StatCard
            label={card.label}
            value={card.value}
            caption={card.caption}
            tone={card.tone}
            icon={<WalletIcon />}
            className={cn("h-full", hoverLift)}
          />
        </div>
      ))}
    </div>
  );
}

export function PaymentsTable() {
  const params = useListParams();
  const status = params.param("status");
  const gateway = params.param("gateway");

  const { data, isPending, isError } = usePayments({
    status,
    gateway,
    search: params.search || undefined,
    offset: params.offset,
    limit: params.pageSize,
  });

  return (
    <div className="space-y-6">
      <Totals />

      <ResourceList
        page={data}
        isPending={isPending}
        isError={isError}
        columns={columns}
        rowKey={(row) => row.id}
        params={params}
        searchPlaceholder="Payment, order or receipt id…"
        emptyTitle="No payments"
        emptyDescription="Payments taken through the app appear here."
        toolbar={
          <>
            <ListFilters
              params={params}
              filters={[
                {
                  key: "status",
                  label: "Status",
                  options: PAYMENT_STATUSES.map((s) => ({ value: s, label: s })),
                },
                {
                  key: "gateway",
                  label: "Goes to",
                  allLabel: "Club or MyOtherApp",
                  options: PAYMENT_GATEWAYS,
                },
              ]}
            />
            <SavedViews
              storageKey="payments"
              presets={[
                { name: "Failed", query: "status=failed" },
                { name: "Refunded", query: "status=refunded" },
              ]}
            />
          </>
        }
        actions={
          <ExportButton
            filename="payments"
            columns={PAYMENT_CSV}
            fetchPage={(offset, limit) =>
              fetchPayments({
                status,
                gateway,
                search: params.search || undefined,
                offset,
                limit,
              })
            }
          />
        }
      />
    </div>
  );
}
